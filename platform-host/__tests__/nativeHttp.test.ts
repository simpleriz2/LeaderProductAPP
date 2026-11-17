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
test('public Central login port omits bearer argument and cancellation settles even if native queue never resolves',async()=>{
 const{createNativePublicHttpTransport}=require('../adapters/http.native');const controller=new AbortController();
 const bridge={requestPublic:jest.fn(()=>new Promise<never>(()=>{})),cancel:jest.fn()};const send=createNativePublicHttpTransport(bridge),pending=send({url:'http://127.0.0.1:3000/login',method:'POST',body:'{}',redirect:'error',signal:controller.signal});await Promise.resolve();controller.abort();await expect(pending).rejects.toThrow('aborted');expect(bridge.requestPublic).toHaveBeenCalledWith(expect.any(String),'http://127.0.0.1:3000/login','POST','{}');expect(bridge.cancel).toHaveBeenCalledTimes(1);
});
test('JSON/public/binary native queues have full JS deadlines and cancel even before native execution',async()=>{
 const{createNativePublicHttpTransport}=require('../adapters/http.native');const{createNativeArtifactTransport}=require('../adapters/artifacts.native');
 const controller=new AbortController(),bridge={request:jest.fn(()=>new Promise<never>(()=>{})),requestPublic:jest.fn(()=>new Promise<never>(()=>{})),requestBytes:jest.fn(()=>new Promise<never>(()=>{})),cancel:jest.fn()};
 const request={url:'http://127.0.0.1:3000/fixture',method:'GET' as const,token:'scoped',redirect:'error' as const,signal:controller.signal};
 for(const send of [createNativeHttpTransport(bridge,20),createNativePublicHttpTransport(bridge,20),createNativeArtifactTransport(bridge,20)])await expect(send(request)).rejects.toThrow('deadline exceeded');expect(bridge.cancel).toHaveBeenCalledTimes(3);
});
