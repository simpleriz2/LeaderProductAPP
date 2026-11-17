import { NativeModules } from 'react-native';
import type { ServiceRoutingPorts } from '../core/serviceRouter';
type Bridge = { request(id: string, url: string, method: string, token: string, body: string | null): Promise<{ status: number; body: string }>; cancel(id: string): void };
let sequence = 0;
export function createNativeHttpTransport(bridge: Bridge = NativeModules.LeaderHttp): ServiceRoutingPorts['send'] {
  if(!bridge) throw Error('Native HTTP transport unavailable');
  return async request => {
    if(request.signal.aborted) throw Error('Request aborted');
    if(request.redirect !== 'error') throw Error('Redirect policy required');
    const id = `http-${Date.now()}-${++sequence}`;
    const cancel = () => bridge.cancel(id);
    request.signal.addEventListener('abort',cancel,{once:true});
    try {
      const response = await bridge.request(id,request.url,request.method,request.token,request.body ?? null);
      if(request.signal.aborted) throw Error('Request aborted');
      if(response.status >= 300 && response.status < 400) throw Error('Redirect refused');
      return { status: response.status, body: response.body ? JSON.parse(response.body) : null };
    } finally { request.signal.removeEventListener('abort',cancel); }
  };
}
