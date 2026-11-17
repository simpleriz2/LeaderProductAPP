const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const{DatabaseSync}=require('node:sqlite');
const{sqliteDriver}=require('./sqliteDriver.cjs');const{createDatabaseSession}=require('../../database/moduleDatabase.ts');
const codec={encode:value=>value,decode:value=>{if(!value||typeof value.text!=='string')throw Error('Invalid draft');return value;}};
async function fixture(t){const root=fs.mkdtempSync(os.tmpdir()+'/lp2-sdk-');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const driver=sqliteDriver(root);const scope={company:'alpha',user:'alice',generation:'gen-1'};await driver.fork(null,scope);
 for(const module of ['orders','help'])await driver.write(scope,{module,expectedSchema:0,targetSchema:1,changes:[]});
 const controller=new AbortController();const lease={session:{company:'alpha',user:'alice',modules:['orders','help'],confirmation:'confirmed'},online:false,signal:controller.signal,assertCurrent(){if(controller.signal.aborted)throw Error('Stale data lease');}};
 const session=createDatabaseSession(driver,lease,scope.generation,{orders:1,help:1});return{root,driver,scope,session,controller,lease};}
test('typed draft/outbox batch is atomic; conflicting revision rolls back every business record',async t=>{
 const f=await fixture(t),orders=f.session.module('orders'),drafts=orders.collection('drafts',codec),outbox=orders.collection('outbox',codec);
 await orders.transaction([drafts.put('draft-1',{text:'unsent draft'},null),outbox.put('submission-1',{text:'canonical payload; matching receipt owned by domain repo'},null)]);
 assert.equal((await drafts.get('draft-1')).revision,1);
 await assert.rejects(orders.transaction([drafts.put('draft-1',{text:'must roll back'},1),outbox.put('submission-1',{text:'conflict'},999)]),/revision conflict/);
 assert.equal((await drafts.get('draft-1')).value.text,'unsent draft');assert.equal((await outbox.get('submission-1')).revision,1);
 await orders.transaction([drafts.put('draft-1',{text:'edited'},1)]);assert.equal((await drafts.get('draft-1')).revision,2);
 await assert.rejects(orders.transaction([drafts.put('draft-1',{text:'duplicate'},null)]),/revision conflict/);
});
test('module/tenant/user/generation scopes cannot share mutations or read another account',async t=>{
 const f=await fixture(t),orders=f.session.module('orders'),drafts=orders.collection('drafts',codec),help=f.session.module('help');
 const mutation=drafts.put('../literal-record-id',{text:'private'},null);await orders.transaction([mutation]);
 await assert.rejects(help.transaction([mutation]),/another module/);assert.equal((await drafts.get('../literal-record-id')).value.text,'private');
 assert.throws(()=>f.session.module('tracking'),/not entitled/);
 for(const scope of [{company:'beta',user:'bob',generation:'gen-1'},{company:'alpha',user:'another-user',generation:'gen-1'}]){
  await f.driver.fork(null,scope);await f.driver.write(scope,{module:'orders',expectedSchema:0,targetSchema:1,changes:[]});assert.equal(await f.driver.read(scope,'orders',1,'drafts','../literal-record-id'),null);
 }
 await assert.rejects(f.driver.fork(f.scope,{company:'beta',user:'bob',generation:'copy-of-alice'}),/Cross-tenant/);
 await assert.rejects(f.driver.fork(null,{...f.scope,company:'../outside'}),/namespace/);
});
test('SDK migrations preserve a consistent copy and never downgrade or overwrite active generation',async t=>{
 const f=await fixture(t),orders=f.session.module('orders'),drafts=orders.collection('drafts',codec);await orders.transaction([drafts.put('one',{text:'preserved'},null)]);
 const next={...f.scope,generation:'gen-2'};await f.driver.fork(f.scope,next);
 await f.driver.write(next,{module:'orders',expectedSchema:1,targetSchema:2,changes:[{collection:'drafts',id:'one',expectedRevision:1,payload:JSON.stringify({text:'preserved',extra:'new schema'})}]});
 await f.driver.verify(next,{orders:2,help:1});assert.equal((await drafts.get('one')).revision,1);
 await assert.rejects(f.driver.read(next,'orders',1,'drafts','one'),/schema mismatch/);
 await assert.rejects(f.driver.write(next,{module:'orders',expectedSchema:2,targetSchema:1,changes:[]}),/ordered/);
 await assert.rejects(f.driver.fork(null,next),/already exists/);
 const db=new DatabaseSync(f.driver.file(next));db.exec('PRAGMA user_version=999');db.close();await assert.rejects(f.driver.fork(next,{...next,generation:'gen-3'}),/physical database/);
});
test('expired leases, malformed payloads and foreign SQL-like record ids cannot bypass SDK boundaries',async t=>{
 const f=await fixture(t),orders=f.session.module('orders'),drafts=orders.collection('drafts',codec);const id="'; DROP TABLE records; --";
 await orders.transaction([drafts.put(id,{text:'literal bound parameter'},null)]);assert.equal((await drafts.get(id)).value.text,'literal bound parameter');
 assert.throws(()=>drafts.put('invalid',{text:undefined},null),/JSON/);
 await assert.rejects(orders.transaction([drafts.put('same',{text:'a'},null),drafts.put('same',{text:'b'},null)]),/Duplicate/);
 f.controller.abort();await assert.rejects(drafts.get(id),/Stale/);assert.throws(()=>drafts.put('new',{text:'blocked'},null),/Stale/);
 await f.driver.verify(f.scope,{orders:1,help:1});assert.equal((await f.driver.read(f.scope,'orders',1,'drafts',id)).payload,JSON.stringify({text:'literal bound parameter'}));
});
test('session disposal closes owned connections and preserves reusable drafts; pagination is bounded',async t=>{
 const f=await fixture(t),orders=f.session.module('orders'),drafts=orders.collection('drafts',codec);assert.equal(f.session.module('orders'),orders);
 await orders.transaction(['a','b','c'].map(id=>drafts.put(id,{text:id},null)));assert.deepEqual((await drafts.list(2)).map(row=>row.id),['a','b']);assert.deepEqual((await drafts.list(2,'b')).map(row=>row.id),['c']);
 await assert.rejects(drafts.list(10000),/page size/);await f.session.dispose();await assert.rejects(drafts.get('a'),/disposed/);assert.throws(()=>f.session.module('orders'),/disposed/);
 assert.equal((await f.driver.read(f.scope,'orders',1,'drafts','a')).payload,JSON.stringify({text:'a'}));
});
const{prepareDataGeneration}=require('../../database/migrations.ts');
function owners(){return ['orders','help'].map(module=>({module,base:1,initialize:async()=>{},migrations:module==='orders'?[{from:1,to:2,run:async database=>{const drafts=database.collection('drafts',codec);for(const row of await drafts.list())await database.transaction([drafts.put(row.id,{...row.value,newField:'schema2'},row.revision)]);}}]:[]}));}
function activation(f,schemas={orders:1,help:1}){return{company:'alpha',user:'alice',dataGeneration:f.scope.generation,release:{company:'alpha',artifacts:Object.entries(schemas).map(([module,schema])=>({module,schema}))}};}
test('owned ordered migrations prepare another generation and preserve draft/outbox/Help records',async t=>{
 const f=await fixture(t),orders=f.session.module('orders'),drafts=orders.collection('drafts',codec),outbox=orders.collection('outbox',codec),help=f.session.module('help'),cursor=help.collection('cursor',codec);
 await orders.transaction([drafts.put('draft',{text:'unsent'},null),outbox.put('outbox',{text:'unchanged receipt'},null)]);await help.transaction([cursor.put('last',{text:'cursor-42'},null)]);
 const previous=activation(f),release={company:'alpha',artifacts:[{module:'orders',schema:2},{module:'help',schema:1}]};
 const generation=await prepareDataGeneration(f.driver,f.lease,release,previous,owners(),()=> 'prepared-2');const target={...f.scope,generation};
 await f.driver.verify(target,{orders:2,help:1});assert.equal(JSON.parse((await f.driver.read(target,'orders',2,'drafts','draft')).payload).newField,'schema2');
 assert.equal(JSON.parse((await f.driver.read(target,'orders',2,'outbox','outbox')).payload).text,'unchanged receipt');assert.equal(JSON.parse((await f.driver.read(target,'help',1,'cursor','last')).payload).text,'cursor-42');assert.equal((await drafts.get('draft')).value.newField,undefined);
 const invalid=owners();invalid[0].migrations=[{from:2,to:3,run:async()=>{}}];await assert.rejects(prepareDataGeneration(f.driver,f.lease,release,previous,invalid,()=> 'bad-history'),/history/);
 await assert.rejects(prepareDataGeneration(f.driver,f.lease,{...release,artifacts:[{module:'orders',schema:3}]},previous,owners(),()=> 'missing-history'),/Missing owned/);
});
test('failed migration or logout never changes the source generation or leaves a usable migration view',async t=>{
 const f=await fixture(t),orders=f.session.module('orders'),drafts=orders.collection('drafts',codec);await orders.transaction([drafts.put('one',{text:'must survive'},null)]);const release={company:'alpha',artifacts:[{module:'orders',schema:2},{module:'help',schema:1}]};let retained;
 const registry=owners();registry[0].migrations[0].run=async db=>{retained=db.collection('drafts',codec);const row=await retained.get('one');await db.transaction([retained.put('one',{text:'candidate partial'},row.revision)]);throw Error('Injected migration failure');};
 await assert.rejects(prepareDataGeneration(f.driver,f.lease,release,activation(f),registry,()=> 'failed-candidate'),/Injected/);assert.equal((await drafts.get('one')).value.text,'must survive');await assert.rejects(retained.get('one'),/view closed/);
 const revoke=owners();revoke[0].migrations[0].run=async()=>{f.controller.abort();};await assert.rejects(prepareDataGeneration(f.driver,f.lease,release,activation(f),revoke,()=> 'revoked-candidate'),/Stale/);
 assert.equal(JSON.parse((await f.driver.read(f.scope,'orders',1,'drafts','one')).payload).text,'must survive');
});
