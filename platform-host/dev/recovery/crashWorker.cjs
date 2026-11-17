const fs = require('node:fs');
const { verify, createPublicKey, randomUUID } = require('node:crypto');
const { stageAndActivate } = require('../../core/releaseSet.ts');
const { openDiskStore, digest } = require('./diskStore.cjs');
const { prepareForUser } = require('./dataGenerations.cjs');
(async () => {
  const [root, input, crashAt] = process.argv.slice(2); const fixture = JSON.parse(fs.readFileSync(input,'utf8'));
  const storage = openDiskStore(root, point => { if(point === crashAt) process.exit(77); });
  try {
    await stageAndActivate(fixture.signed, fixture.context, {
      createAttemptId: randomUUID, storage,
      trust: { sha256: async bytes => digest(bytes), verifyEd25519: async (keyId,payload,signature) => keyId === 'fixture-key' && verify(null,Buffer.from(payload),createPublicKey(fixture.publicKey),Buffer.from(signature,'base64')) },
      download: async key => Buffer.from(fixture.artifacts[key],'base64'),
      prepareData: (release, previous) => prepareForUser(root,fixture.context.user,release,previous),
    });
  } finally { storage.close(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
