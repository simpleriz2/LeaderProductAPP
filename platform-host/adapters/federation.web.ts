import {validateRemoteModuleFactory} from '../core/moduleFactory.ts';
import React from 'react';
import * as ReactNative from 'react-native';
import {createInstance} from '@module-federation/enhanced/runtime';
import type {ComponentType} from 'react';
import type {Activation,ReleaseContext,ReleasePorts} from '../core/releaseSet';
import {verifyInstalled} from '../core/releaseBootstrap';

const executionKey=Symbol.for('lp2.executing-federation-set');
/** First Web execution profile: ONE self-contained JS container per module, no external chunks/assets.
 * Trusted first-party code shares the page runtime; this is not a sandbox. Replacing a set requires reload.
 */
export async function openVerifiedWebFederation(activation:Activation,context:ReleaseContext,ports:ReleasePorts,verifyData:(activation:Activation)=>Promise<void>){
  if(context.platform!=='web')throw Error('Web federation requires Web release');
  const realm=globalThis as typeof globalThis & {[executionKey]?:boolean};
  if(realm[executionKey])throw Error('Federation set already started; reload required');
  await verifyInstalled(activation,context,ports,verifyData);ports.checkpoint();
  const snapshots: {name:string;bytes:Uint8Array}[]=[];
  for(const module of activation.release.artifacts){
    if(module.assets.length!==0||module.name!==`${module.module}.container.js`)throw Error('Unsupported Web execution package profile');
    const bytes=await ports.storage.cachedFile(context.company,context.user,module);ports.checkpoint();
    if(!bytes||bytes.length!==module.size||await ports.trust.sha256(bytes)!==module.digest)throw Error('Corrupt execution snapshot');
    ports.checkpoint();snapshots.push({name:module.module,bytes:bytes.slice()});
  }
  async function current(){
    ports.checkpoint();const actual=await ports.storage.current(context.company,context.user);ports.checkpoint();
    if(JSON.stringify(actual)!==JSON.stringify(activation))throw Error('Activation changed; reload required');
  }
  await current();
  // Reserve the whole document before any executable bytes are exposed; even failed startup needs reload.
  if(realm[executionKey])throw Error('Federation set already started; reload required');
  realm[executionKey]=true;
  const urls:string[]=[];let disposed=false;
  try{
    const remotes=snapshots.map(({name,bytes})=>{
      const entry=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'text/javascript'}));urls.push(entry);
      return{name:`lp2_${name}`,entry,type:'global',entryGlobalName:`lp2_${name}`};
    });
    const instance=createInstance({name:`lp2_host_${crypto.randomUUID()}`,remotes,shared:{
      react:{version:'19.3.0',lib:()=>React,shareConfig:{singleton:true,strictVersion:true,requiredVersion:'19.3.0'}},
      'react-native':{version:'0.21.4',lib:()=>ReactNative,shareConfig:{singleton:true,strictVersion:true,requiredVersion:'0.21.4'}},
    }});
    return{
      async screen(module:string):Promise<ComponentType>{
        if(disposed)throw Error('Federation disposed; reload required');
        if(!snapshots.some(item=>item.name===module))throw Error('Module not in verified set');
        await current();
        const loaded=await instance.loadRemote<{default:ComponentType}>(`lp2_${module}/Screen`);
        await current();
        if(disposed||!loaded||typeof loaded.default!=='function')throw Error('Invalid module Screen contract');
        return loaded.default;
      },
      async factory(module:string){
        if(disposed)throw Error('Federation disposed; reload required');
        const artifact=activation.release.artifacts.find(item=>item.module===module);if(!artifact)throw Error('Module not in verified set');
        await current();const loaded=await instance.loadRemote<{default:unknown}>(`lp2_${module}/Module`);await current();
        if(disposed||!loaded)throw Error('Module factory unavailable');return validateRemoteModuleFactory(loaded.default,artifact);
      },
      /** Stops future loads, releases Blob URLs; executing code must be stopped by lifecycle coordinator. */
      dispose(){disposed=true;for(const url of urls)URL.revokeObjectURL(url);},
    };
  }catch(error){for(const url of urls)URL.revokeObjectURL(url);throw error;}
}
