const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { generateKeyPairSync, sign, verify, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process'); const { DatabaseSync } = require('node:sqlite');
const { stageAndActivate, verifyRelease } = require('../../core/releaseSet.ts');
const { openDiskStore, digest } = require('./diskStore.cjs'); const { prepareForUser, dataFile } = require('./dataGenerations.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'lp2-recovery-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const key = generateKeyPairSync('ed25519'); const artifacts = {};
  const context = { platform:'android', company:'alpha', user:'alice', host:1, runtime:'fixture-runtime', compatibleApis:['1.0.0'],capabilities:{},contracts:{},moduleContracts:{qr:['1.0.0'],help:['1.0.0']}, modules:['qr','help'] };
  const release = version => ({ format:2,platform:'android', id:`set-${version}`, company:'alpha', minHost:1, runtime:context.runtime, api:'1.0.0', artifacts:['qr','help'].map(module=>{
    const bytes = Buffer.from(`${module}:${module==='help'?1:version}`);const hash=digest(bytes);const key=`artifacts/${hash}.bundle`;artifacts[key]=bytes.toString('base64');
    return { module, name:`${module}.container.bundle`,size:bytes.length,assets:[], version:`${module==='help'?1:version}.0.0`, contract:'1.0.0',requires:{minHost:1,capabilities:{},contracts:{}}, schema:1, digest:hash, path:key };
  }) });
  const signed = value => { const payload=JSON.stringify(value);return { keyId:'fixture-key',payload,signature:sign(null,Buffer.from(payload),key.privateKey).toString('base64') }; };
  const trust = { sha256:async bytes=>digest(bytes), verifyEd25519:async(keyId,payload,signature)=>keyId==='fixture-key'&&verify(null,Buffer.from(payload),key.publicKey,Buffer.from(signature,'base64')) };
  const storage=openDiskStore(root);t.after(()=>storage.close());
  const ports={storage,trust,createAttemptId:randomUUID,download:async key=>Buffer.from(artifacts[key],'base64'),prepareData:(r,p)=>prepareForUser(root,context.user,r,p)};
  return { root,key,artifacts,context,release,signed,trust,storage,ports };
}
function seed(f, activation) {
  const db=new DatabaseSync(dataFile(f.root,'alpha','alice',activation.dataGeneration));
  db.prepare('INSERT INTO drafts(module,id,payload) VALUES(?,?,?)').run('qr','draft-1','unsent');
  db.prepare('INSERT INTO outbox(id,payload,receipt) VALUES(?,?,?)').run('order-1','canonical-payload','matching-receipt');
  db.prepare('INSERT INTO help_cursor(id,cursor) VALUES(?,?)').run('help','cursor-42');db.close();
}
function preserved(f, activation) {
  const db=new DatabaseSync(dataFile(f.root,'alpha','alice',activation.dataGeneration));
  try { assert.equal(db.prepare('SELECT payload FROM drafts WHERE id=?').get('draft-1').payload,'unsent');assert.equal(db.prepare('SELECT receipt FROM outbox WHERE id=?').get('order-1').receipt,'matching-receipt');assert.equal(db.prepare('SELECT cursor FROM help_cursor').get().cursor,'cursor-42'); } finally {db.close();}
}
test('disk/SQLite activation updates only one remote, migrates a copy and preserves drafts/outbox/cursors', async t=>{
  const f=fixture(t);const first=await stageAndActivate(f.signed(f.release(1)),f.context,f.ports);seed(f,first);
  const r2=f.release(2);r2.artifacts.forEach(a=>a.schema=2);
  const second=await stageAndActivate(f.signed(r2),f.context,f.ports);preserved(f,second);preserved(f,first);
  assert.equal(second.release.artifacts[1].digest,first.release.artifacts[1].digest);
  assert.notEqual(second.release.artifacts[0].digest,first.release.artifacts[0].digest);
  assert.equal((await f.storage.lastGood('alpha','alice')).release.id,'set-1');
  assert.equal(await f.storage.current('beta','bob'),null);
  const before=await f.storage.current('alpha','alice');
  await assert.rejects(stageAndActivate(f.signed(f.release(3)),f.context,{...f.ports,prepareData:(r,p)=>prepareForUser(f.root,'alice',r,p,true)}));
  assert.deepEqual(await f.storage.current('alpha','alice'),before);preserved(f,before);
});
for(const crashAt of ['beforeCommit','afterCommit']) test(`restart after process crash ${crashAt} restores one complete code/data set`,async t=>{
  const f=fixture(t);const first=await stageAndActivate(f.signed(f.release(1)),f.context,f.ports);seed(f,first);
  const input=path.join(f.root,'fixture.json');const r2=f.release(2);
  fs.writeFileSync(input,JSON.stringify({signed:f.signed(r2),context:f.context,artifacts:f.artifacts,publicKey:f.key.publicKey.export({type:'spki',format:'pem'})}));
  const child=spawnSync(process.execPath,['--experimental-strip-types',path.join(__dirname,'crashWorker.cjs'),f.root,input,crashAt],{encoding:'utf8'});
  assert.equal(child.status,77,child.stderr);
  const reopened=openDiskStore(f.root);try {
    const active=await reopened.current('alpha','alice');assert.equal(active.release.id,crashAt==='beforeCommit'?'set-1':'set-2');
    const verified=await verifyRelease(active.signed,f.context,f.trust);assert.deepEqual(verified,active.release);
    reopened.readVerifiedBytes(active);preserved(f,active);
  } finally {reopened.close();}
});
test('cached artifact tampering is detected before execution, including offline restart',async t=>{
  const f=fixture(t);const active=await stageAndActivate(f.signed(f.release(1)),f.context,f.ports);
  fs.writeFileSync(f.storage.blobFile('alpha','alice',active.release.artifacts[0].digest),'tampered');
  assert.throws(()=>f.storage.readVerifiedBytes(active),/tampered/);
});
test('code rollback keeps current data generation; incompatible schema rollback is denied',async t=>{
  const { rollbackCode }=require('../../core/releaseSet.ts');const f=fixture(t);
  const first=await stageAndActivate(f.signed(f.release(1)),f.context,f.ports);seed(f,first);
  const second=await stageAndActivate(f.signed(f.release(2)),f.context,f.ports);
  const db=new DatabaseSync(dataFile(f.root,'alpha','alice',second.dataGeneration));db.prepare('INSERT INTO drafts(module,id,payload) VALUES(?,?,?)').run('qr','new-draft','created-after-update');db.close();
  const rolled=await rollbackCode(first.signed,f.context,f.ports);assert.equal(rolled.release.id,'set-1');assert.equal(rolled.dataGeneration,second.dataGeneration);preserved(f,rolled);
  const restored=new DatabaseSync(dataFile(f.root,'alpha','alice',rolled.dataGeneration));try{assert.equal(restored.prepare('SELECT payload FROM drafts WHERE id=?').get('new-draft').payload,'created-after-update');}finally{restored.close();}
  const newer=f.release(3);newer.artifacts.forEach(a=>a.schema=2);const active=await stageAndActivate(f.signed(newer),f.context,f.ports);
  await assert.rejects(rollbackCode(first.signed,f.context,f.ports),/compatible current data schema/);assert.deepEqual(await f.storage.current('alpha','alice'),active);preserved(f,active);
});
test('cache is private per company/user and a corrupt cached blob is repaired only from verified bytes',async t=>{
  const f=fixture(t);const first=await stageAndActivate(f.signed(f.release(1)),f.context,f.ports);seed(f,first);const file=first.release.artifacts[0];
  assert.equal(await f.storage.cachedFile('beta','bob',file),null);assert.equal(await f.storage.cachedFile('alpha','bob',file),null);
  fs.writeFileSync(f.storage.blobFile('alpha','alice',file.digest),'corrupt-cache');let downloaded=[];const original=f.ports.download;
  const repaired=await stageAndActivate(f.signed({...f.release(1),id:'repair-2'}),f.context,{...f.ports,download:async key=>{downloaded.push(key);return original(key);}});
  assert.deepEqual(downloaded,[file.path]);f.storage.readVerifiedBytes(repaired);preserved(f,repaired);
});
