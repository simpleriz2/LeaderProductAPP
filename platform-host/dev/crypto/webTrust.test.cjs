const{test}=require('node:test');const assert=require('node:assert/strict');const{generateKeyPairSync,sign,webcrypto,createHash}=require('node:crypto');
const{createWebTrust}=require('../../adapters/trust.web.ts');
test('actual WebCrypto verifies pinned raw Ed25519 across Node signer; rejects tampering/unknown keys',async()=>{
  const pair=generateKeyPairSync('ed25519');const raw=Buffer.from(pair.publicKey.export({format:'jwk'}).x,'base64url').toString('base64');const trust=createWebTrust({root:raw},webcrypto.subtle);
  const payload='{"company":"alpha","release":"alpha-1"}';const signature=sign(null,Buffer.from(payload),pair.privateKey).toString('base64');
  assert.equal(await trust.verifyEd25519('root',payload,signature),true);assert.equal(await trust.verifyEd25519('root',payload+'x',signature),false);assert.equal(await trust.verifyEd25519('untrusted',payload,signature),false);
  const bytes=Buffer.from('actual artifact');assert.equal(await trust.sha256(bytes),createHash('sha256').update(bytes).digest('hex'));
});
