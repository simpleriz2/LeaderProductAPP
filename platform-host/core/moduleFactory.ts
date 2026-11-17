import type {ComponentType} from 'react';
import type {ModuleLifecycle,SessionLease} from './sessionCoordinator';
import type {ServiceRouter} from './serviceRouter';
import type {DatabaseSession,ModuleDatabase} from '../database/moduleDatabase';
import type {ReleaseSet} from './releaseSet';
export type ModuleDataView={readonly scope:DatabaseSession['scope'];module(owner:string):ModuleDatabase};
export type ModuleHostPorts={readonly lease:SessionLease;readonly data:ModuleDataView;company(signal:AbortSignal):ReturnType<ServiceRouter['forCompanyRelease']>;createOperationId():string};
export type RemoteModuleInstance=ModuleLifecycle&{Screen:ComponentType};
export type RemoteModuleFactory={readonly id:string;readonly version:string;readonly contract:string;readonly schema:number;create(ports:ModuleHostPorts):RemoteModuleInstance};
/** One owned module view, no account-wide dispose or opening another feature's collections. */
export function createOwnedModuleData(database:DatabaseSession,owner:string):ModuleDataView{
 const owned=database.module(owner);
 return Object.freeze({scope:database.scope,module:(requested:string)=>{if(requested!==owner)throw Error('Foreign module data denied');return owned;}});
}
/** Metadata must match the signed artifact before the host supplies any session/data/service ports. */
export function validateRemoteModuleFactory(value:unknown,artifact:ReleaseSet['artifacts'][number]):RemoteModuleFactory{
 if(!value||typeof value!=='object')throw Error('Invalid module factory');
 const factory=value as RemoteModuleFactory;
 const {module:id,version,contract,schema}=artifact;
 if(factory.id!==id||factory.version!==version||factory.contract!==contract||factory.schema!==schema||typeof factory.create!=='function')throw Error('Module factory differs from signed contract');
 const create=factory.create.bind(factory);
 return Object.freeze({id,version,contract,schema,create(ports:ModuleHostPorts){
  ports.lease.assertCurrent();if(!ports.lease.session.modules.includes(id)||ports.data.scope.company!==ports.lease.session.company||ports.data.scope.user!==ports.lease.session.user)throw Error('Module ports subject mismatch');
  const instance=create(ports);ports.lease.assertCurrent();
  if(!instance||instance.id!==id||typeof instance.requiresOnline!=='boolean'||typeof instance.Screen!=='function'||['init','activate','suspend','dispose'].some(name=>typeof instance[name as keyof ModuleLifecycle]!=='function'))throw Error('Invalid module lifecycle contract');
  return Object.freeze({id:instance.id,requiresOnline:instance.requiresOnline,Screen:instance.Screen,init:instance.init.bind(instance),activate:instance.activate.bind(instance),suspend:instance.suspend.bind(instance),dispose:instance.dispose.bind(instance)});
 }});
}
