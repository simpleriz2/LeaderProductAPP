import type { ServiceRouter } from './serviceRouter';
/** Opaque digest keys only. URLs and universal tokens never enter module download contracts. */
export function artifactDownloader(router: ServiceRouter): (key: string) => Promise<Uint8Array> {
  return async key => {
    if (!/^artifacts\/[a-f0-9]{64}\.bundle$/.test(key)) throw Error('Invalid artifact key');
    const response = await router.request('artifacts', `/${key}`);
    if (response.status !== 200 || !(response.body instanceof Uint8Array)) throw Error(`Artifact unavailable (${response.status})`);
    return response.body;
  };
}
