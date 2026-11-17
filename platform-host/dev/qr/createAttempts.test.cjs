const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const{randomUUID}=require('node:crypto');
const{sqliteDriver}=require('../database/sqliteDriver.cjs');const{createDatabaseSession}=require('../../database/moduleDatabase.ts');const{prepareDataGeneration}=require('../../database/migrations.ts');const{createOwnedModuleData}=require('../../core/moduleFactory.ts');const{qrSchemaOwner}=require('../../modules/qr/schema.ts');const{createQrDraftRepository}=require('../../modules/qr/drafts.ts');const{createQrCreateAttempts}=require('../../modules/qr/createAttempts.ts');
const draft={format:1,documentId:null,qrType:'TEXT',description:'QR draft',values:{text:'initial'}},payload={qrType:'TEXT',qrData:'initial',description:'QR draft'};
async function fixture(t){const root=fs.mkdtempSync(os.tmpdir()+'/lp2-qr-attempt-');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const driver=sqliteDriver(root),controller=new AbortController();const lease={session:{company:'alpha',user:'alice',modules:['qr'],permissions:{qr:['view_qr','create_qr','update_qr']},confirmation:'fixture'},online:true,signal:controller.signal,assertCurrent(){if(this.signal.aborted)throw Error('Stale');}};
 const open=(generation='gen2',schema=2,account=lease)=>{const session=createDatabaseSession(driver,account,generation,{qr:schema},{run:async(scope,module,version,signal,work)=>{account.assertCurrent();const result=await work();account.assertCurrent();return result;}}),data=createOwnedModuleData(session,'qr');return{session,data,drafts:createQrDraftRepository(data,account),attempts:createQrCreateAttempts(data,account,randomUUID)};};
 const generation=await prepareDataGeneration(driver,lease,{company:'alpha',artifacts:[{module:'qr',schema:1}]},null,[qrSchemaOwner],()=> 'gen1'),old=open(generation,1);await old.drafts.save('draft',draft,null);
 await prepareDataGeneration(driver,lease,{company:'alpha',artifacts:[{module:'qr',schema:2}]},{company:'alpha',user:'alice',dataGeneration:generation,release:{company:'alpha',artifacts:[{module:'qr',schema:1}]}},[qrSchemaOwner],()=> 'gen2');await old.session.dispose();return{driver,lease,controller,open,...open()};}
test('schema1 draft survives schema2 migration; concurrent prepare keeps one durable operation and seals its payload',async t=>{
 const f=await fixture(t);assert.deepEqual((await f.drafts.get('draft')).value,draft);const other=f.open();const attempts=await Promise.all([f.attempts.prepare('draft',1,payload),other.attempts.prepare('draft',1,payload)]);assert.equal(attempts[0].value.operationId,attempts[1].value.operationId);
 await assert.rejects(f.attempts.prepare('draft',2,{...payload,qrData:'changed'}),/Resolve existing/);const row=await f.attempts.get('draft');assert.equal(row.value.payload.qrData,'initial');assert.equal(row.value.status,'pending');const current=await f.drafts.get('draft');await assert.rejects(f.drafts.remove('draft',current.revision),/Resolve pending/);
 const source=await f.driver.read({company:'alpha',user:'alice',generation:'gen1'},'qr',1,'drafts','draft');assert.deepEqual(JSON.parse(source.payload),draft);
});
test('lost create response and restart reuse stored operation; ack preserves a concurrently edited draft and is atomic',async t=>{
 const f=await fixture(t);await f.attempts.prepare('draft',1,payload);const rows=new Map();let fail=true;const client={async create(operationId,input){if(!rows.has(operationId))rows.set(operationId,{id:randomUUID(),qrType:input.qrType,qrData:input.qrData,description:input.description??null,status:'ACTIVE',revision:1});if(fail){fail=false;throw Error('Response lost after server commit');}return rows.get(operationId);}};
 await assert.rejects(f.attempts.transmit('draft',client),/Response lost/);assert.equal((await f.attempts.get('draft')).value.status,'pending');await f.session.dispose();
 const restored=f.open();const current=await restored.drafts.get('draft');await restored.drafts.save('draft',{...current.value,values:{text:'edited while acknowledgement unknown'}},current.revision);
 const result=await restored.attempts.transmit('draft',client);assert.equal(rows.size,1);assert.equal((await restored.attempts.get('draft')).value.result.id,result.id);const saved=await restored.drafts.get('draft');assert.equal(saved.value.documentId,result.id);assert.equal(saved.value.values.text,'edited while acknowledgement unknown');assert.deepEqual(await restored.attempts.transmit('draft',client),result);
});
test('offline/rights narrowing cannot retry saved attempt and never erase its payload',async t=>{
 const f=await fixture(t);await f.attempts.prepare('draft',1,payload);const offline=f.open('gen2',2,{...f.lease,online:false}),client={create:async()=>{throw Error('must not call');}};await assert.rejects(offline.attempts.transmit('draft',client),/online confirmation/);
 const denied=f.open('gen2',2,{...f.lease,session:{...f.lease.session,permissions:{qr:[]}}});await assert.rejects(denied.attempts.get('draft'),/access denied/);f.controller.abort();await assert.rejects(f.attempts.transmit('draft',client),/Stale/);
 const retained=await f.driver.read({company:'alpha',user:'alice',generation:'gen2'},'qr',2,'create-attempts','draft');assert.equal(JSON.parse(retained.payload).status,'pending');
});
test('failed acknowledgement transaction preserves pending identity and draft; retry cannot create a duplicate',async t=>{
 const f=await fixture(t);await f.attempts.prepare('draft',1,payload);const result={id:randomUUID(),qrType:'TEXT',qrData:'initial',description:'QR draft',status:'ACTIVE',revision:1};const received=new Set();const client={create:async id=>{received.add(id);return result;}};
 const write=f.driver.write;f.driver.write=async(scope,batch)=>{if(batch.changes.some(change=>change.collection==='create-attempts'&&JSON.parse(change.payload).status==='acknowledged'))throw Error('Fixture disk full');return write(scope,batch);};
 await assert.rejects(f.attempts.transmit('draft',client),/disk full/);assert.equal((await f.attempts.get('draft')).value.status,'pending');assert.equal((await f.drafts.get('draft')).value.documentId,null);
 f.driver.write=write;assert.deepEqual(await f.attempts.transmit('draft',client),result);assert.equal(received.size,1);assert.equal((await f.drafts.get('draft')).value.documentId,result.id);
});
test('concurrent discard/prepare cannot leave a sent identity without its draft',async t=>{
 const f=await fixture(t);const results=await Promise.allSettled([f.attempts.prepare('draft',1,payload),f.drafts.remove('draft',1)]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 const attempt=await f.attempts.get('draft'),saved=await f.drafts.get('draft');assert.equal(!!attempt,!!saved);if(attempt)assert.equal(attempt.value.status,'pending');
});
test('mismatched acknowledgement cannot overwrite draft or mark attempt delivered',async t=>{
 const f=await fixture(t);await f.attempts.prepare('draft',1,payload);const client={create:async()=>({id:randomUUID(),qrType:'TEXT',qrData:'initial',description:'QR draft',status:'ACTIVE',revision:2})};
 await assert.rejects(f.attempts.transmit('draft',client),/acknowledgement mismatch/);assert.equal((await f.attempts.get('draft')).value.status,'pending');assert.equal((await f.drafts.get('draft')).value.documentId,null);
});
