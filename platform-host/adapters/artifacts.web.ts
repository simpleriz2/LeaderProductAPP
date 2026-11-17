import type { ServiceRoutingPorts } from '../core/serviceRouter';
import { readResponseBytes } from './httpBytes.web.ts';
/** Invoke only through ServiceRouter, which validates Central assignment and audience token. */
export function createWebArtifactTransport(fetcher: typeof fetch = fetch): ServiceRoutingPorts['send'] {
  return async request => {
    if (request.redirect !== 'error' || request.method !== 'GET' || request.body !== undefined) throw Error('Artifact GET required');
    const response = await fetcher(request.url, {
      method: 'GET', headers: { Authorization: `Bearer ${request.token}`, Accept: 'application/octet-stream' },
      signal: request.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
    });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw Error('Redirect refused'); }
    if (response.status !== 200) { await response.body?.cancel(); return { status: response.status, body: null }; }
    return { status: response.status, body: await readResponseBytes(response, request.signal, 12 * 1024 * 1024) };
  };
}
