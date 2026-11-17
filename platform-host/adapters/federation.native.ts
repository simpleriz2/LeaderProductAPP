import {NativeModules} from 'react-native';
import {ScriptManager} from '@callstack/repack/client';
import {getInstance} from '@module-federation/enhanced/runtime';
import type {ComponentType} from 'react';
import type {Activation,ReleaseContext,ReleasePorts} from '../core/releaseSet';
import {verifyInstalled} from '../core/releaseBootstrap';
import {createNativeScriptResolver,type NativeExecutionFiles} from '../core/nativeScriptResolver';
const executionKey=Symbol.for('lp2.executing-native-federation-set');
/** Native compilation/ports tested; actual device execution acceptance still required. */
export async function openVerifiedNativeFederation(activation:Activation,context:ReleaseContext,ports:ReleasePorts,verifyData:(activation:Activation)=>Promise<void>,files:NativeExecutionFiles=NativeModules.LeaderReleaseStorage){
  if(context.platform!=='android'||!files?.verifiedFile)throw Error('Native execution unavailable');
  const realm=globalThis as typeof globalThis & {[executionKey]?:boolean};
  if(realm[executionKey])throw Error('Native federation already started; restart required');
  await verifyInstalled(activation,context,ports,verifyData);ports.checkpoint();
  let disposed=false;
  async function current(){if(disposed)throw Error('Native federation disposed; restart required');ports.checkpoint();const actual=await ports.storage.current(context.company,context.user);ports.checkpoint();if(disposed)throw Error('Native federation disposed; restart required');if(JSON.stringify(actual)!==JSON.stringify(activation))throw Error('Activation changed; restart required');}
  await current();const instance=getInstance();if(!instance)throw Error('Re.Pack MF host runtime unavailable');
  if(realm[executionKey])throw Error('Native federation already started; restart required');realm[executionKey]=true;
  const resolver=createNativeScriptResolver(activation,files,current);
  // This highest-priority resolver returns a verified local file or throws for EVERY script.
  // It must stay installed on disposal so lower-priority inherited resolvers can never take over.
  ScriptManager.shared.addResolver((scriptId,caller)=>resolver.resolve(scriptId,caller),{key:'lp2-verified-set',priority:Number.MAX_SAFE_INTEGER});
  instance.registerRemotes(activation.release.artifacts.map(a=>({name:a.module,entry:`lp2-verified://${a.module}/${a.name}`,type:'global',entryGlobalName:a.module})));
  return{
    async screen(module:string):Promise<ComponentType>{
      if(!activation.release.artifacts.some(a=>a.module===module))throw Error('Module not in verified set');
      await current();const loaded=await instance.loadRemote<{default:ComponentType}>(`${module}/Screen`);await current();
      if(!loaded||typeof loaded.default!=='function')throw Error('Invalid module Screen contract');return loaded.default;
    },
    dispose(){disposed=true;resolver.dispose();},
  };
}
