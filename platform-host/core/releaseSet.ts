/** Semantic contracts shared by Android and Web. No Expo, UI, SQL or transport imports. */
export type Artifact = { module: string; version: string; contract: string; schema: number; digest: string; path: string };
export type ReleaseSet = { id: string; company: string; minHost: number; runtime: string; api: string; artifacts: Artifact[] };
export type SignedRelease = { keyId: string; payload: string; signature: string };
export interface Trust {
  verifyEd25519(keyId: string, payload: string, signature: string): Promise<boolean>;
  sha256(bytes: Uint8Array): Promise<string>;
}
export type ReleaseContext = { company: string; user: string; host: number; runtime: string; compatibleApis: readonly string[]; modules: readonly string[] };
const id = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const identifier = (value: unknown): value is string => typeof value === 'string' && id.test(value);
const version = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
function requireValue(condition: unknown, reason: string): asserts condition { if (!condition) throw Error(reason); }
export async function verifyRelease(signed: SignedRelease, context: ReleaseContext, trust: Trust): Promise<ReleaseSet> {
  requireValue(signed.payload.length <= 256 * 1024, 'Manifest too large');
  requireValue(await trust.verifyEd25519(signed.keyId, signed.payload, signed.signature), 'Untrusted signature');
  const release: ReleaseSet = JSON.parse(signed.payload);
  requireValue(release && identifier(release.id) && release.company === context.company, 'Wrong company/release');
  requireValue(identifier(context.company) && identifier(context.user), 'Invalid namespace');
  requireValue(Number.isSafeInteger(release.minHost) && release.minHost > 0 && release.minHost <= context.host, 'Incompatible host');
  requireValue(release.runtime === context.runtime && context.compatibleApis.includes(release.api), 'Incompatible runtime/API');
  requireValue(Array.isArray(release.artifacts) && release.artifacts.length > 0 && release.artifacts.length <= 128, 'Invalid artifacts');
  const seen = new Set<string>();
  for (const artifact of release.artifacts) {
    requireValue(artifact && identifier(artifact.module) && !seen.has(artifact.module), 'Duplicate/invalid module');
    seen.add(artifact.module);
    requireValue(context.modules.includes(artifact.module), 'Module not entitled');
    requireValue(version.test(artifact.version) && version.test(artifact.contract), 'Versions must be exact');
    requireValue(Number.isSafeInteger(artifact.schema) && artifact.schema >= 0, 'Invalid schema');
    requireValue(/^[a-f0-9]{64}$/.test(artifact.digest), 'Invalid digest');
    // Only immutable relative keys, resolved by the trusted artifact transport; never caller URLs.
    requireValue(artifact.path === `artifacts/${artifact.digest}.bundle`, 'Invalid artifact path');
  }
  requireValue(context.modules.length === seen.size && context.modules.every(m => seen.has(m)), 'Incomplete release set');
  return release;
}
export type Activation = { company: string; user: string; release: ReleaseSet; dataGeneration: string };
export interface ReleaseStorage {
  current(company: string, user: string): Promise<Activation | null>;
  stage(namespace: string, artifact: Artifact, bytes: Uint8Array): Promise<void>;
  discard(namespace: string): Promise<void>;
  /** Must atomically commit code + data pointers iff expected still matches. Keep previous LKG. */
  commit(expected: Activation | null, next: Activation, stagedNamespace: string): Promise<void>;
}
export interface ReleasePorts {
  trust: Trust;
  createAttemptId(): string;
  storage: ReleaseStorage;
  /** Transport owns trusted endpoint/audience credentials; key is not a URL. */
  download(key: string): Promise<Uint8Array>;
  /** Prepare isolated data generation; never destructively migrate the active generation. */
  prepareData(release: ReleaseSet, previous: Activation | null): Promise<string>;
}
export async function stageAndActivate(signed: SignedRelease, context: ReleaseContext, ports: ReleasePorts): Promise<Activation> {
  const release = await verifyRelease(signed, context, ports.trust);
  const previous = await ports.storage.current(context.company, context.user);
  const attempt = ports.createAttemptId();
  requireValue(identifier(attempt), 'Invalid attempt id');
  const namespace = `${context.company}/${context.user}/${release.id}/${attempt}`;
  try {
    for (const artifact of release.artifacts) {
      const bytes = await ports.download(artifact.path);
      requireValue(await ports.trust.sha256(bytes) === artifact.digest, 'Artifact digest mismatch');
      await ports.storage.stage(namespace, artifact, bytes);
    }
    const dataGeneration = await ports.prepareData(release, previous);
    requireValue(identifier(dataGeneration), 'Invalid data generation');
    const next = { company: context.company, user: context.user, release, dataGeneration };
    await ports.storage.commit(previous, next, namespace);
    return next;
  } catch (error) {
    // Cleanup failure must not hide the actual activation failure or erase last-known-good.
    await ports.storage.discard(namespace).catch(() => undefined);
    throw error;
  }
}
