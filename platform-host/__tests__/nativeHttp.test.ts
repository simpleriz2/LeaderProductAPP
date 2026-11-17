import { createNativeHttpTransport } from '../adapters/http.native';
test('aborted requests never start and in-flight abort cancels native request and rejects stale data',async()=>{
  const controller=new AbortController();const bridge={request:jest.fn(async()=>{controller.abort();return {status:200,body:'{"old":"data"}'};}),cancel:jest.fn()};
  const send=createNativeHttpTransport(bridge);const request={url:'http://127.0.0.1:3000/records',method:'GET' as const,token:'scoped',redirect:'error' as const,signal:controller.signal};
  await expect(send(request)).rejects.toThrow('aborted');expect(bridge.cancel).toHaveBeenCalledTimes(1);
  await expect(send(request)).rejects.toThrow('aborted');expect(bridge.request).toHaveBeenCalledTimes(1);
});
test('redirect and malformed JSON are refused without a JS fetch fallback',async()=>{
  const bridge={request:jest.fn(async()=>({status:302,body:''})),cancel:jest.fn()};const send=createNativeHttpTransport(bridge);
  const request={url:'http://127.0.0.1:3000/records',method:'GET' as const,token:'scoped',redirect:'error' as const,signal:new AbortController().signal};
  await expect(send(request)).rejects.toThrow('Redirect');bridge.request.mockResolvedValue({status:200,body:'invalid'});await expect(send(request)).rejects.toThrow();
});
