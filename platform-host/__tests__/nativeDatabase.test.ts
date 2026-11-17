import {createNativeSqliteDriver} from '../database/sqliteDriver.native';
const scope={company:'alpha',user:'alice',generation:'data-1'};
test('native DB adapter uses fixed scoped operations and preserves opaque business payloads',async()=>{
 const bridge={request:jest.fn(async(operation:string)=>operation==='write'?'[{"collection":"outbox","id":"one","revision":1}]':'null')};const driver=createNativeSqliteDriver(bridge);
 const batch={module:'orders',expectedSchema:1,changes:[{collection:'outbox',id:'one',expectedRevision:null,payload:JSON.stringify({hash:'canonical-fixture',receipt:'matching-fixture'})}]};
 await expect(driver.write(scope,batch)).resolves.toEqual([{collection:'outbox',id:'one',revision:1}]);expect(bridge.request).toHaveBeenCalledWith('write',JSON.stringify(scope),JSON.stringify(batch));
 await driver.read(scope,'orders',1,'drafts',"'; DROP TABLE records; --");expect(bridge.request).toHaveBeenLastCalledWith('read',JSON.stringify(scope),JSON.stringify({module:'orders',schema:1,collection:'drafts',id:"'; DROP TABLE records; --"}));
});
test('foreign scope/copy, duplicate writes and malformed payloads fail before bridge access',async()=>{
 const bridge={request:jest.fn(async()=> 'null')};const driver=createNativeSqliteDriver(bridge);
 await expect(driver.fork(scope,{...scope,user:'bob'})).rejects.toThrow('Cross-tenant');
 await expect(driver.schema({...scope,company:'../bad'},'orders')).rejects.toThrow('namespace');
 const change={collection:'drafts',id:'one',expectedRevision:null,payload:'{}'};expect(()=>driver.write(scope,{module:'orders',expectedSchema:1,changes:[change,change]})).toThrow('Duplicate');
 expect(()=>driver.write(scope,{module:'orders',expectedSchema:1,changes:[{...change,payload:'not-json'}]})).toThrow();expect(bridge.request).not.toHaveBeenCalled();
});
test('unavailable/corrupt native responses have no plaintext or alternate database fallback',async()=>{
 expect(()=>createNativeSqliteDriver(null as never)).toThrow('unavailable');const driver=createNativeSqliteDriver({request:async()=> 'broken'});await expect(driver.read(scope,'orders',1,'drafts','one')).rejects.toThrow();
});
