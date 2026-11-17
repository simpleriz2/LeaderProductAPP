import {withWebRequestDeadline} from './requestDeadline.web.ts';
import type { ServiceRoutingPorts } from '../core/serviceRouter';
import { readResponseBytes } from './httpBytes.web.ts';
export function createWebHttpTransport(fetcher: typeof fetch = fetch,timeoutMs=15000): ServiceRoutingPorts['send'] {
  return async request => {
    if(request.redirect !== 'error') throw Error('Redirect policy required');
    return withWebRequestDeadline(request.signal,timeoutMs,async signal=>{
    const response = await fetcher(request.url, { method:request.method, body:request.body,
      headers:{Authorization:`Bearer ${request.token}`,Accept:'application/json',...(request.body===undefined?{}:{'Content-Type':'application/json'})},
      signal, redirect:'error', credentials:'omit', cache:'no-store' });
    if(response.status >= 300 && response.status < 400){await response.body?.cancel();throw Error('Redirect refused');}
    const bytes = await readResponseBytes(response, signal, 2 * 1024 * 1024);
    const text=new TextDecoder().decode(bytes);if(signal.aborted)throw Error('Request aborted');
    return {status:response.status,body:text?JSON.parse(text):null};
    });
  };
}
