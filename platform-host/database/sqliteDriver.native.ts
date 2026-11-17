import {NativeModules} from 'react-native';
import {identifier,recordId,validateScope,validateBatch} from './contracts.ts';
import type {DataDriver,DataScope,DataRow,WriteReceipt} from './contracts';
type Bridge={request(operation:string,scope:string,input:string):Promise<string>};
/** Android fixed-operation protocol; no raw query/SQL is exported to business modules. */
export function createNativeSqliteDriver(bridge:Bridge=NativeModules.LeaderDatabase):DataDriver{
  if(!bridge?.request)throw Error('Native subject database unavailable');
  const call=async<T>(operation:string,scope:DataScope,input:unknown):Promise<T>=>{validateScope(scope);return JSON.parse(await bridge.request(operation,JSON.stringify(scope),JSON.stringify(input))) as T;};
  return{
    close:scope=>call<void>('close',scope,null),
    fork:async(source,target)=>{if(source!==null){validateScope(source);if(source.company!==target.company||source.user!==target.user)throw Error('Cross-tenant data copy');}await call<void>('fork',target,source);},
    schema:(scope,module)=>call<number>('schema',scope,{module:identifier(module)}),
    read:(scope,module,schema,collection,id)=>call<DataRow|null>('read',scope,{module:identifier(module),schema,collection:identifier(collection),id:recordId(id)}),
    list:(scope,module,schema,collection,limit,after)=>{if(!Number.isSafeInteger(limit)||limit<1||limit>256)throw Error('Invalid page size');if(after!==undefined)recordId(after);return call<DataRow[]>('list',scope,{module:identifier(module),schema,collection:identifier(collection),limit,...(after===undefined?{}:{after})});},
    write:(scope,batch)=>{validateBatch(batch);return call<WriteReceipt[]>('write',scope,batch);},
    verify:async(scope,schemas)=>{for(const module of Object.keys(schemas))identifier(module);await call<void>('verify',scope,schemas);},
  };
}
