import {validateRemoteModuleFactory,createOwnedModuleData,type ModuleHostPorts} from '../core/moduleFactory';
import type {ReleaseSet} from '../core/releaseSet';
import type {DatabaseSession} from '../database/moduleDatabase';
const artifact={module:'qr',version:'1.0.0',contract:'2.0.0',schema:2} as ReleaseSet['artifacts'][number];
test('factory metadata mismatch fails before passing host ports or invoking remote create',()=>{
 const create=jest.fn();for(const patch of [{id:'help'},{version:'latest'},{contract:'1.0.0'},{schema:1},{create:null}])expect(()=>validateRemoteModuleFactory({id:'qr',version:'1.0.0',contract:'2.0.0',schema:2,create,...patch},artifact)).toThrow();expect(create).not.toHaveBeenCalled();
});
test('owned data view cannot expose another feature or account-wide disposal',()=>{
 const handle={};const scope=Object.freeze({company:'alpha',user:'alice',generation:'g1'});const database={scope,module:jest.fn(()=>handle),dispose:jest.fn()} as unknown as DatabaseSession;
 const view=createOwnedModuleData(database,'qr');expect(view.module('qr')).toBe(handle);expect(()=>view.module('help')).toThrow('Foreign module');expect((view as unknown as {dispose:unknown}).dispose).toBeUndefined();expect(database.module).toHaveBeenCalledTimes(1);
});
test('ports must match subject and entitled module; partial lifecycle does not become runnable',()=>{
 const create=jest.fn(()=>({id:'qr',requiresOnline:false,Screen:()=>null,init:async()=>{},activate:async()=>{},suspend:async()=>{},dispose:async()=>{}}));
 const factory=validateRemoteModuleFactory({id:'qr',version:'1.0.0',contract:'2.0.0',schema:2,create},artifact);
 const ports={lease:{session:{company:'alpha',user:'alice',modules:['qr']},assertCurrent(){}},data:{scope:{company:'beta',user:'bob'},module(){}},company(){},createOperationId(){return 'fixture';},requestAuthorizationCheck(){}} as unknown as ModuleHostPorts;
 expect(()=>factory.create(ports)).toThrow('subject');expect(create).not.toHaveBeenCalled();
 (ports.data as {scope:unknown}).scope={company:'alpha',user:'alice'};expect(factory.create(ports).id).toBe('qr');
 create.mockReturnValue({...create.mock.results[0].value,dispose:null});expect(()=>factory.create(ports)).toThrow('lifecycle');
});
