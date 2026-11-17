const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const{createHash}=require('node:crypto');
const{packageWebRemote}=require('../../scripts/packWebRemote.cjs');const{packageRemote}=require('../../scripts/packRemote.cjs');
test('actual QR business containers carry complete native/Web inventories and cannot be mislabeled as delivery probes',()=>{
 for(const [pack,dir]of [[packageWebRemote,'immutable-web'],[packageRemote,'immutable']]){
  const artifact=pack('qr','1.0.0',{profile:'business'});assert.equal(artifact.contract,'2.0.0');assert.equal(artifact.schema,2);assert.equal(artifact.requires.capabilities.http,2);assert.equal(artifact.requires.contracts.moduleHost,'1.0.0');assert.equal(artifact.requires.contracts.authActions,'1.0.0');
  for(const file of [artifact,...artifact.assets]){const bytes=fs.readFileSync(path.join(__dirname,'../../build',dir,file.path));assert.equal(bytes.length,file.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.digest);}
 }
 assert.throws(()=>packageRemote('qr','1.0.0',{build:false,profile:'probe'}),/exposure\/profile mismatch/);
 assert.throws(()=>packageWebRemote('help','1.0.0',{profile:'business'}),/profile/);
});
