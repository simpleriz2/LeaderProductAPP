import type { ServiceRoutingPorts } from '../core/serviceRouter';
export function createWebHttpTransport(fetcher: typeof fetch = fetch): ServiceRoutingPorts['send'] {
  return async request => {
    if(request.redirect !== 'error') throw Error('Redirect policy required');
    const response = await fetcher(request.url, { method:request.method, body:request.body,
      headers:{Authorization:`Bearer ${request.token}`,Accept:'application/json',...(request.body===undefined?{}:{'Content-Type':'application/json'})},
      signal:request.signal, redirect:'error', credentials:'omit', cache:'no-store' });
    if(response.status >= 300 && response.status < 400) throw Error('Redirect refused');
    const reader = response.body?.getReader(); const chunks:Uint8Array[]=[]; let size=0;
    if(reader) try {
      for(;;) { const next=await reader.read(); if(next.done)break;size+=next.value.length;if(size>2*1024*1024)throw Error('Response too large');chunks.push(next.value); }
    } catch(error) { await reader.cancel().catch(()=>undefined); throw error; }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const text=new TextDecoder().decode(bytes);if(request.signal.aborted)throw Error('Request aborted');
    return {status:response.status,body:text?JSON.parse(text):null};
  };
}
