/** Semantic contracts shared by Android and Web. No Expo, UI, SQL or transport imports. */
export type ArtifactFile = { name: string; digest: string; path: string; size: number };
export type ModuleRequirements = { minHost: number; capabilities: Record<string, number>; contracts: Record<string, string> };
export type Artifact = ArtifactFile & { requires: ModuleRequirements; module: string; version: string; contract: string; schema: number; assets: ArtifactFile[] };
export type ReleaseSet = { format: 2; platform: 'android' | 'web'; id: string; company: string; minHost: number; runtime: string; api: string; artifacts: Artifact[] };
export type SignedRelease = { keyId: string; payload: string; signature: string };
export interface Trust {
  verifyEd25519(keyId: string, payload: string, signature: string): Promise<boolean>;
  sha256(bytes: Uint8Array): Promise<string>;
}
export type ReleaseContext = { platform: 'android' | 'web'; company: string; user: string; host: number; runtime: string; compatibleApis: readonly string[]; capabilities: Readonly<Record<string, readonly number[]>>; contracts: Readonly<Record<string, readonly string[]>>; moduleContracts: Readonly<Record<string, readonly string[]>>; modules: readonly string[] };
const id = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const identifier = (value: unknown): value is string => typeof value === 'string' && id.test(value);
const version = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
function requireValue(condition: unknown, reason: string): asserts condition { if (!condition) throw Error(reason); }
export async function verifyRelease(signed: SignedRelease, context: ReleaseContext, trust: Trust): Promise<ReleaseSet> {
  requireValue(signed.payload.length <= 256 * 1024, 'Manifest too large');
  requireValue(await trust.verifyEd25519(signed.keyId, signed.payload, signed.signature), 'Untrusted signature');
  const release: ReleaseSet = JSON.parse(signed.payload);
  requireValue(release && release.format === 2 && release.platform === context.platform && ['android','web'].includes(context.platform), 'Incompatible manifest platform/format');
  requireValue(identifier(release.id) && release.company === context.company, 'Wrong company/release');
  requireValue(identifier(context.company) && identifier(context.user), 'Invalid namespace');
  requireValue(Number.isSafeInteger(release.minHost) && release.minHost > 0 && release.minHost <= context.host, 'Incompatible host');
  requireValue(release.runtime === context.runtime && context.compatibleApis.includes(release.api), 'Incompatible runtime/API');
  requireValue(Array.isArray(release.artifacts) && release.artifacts.length <= 128, 'Invalid artifacts');
  const seen = new Set<string>();
  let fileCount = 0; let totalBytes = 0;
  for (const artifact of release.artifacts) {
    requireValue(artifact && identifier(artifact.module) && !seen.has(artifact.module), 'Duplicate/invalid module');
    seen.add(artifact.module);
    requireValue(context.modules.includes(artifact.module), 'Module not entitled');
    requireValue(version.test(artifact.version) && version.test(artifact.contract), 'Versions must be exact');
    requireValue(Object.hasOwn(context.moduleContracts, artifact.module) && context.moduleContracts[artifact.module].includes(artifact.contract), 'Incompatible module contract');
    const requirements = artifact.requires;
    requireValue(requirements && Number.isSafeInteger(requirements.minHost) && requirements.minHost > 0 && requirements.minHost <= context.host, 'Incompatible module host');
    requireValue(requirements.capabilities && typeof requirements.capabilities === 'object' && !Array.isArray(requirements.capabilities) && Object.keys(requirements.capabilities).length <= 128, 'Invalid capability requirements');
    for (const [name, revision] of Object.entries(requirements.capabilities)) {
      requireValue(identifier(name) && Number.isSafeInteger(revision) && revision > 0, 'Invalid capability requirement');
      requireValue(Object.hasOwn(context.capabilities, name) && context.capabilities[name].includes(revision), 'Unsupported native capability');
    }
    requireValue(requirements.contracts && typeof requirements.contracts === 'object' && !Array.isArray(requirements.contracts) && Object.keys(requirements.contracts).length <= 128, 'Invalid contract requirements');
    for (const [name, required] of Object.entries(requirements.contracts)) {
      requireValue(identifier(name) && typeof required === 'string' && version.test(required), 'Invalid contract requirement');
      requireValue(Object.hasOwn(context.contracts, name) && context.contracts[name].includes(required), 'Unsupported semantic contract');
    }
    requireValue(Number.isSafeInteger(artifact.schema) && artifact.schema >= 0, 'Invalid schema');
    requireValue(Array.isArray(artifact.assets) && artifact.assets.length <= 512, 'Invalid asset inventory');
    const names = new Set<string>();
    for(const file of [artifact, ...artifact.assets]) {
      requireValue(typeof file.name === 'string' && file.name.length <= 512 && file.name.split('/').every(part => part !== '.' && part !== '..' && /^[A-Za-z0-9_.-]{1,255}$/.test(part)) && !names.has(file.name), 'Invalid/duplicate asset name');
      names.add(file.name);
      requireValue(/^[a-f0-9]{64}$/.test(file.digest), 'Invalid digest');
      requireValue(file.path === `artifacts/${file.digest}.bundle`, 'Invalid artifact path');
      requireValue(Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= 1024 * 1024 * 1024, 'Invalid asset size');
      fileCount++; totalBytes += file.size;
      requireValue(fileCount <= 4096 && totalBytes <= 1024 * 1024 * 1024, 'Release inventory too large');
    }
  }
  requireValue(context.modules.length === seen.size && context.modules.every(m => seen.has(m)), 'Incomplete release set');
  return release;
}
export type Activation = { company: string; user: string; release: ReleaseSet; signed: SignedRelease; dataGeneration: string };
export interface ReleaseStorage {
  current(company: string, user: string): Promise<Activation | null>;
  cachedFile(company: string, user: string, file: ArtifactFile): Promise<Uint8Array | null>;
  stage(namespace: string, artifact: ArtifactFile, bytes: Uint8Array): Promise<void>;
  discard(namespace: string): Promise<void>;
  /** Must atomically commit code + data pointers iff expected still matches. Keep previous LKG. */
  commit(expected: Activation | null, next: Activation, stagedNamespace: string): Promise<void>;
}
export type ReleaseProgress = { phase: 'verify-manifest'|'download'|'verify-files'|'migrate'|'activate'|'ready'; completed: number; total: number };
export interface ReleasePorts {
  /** Must throw for an invalidated login/logout/revoke/account-switch lease. */
  checkpoint(): void;
  onProgress?(progress: ReleaseProgress): void;
  trust: Trust;
  createAttemptId(): string;
  storage: ReleaseStorage;
  /** Transport owns trusted endpoint/audience credentials; key is not a URL. */
  download(key: string): Promise<Uint8Array>;
  /** Prepare isolated data generation; never destructively migrate the active generation. */
  prepareData(release: ReleaseSet, previous: Activation | null): Promise<string>;
}
export async function stageAndActivate(signed: SignedRelease, context: ReleaseContext, ports: ReleasePorts): Promise<Activation> {
  ports.checkpoint();
  const report = (phase: ReleaseProgress['phase'], completed: number, total: number) => {
    ports.checkpoint();
    try { ports.onProgress?.({phase,completed,total}); } catch { /* Observers cannot own activation correctness. */ }
    ports.checkpoint();
  };
  report('verify-manifest',0,0);
  const release = await verifyRelease(signed, context, ports.trust);
  ports.checkpoint();
  const previous = await ports.storage.current(context.company, context.user);
  ports.checkpoint();
  requireValue(!previous || (previous.company === context.company && previous.user === context.user), 'Wrong stored namespace');
  const attempt = ports.createAttemptId();
  requireValue(identifier(attempt), 'Invalid attempt id');
  const namespace = `${context.company}/${context.user}/${release.id}/${attempt}`;
  try {
    const files = artifactFiles(release); let completed = 0;
    for (const file of files) {
      report('verify-files',completed,files.length);
      const cached = await ports.storage.cachedFile(context.company, context.user, file);
      ports.checkpoint();
      const validCache = cached !== null && cached.length === file.size && await ports.trust.sha256(cached) === file.digest;
      ports.checkpoint();
      if(!validCache) report('download',completed,files.length);
      const bytes = validCache ? cached : await ports.download(file.path);
      ports.checkpoint();
      requireValue(bytes.length === file.size, 'Artifact size mismatch');
      requireValue(await ports.trust.sha256(bytes) === file.digest, 'Artifact digest mismatch');
      ports.checkpoint();
      await ports.storage.stage(namespace, file, bytes);
      ports.checkpoint(); completed++;
    }
    report('migrate',completed,files.length);
    const dataGeneration = await ports.prepareData(release, previous);
    ports.checkpoint();
    requireValue(identifier(dataGeneration), 'Invalid data generation');
    const next = { company: context.company, user: context.user, release, signed, dataGeneration };
    report('activate',completed,files.length);
    await ports.storage.commit(previous, next, namespace);
    report('ready',completed,files.length);
    return next;
  } catch (error) {
    // Cleanup failure must not hide the actual activation failure or erase last-known-good.
    await ports.storage.discard(namespace).catch(() => undefined);
    throw error;
  }
}

/** Code-only rollback is allowed only when the target declares the current data schema. */
export async function rollbackCode(signed: SignedRelease, context: ReleaseContext, ports: ReleasePorts): Promise<Activation> {
  ports.checkpoint();
  const target = await verifyRelease(signed, context, ports.trust);
  ports.checkpoint();
  const current = await ports.storage.current(context.company, context.user);
  requireValue(current && current.company === context.company && current.user === context.user, 'No current namespace');
  ports.checkpoint();
  const confirmed = await verifyRelease(current.signed, context, ports.trust);
  ports.checkpoint();
  requireValue(JSON.stringify(confirmed) === JSON.stringify(current.release), 'Corrupt current metadata');
  requireValue(target.artifacts.every(a => current.release.artifacts.some(b => b.module === a.module && b.schema === a.schema)), 'Rollback requires compatible current data schema');
  return stageAndActivate(signed, context, { ...ports, prepareData: async (_, actual) => {
    requireValue(actual?.dataGeneration === current.dataGeneration && actual?.release.id === current.release.id, 'Concurrent rollback');
    return current.dataGeneration;
  } });
}

export function artifactFiles(release: ReleaseSet): ArtifactFile[] { return release.artifacts.flatMap(module => [module, ...module.assets]); }
