import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { stageAndActivate, verifyRelease, type Activation, type ReleaseSet, type ReleaseContext, type ReleasePorts } from '../core/releaseSet';
const key = generateKeyPairSync('ed25519');
const bytes = new Uint8Array(Buffer.from('trusted probe'));
const digest = createHash('sha256').update(bytes).digest('hex');
const context: ReleaseContext = { platform: 'android', company: 'alpha', user: 'alice', host: 1, runtime: 'rn-0.88.1-react-19.3.0', compatibleApis: ['1.0.0'], modules: ['qr', 'help'] };
const release: ReleaseSet = { format: 1, platform: 'android', id: 'alpha-1', company: 'alpha', minHost: 1, runtime: context.runtime, api: '1.0.0', artifacts: ['qr', 'help'].map(module => ({ module, name: `${module}.container.bundle`, size: bytes.length, assets: [], version: '1.0.0', contract: '1.0.0', schema: 1, digest, path: `artifacts/${digest}.bundle` })) };
const signed = (value: ReleaseSet) => { const payload = JSON.stringify(value); return { keyId: 'test-key', payload, signature: sign(null, Buffer.from(payload), key.privateKey).toString('base64') }; };
let current: Activation | null;
let staged: Map<string, Uint8Array[]>;
let ports: ReleasePorts;
beforeEach(() => {
  current = null; staged = new Map();
  ports = {
    createAttemptId: () => 'attempt-1',
    trust: {
      verifyEd25519: async (keyId, payload, signature) => keyId === 'test-key' && verify(null, Buffer.from(payload), key.publicKey, Buffer.from(signature, 'base64')),
      sha256: async data => createHash('sha256').update(data).digest('hex'),
    },
    download: async () => bytes,
    prepareData: async () => 'generation-1',
    storage: {
      current: async () => current,
      cachedFile: async () => null,
      stage: async (ns, _, data) => { staged.set(ns, [...(staged.get(ns) || []), data]); },
      discard: async ns => { staged.delete(ns); },
      commit: async (expected, next, ns) => { if(expected !== current) throw Error('Concurrent activation'); if(staged.get(ns)?.length !== 2) throw Error('Incomplete'); current = next; },
    },
  };
});
test('activates a complete authenticated company set with matching code and data pointers', async () => {
  await stageAndActivate(signed(release), context, ports);
  expect(current?.release.id).toBe('alpha-1'); expect(current?.dataGeneration).toBe('generation-1');
});
test.each(['company', 'host', 'runtime', 'api', 'entitlements'])('rejects incompatible %s before downloading', async reason => {
  const c = { ...context, ...(reason === 'company' ? { company: 'beta' } : reason === 'host' ? { host: 0 } : reason === 'runtime' ? { runtime: 'different' } : reason === 'api' ? { compatibleApis: [] } : { modules: ['qr'] }) };
  ports.download = jest.fn();
  await expect(stageAndActivate(signed(release), c, ports)).rejects.toThrow(); expect(ports.download).not.toHaveBeenCalled();
});
test('rejects tampering and untrusted signing keys', async () => {
  const s = signed(release);
  await expect(verifyRelease({ ...s, payload: s.payload.replace('alpha-1', 'alpha-2') }, context, ports.trust)).rejects.toThrow('signature');
  await expect(verifyRelease({ ...s, keyId: 'unknown' }, context, ports.trust)).rejects.toThrow('signature');
});
test.each(['download', 'digest', 'storage', 'migration', 'commit'])('preserves active data and release on %s failure', async reason => {
  await stageAndActivate(signed(release), context, ports); const previous = current;
  if(reason === 'download') ports.download = async () => { throw Error('Network interrupted'); };
  if(reason === 'digest') ports.download = async () => new Uint8Array([1]);
  if(reason === 'storage') ports.storage.stage = async () => { throw Error('Disk full'); };
  if(reason === 'migration') ports.prepareData = async () => { throw Error('Migration failed'); };
  if(reason === 'commit') ports.storage.commit = async () => { throw Error('Concurrent activation'); };
  await expect(stageAndActivate(signed({ ...release, id: 'alpha-2' }), context, ports)).rejects.toThrow();
  expect(current).toBe(previous); expect(current?.dataGeneration).toBe('generation-1');
});
test('rejects signed arbitrary endpoint paths and duplicate modules', async () => {
  const invalid = { ...release, artifacts: [{ ...release.artifacts[0], path: 'https://attacker.invalid/code' }, release.artifacts[1]] };
  await expect(verifyRelease(signed(invalid), context, ports.trust)).rejects.toThrow('path');
  await expect(verifyRelease(signed({ ...release, artifacts: [release.artifacts[0], release.artifacts[0]] }), context, ports.trust)).rejects.toThrow('Duplicate');
});
test('two companies can receive different pinned release sets; no global latest selection', async () => {
  const alpha = await verifyRelease(signed(release), context, ports.trust);
  const betaRelease = { ...release, id: 'beta-4', company: 'beta', artifacts: release.artifacts.map(a => ({ ...a, version: a.module === 'qr' ? '2.0.0' : a.version })) };
  const beta = await verifyRelease(signed(betaRelease), { ...context, company: 'beta', user: 'bob' }, ports.trust);
  expect(alpha.id).toBe('alpha-1'); expect(beta.id).toBe('beta-4');
  expect(alpha.artifacts[0].version).toBe('1.0.0'); expect(beta.artifacts[0].version).toBe('2.0.0');
  expect(alpha.artifacts[1]).toEqual(beta.artifacts[1]);
});
test('platform/format and every asset name/size are enforced before execution',async()=>{
  await expect(verifyRelease(signed({...release,platform:'web'}),context,ports.trust)).rejects.toThrow('platform');
  const bad={...release,artifacts:release.artifacts.map(a=>({...a,assets:[{name:'../escape.bundle',size:1,digest:a.digest,path:a.path}]}))};
  await expect(verifyRelease(signed(bad),context,ports.trust)).rejects.toThrow('asset name');
  const duplicate={...release,artifacts:release.artifacts.map(a=>({...a,assets:[{name:a.name,size:a.size,digest:a.digest,path:a.path}]}))};
  await expect(verifyRelease(signed(duplicate),context,ports.trust)).rejects.toThrow('asset name');
});
test('a signed empty entitlement set permits Core-only access without downloading modules',async()=>{
  ports.download=jest.fn();ports.storage.commit=async(_,next)=>{current=next;};
  await stageAndActivate(signed({...release,artifacts:[]}),{...context,modules:[]},ports);expect(current?.release.artifacts).toEqual([]);expect(ports.download).not.toHaveBeenCalled();
});
