const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');
const{sqliteDriver}=require('../database/sqliteDriver.cjs');const{createDatabaseSession}=require('../../database/moduleDatabase.ts');const{prepareDataGeneration}=require('../../database/migrations.ts');const{createQrDraftRepository,qrSchemaOwner}=require('../../modules/qr/drafts.ts');
const draft={format:1,documentId:null,qrType:'CONTACT',description:'Незавершённый контакт',values:{firstname:'Иван',lastname:'',phone:'+7',contactAddress:'Адрес; с запятой, и\nпереносом',note:'ещё не отправлен'}};
async function fixture(t){
 const root=fs.mkdtempSync(os.tmpdir()+'/lp2-qr-repo-');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const driver=sqliteDriver(root);
 const open=async(company='alpha',user='alice',actions=['create_qr','update_qr','view_qr'])=>{
  const controller=new AbortController();const lease={session:{company,user,modules:['qr'],permissions:{qr:actions},confirmation:'signed-fixture'},online:false,signal:controller.signal,assertCurrent(){if(this.signal.aborted)throw Error('Stale QR lease');}};
  const scope={company,user,generation:'qr-generation1'};
  if(!fs.existsSync(driver.file(scope)))await prepareDataGeneration(driver,lease,{company,artifacts:[{module:'qr',schema:1}]},null,[qrSchemaOwner],()=>scope.generation);
  const session=createDatabaseSession(driver,lease,scope.generation,{qr:1},{run:async(scope,module,schema,signal,work)=>{lease.assertCurrent();const result=await work();lease.assertCurrent();return result;}});
  return{session,lease,controller,repo:createQrDraftRepository(session,lease)};
 };return{open,driver};
}
test('offline incomplete contact survives actual SQLite close/reopen, another user/company cannot read it',async t=>{
 const f=await fixture(t),a=await f.open();assert.equal(await a.repo.save('contact',draft,null),1);await a.session.dispose();
 const restored=await f.open();assert.deepEqual((await restored.repo.get('contact')).value,draft);
 for(const subject of [['alpha','carol'],['beta','bob']]){const b=await f.open(...subject);assert.equal(await b.repo.get('contact'),null);await b.repo.save('contact',{...draft,description:'Other subject'},null);assert.equal((await restored.repo.get('contact')).value.description,draft.description);}
 const carol=await f.open('alpha','carol');assert.throws(()=>createQrDraftRepository(carol.session,restored.lease),/Wrong QR data subject/);
});
test('conflicting editors cannot overwrite saved work; discard uses compare-and-swap and logout preserves records',async t=>{
 const f=await fixture(t),a=await f.open();await a.repo.save('draft',draft,null);const second=await f.open();await second.repo.save('draft',{...draft,description:'newer edit'},1);
 await assert.rejects(a.repo.save('draft',{...draft,description:'stale edit'},1),/revision conflict/);await assert.rejects(a.repo.remove('draft',1),/revision conflict/);
 a.controller.abort();await assert.rejects(a.repo.get('draft'),/Stale/);const back=await f.open();assert.equal((await back.repo.get('draft')).value.description,'newer edit');await back.repo.remove('draft',2);assert.equal(await back.repo.get('draft'),null);
});
test('confirmed narrowing blocks edit/discard without destroying draft and does not infer rights from module license',async t=>{
 const f=await fixture(t),a=await f.open();await a.repo.save('draft',draft,null);await a.repo.save('edit',{...draft,documentId:'owned-document'},null);
 a.controller.abort();const denied=await f.open('alpha','alice',[]);await assert.rejects(denied.repo.get('draft'),/access denied/);await assert.rejects(denied.repo.save('new',draft,null),/access denied/);
 const read=await f.open('alpha','alice',['view_qr']);assert.deepEqual((await read.repo.get('draft')).value,draft);await assert.rejects(read.repo.remove('draft',1),/edit denied/);
 const create=await f.open('alpha','alice',['create_qr']);assert.deepEqual((await create.repo.list()).items.map(row=>row.id),['draft']);await assert.rejects(create.repo.get('edit'),/access denied/);await assert.rejects(create.repo.save('edit',draft,1),/edit denied/);
 const hiddenPage=await create.repo.list(1,'draft');assert.deepEqual(hiddenPage.items,[]);assert.equal(hiddenPage.nextAfter,'edit');
 const restored=await f.open();assert.deepEqual((await restored.repo.get('draft')).value,draft);assert.equal((await restored.repo.get('edit')).value.documentId,'owned-document');
});
test('unknown draft formats/types/fields and oversized inputs fail without replacing saved data',async t=>{
 const f=await fixture(t),a=await f.open();await a.repo.save('draft',draft,null);
 for(const value of [{...draft,format:2},{...draft,qrType:'WIFI'},{...draft,values:{password:'secret'}},{...draft,values:{text:'x'.repeat(65537)}},{...draft,extra:1}])await assert.rejects(a.repo.save('draft',value,1));
 assert.deepEqual((await a.repo.get('draft')).value,draft);
});
