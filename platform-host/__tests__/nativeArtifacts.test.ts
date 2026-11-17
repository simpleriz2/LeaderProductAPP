import {createNativeArtifactTransport} from '../adapters/artifacts.native';
const request={url:'http://127.0.0.1:3000/artifacts/fixture',method:'GET' as const,token:'scoped',redirect:'error' as const,signal:new AbortController().signal};
test('native binary bridge preserves bytes, denies redirect/malformed bytes and does not use JSON fallback',async()=>{
  const bridge={requestBytes:jest.fn(async()=>({status:200,body:'AP+A'})),cancel:jest.fn()};const send=createNativeArtifactTransport(bridge);
  await expect(send(request)).resolves.toEqual({status:200,body:new Uint8Array([0,255,128])});
  bridge.requestBytes.mockResolvedValue({status:302,body:''});await expect(send(request)).rejects.toThrow('Redirect');
  bridge.requestBytes.mockResolvedValue({status:200,body:'invalid'});await expect(send(request)).rejects.toThrow('base64');
  bridge.requestBytes.mockResolvedValue({status:403,body:'not decoded'});await expect(send(request)).resolves.toEqual({status:403,body:null});
});
test('aborted native downloads never return stale-account bytes or start a replacement request',async()=>{
  const controller=new AbortController();const bridge={requestBytes:jest.fn(async()=>{controller.abort();return{status:200,body:'AQ=='};}),cancel:jest.fn()};
  const send=createNativeArtifactTransport(bridge);const owned={...request,signal:controller.signal};
  await expect(send(owned)).rejects.toThrow('aborted');expect(bridge.cancel).toHaveBeenCalledTimes(1);
  await expect(send(owned)).rejects.toThrow('aborted');expect(bridge.requestBytes).toHaveBeenCalledTimes(1);
  await expect(send({...request,method:'POST',body:'{}'})).rejects.toThrow('GET');
});
