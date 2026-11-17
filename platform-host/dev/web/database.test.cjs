const{test}=require('node:test');const assert=require('node:assert/strict');const{browserFixture}=require('./browserFixture.cjs');
async function setup(){
 const api=globalThis.LP2,driver=api.createIndexedDbDriver(),scope={company:'alpha',user:'alice',generation:'gen-1'};
 try{await driver.fork(null,scope);}catch(error){if(!error.message.includes('already exists'))throw error;}
 for(const module of ['orders','help'])if(await driver.schema(scope,module)===0)await driver.write(scope,{module,expectedSchema:0,targetSchema:1,changes:[]});
 const controller=new AbortController(),lease={session:{company:'alpha',user:'alice',modules:['orders','help'],confirmation:'fixture'},online:false,signal:controller.signal,assertCurrent(){if(controller.signal.aborted)throw Error('Stale lease');}};
 const session=api.createDatabaseSession(driver,lease,scope.generation,{orders:1,help:1},{run:async(_scope,_module,_schema,_signal,work)=>work()});const codec={encode:value=>value,decode:value=>{if(!value||typeof value.text!=='string')throw Error('Invalid draft');return value;}};
 globalThis.d={api,driver,scope,lease,session,codec,controller};
}
test('real browser domain transactions persist drafts/outbox/cursors with module and account isolation',async t=>{
 const f=await browserFixture(t,setup);let page=await f.open();await page.evaluate(async()=>{const d=globalThis.d,orders=d.session.module('orders'),drafts=orders.collection('drafts',d.codec),outbox=orders.collection('outbox',d.codec),help=d.session.module('help');
  await orders.transaction([drafts.put('draft',{text:'unsent'},null),outbox.put('pending',{text:'canonical receipt fixture'},null)]);await help.transaction([help.collection('cursor',d.codec).put('last',{text:'42'},null)]);
  let denied=false;try{await help.transaction([drafts.put('foreign',{text:'denied'},null)]);}catch{denied=true;}if(!denied)throw Error('Cross-module mutation');
 });await f.close();page=await f.open();const state=await page.evaluate(async()=>{const d=globalThis.d;await d.driver.verify(d.scope,{orders:1,help:1});const orders=d.session.module('orders');const others=[];for(const other of [{company:'beta',user:'bob',generation:'gen-1'},{company:'alpha',user:'another-user',generation:'gen-1'}]){await d.driver.fork(null,other);await d.driver.write(other,{module:'orders',expectedSchema:0,targetSchema:1,changes:[]});others.push(await d.driver.read(other,'orders',1,'drafts','draft'));}return{draft:await orders.collection('drafts',d.codec).get('draft'),outbox:await orders.collection('outbox',d.codec).get('pending'),cursor:await d.session.module('help').collection('cursor',d.codec).get('last'),others};});
 assert.equal(state.draft.value.text,'unsent');assert.equal(state.outbox.value.text,'canonical receipt fixture');assert.equal(state.cursor.value.text,'42');assert.deepEqual(state.others,[null,null]);
});
test('browser batch conflict is all-or-nothing, pagination uses UTF8 keys and logout/dispose retain data',async t=>{
 const f=await browserFixture(t,setup),page=await f.open();const state=await page.evaluate(async()=>{const d=globalThis.d,db=d.session.module('orders'),rows=db.collection('drafts',d.codec);await db.transaction(['a','b','я','😀'].map(id=>rows.put(id,{text:id},null)));let denied=0;
  try{await db.transaction([rows.put('a',{text:'must rollback'},1),rows.put('b',{text:'conflict'},999)]);}catch{denied++;}
  const before=await rows.get('a'),ordered=await rows.list(10);d.controller.abort();try{await rows.get('a');}catch{denied++;}await d.session.dispose();return{before,ordered:ordered.map(r=>r.id),denied,retained:await d.driver.read(d.scope,'orders',1,'drafts','a')};});
 assert.equal(state.before.value.text,'a');assert.deepEqual(state.ordered,['a','b','я','😀']);assert.equal(state.denied,2);assert.equal(JSON.parse(state.retained.payload).text,'a');
});
test('browser generation copy/migrations preserve source and quota failure cannot partially copy a generation',async t=>{
 const f=await browserFixture(t,setup),page=await f.open();const state=await page.evaluate(async()=>{const d=globalThis.d,orders=d.session.module('orders'),drafts=orders.collection('drafts',d.codec);await orders.transaction([drafts.put('one',{text:'preserve'},null)]);
  const owners=['orders','help'].map(module=>({module,base:1,initialize:async()=>{},migrations:module==='orders'?[{from:1,to:2,run:async db=>{const docs=db.collection('drafts',d.codec);for(const row of await docs.list())await db.transaction([docs.put(row.id,{...row.value,extra:'schema2'},row.revision)]);}}]:[]}));
  const previous={company:'alpha',user:'alice',dataGeneration:'gen-1',release:{artifacts:[{module:'orders',schema:1},{module:'help',schema:1}]}};const release={company:'alpha',artifacts:[{module:'orders',schema:2},{module:'help',schema:1}]};
  const generation=await d.api.prepareDataGeneration(d.driver,d.lease,release,previous,owners,()=> 'gen-2');const target={...d.scope,generation};await d.driver.verify(target,{orders:2,help:1});
  const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='rows'){IDBObjectStore.prototype.put=original;throw new DOMException('Injected quota','QuotaExceededError');}return original.apply(this,args);};let rejected=false;
  try{await d.driver.fork(d.scope,{...d.scope,generation:'partial'});}catch(error){if(error.name!=='QuotaExceededError')throw error;rejected=true;}
  let missing=false;try{await d.driver.schema({...d.scope,generation:'partial'},'orders');}catch{missing=true;}
  return{source:await drafts.get('one'),migrated:await d.driver.read(target,'orders',2,'drafts','one'),rejected,missing};});
 assert.equal(state.source.revision,1);assert.equal(state.source.value.extra,undefined);assert.equal(JSON.parse(state.migrated.payload).extra,'schema2');assert.equal(state.rejected,true);assert.equal(state.missing,true);
});
