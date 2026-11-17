import type {SessionAuthority} from '../core/sessionAuthority';
const authority:SessionAuthority={async run(lease,work){lease.assertCurrent();const result=await work();lease.assertCurrent();return result;}};
import { ServiceRouter, type ServiceRoutingPorts } from '../core/serviceRouter';
import type { SessionLease } from '../core/sessionCoordinator';
let lease: SessionLease, ports: ServiceRoutingPorts, controller: AbortController;
beforeEach(()=>{
  controller=new AbortController();lease={session:{company:'alpha',user:'alice',modules:['qr'],confirmation:'c1'},online:true,signal:controller.signal,assertCurrent:()=>{if(controller.signal.aborted)throw Error('Stale');}};
  ports={assignment:async kind=>({kind,company:'alpha',audience:`${kind}:alpha`,endpoint:'http://127.0.0.1:3000/api'}),restrictedToken:async(kind,company,audience)=>({value:'scoped-token',company,user:'alice',audience,expiresAt:Date.now()+60000}),send:jest.fn(async()=>({status:200,body:{ok:true}}))};
});
test('uses assigned service and audience; logical services have independent availability',async()=>{
  const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],authority);
  await router.request('company','/records/alice-draft');expect(router.status('company')).toBe('reachable');expect(router.status('artifacts')).toBe('unknown');
  expect(ports.send).toHaveBeenCalledWith(expect.objectContaining({url:'http://127.0.0.1:3000/api/records/alice-draft',token:'scoped-token',redirect:'error'}));
  ports.send=async()=>{throw Error('Storage offline');};await expect(router.request('artifacts','/manifest')).rejects.toThrow('Storage offline');
  expect(router.status('artifacts')).toBe('unavailable');expect(router.status('company')).toBe('reachable');
});
test.each(['//attacker.invalid','/../records','/%2e%2e/records','/\\attacker','/foo#fragment'])('rejects escaped path %s before token/network',async input=>{
  const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],authority);await expect(router.request('company',input)).rejects.toThrow('path');expect(ports.send).not.toHaveBeenCalled();
});
test.each(['endpoint','company','user','audience','expired'])('rejects incorrect %s assignment/token',async reason=>{
  if(reason==='endpoint')ports.assignment=async kind=>({kind,company:'alpha',audience:'company:alpha',endpoint:'https://attacker.invalid'});
  else ports.restrictedToken=async()=>({value:'scoped',company:reason==='company'?'beta':'alpha',user:reason==='user'?'bob':'alice',audience:reason==='audience'?'global':'company:alpha',expiresAt:reason==='expired'?0:Date.now()+60000});
  const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],authority);await expect(router.request('company','/records')).rejects.toThrow();expect(ports.send).not.toHaveBeenCalled();
});
test('offline never performs a new service login/request; stale in-flight response is ignored',async()=>{
  const router=new ServiceRouter({...lease,online:false},ports,['http://127.0.0.1:3000'],authority);await expect(router.request('company','/records')).rejects.toThrow('online');expect(ports.send).not.toHaveBeenCalled();
  ports.send=async()=>{controller.abort();return {status:200,body:{private:'old-user'}};};
  const active=new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],authority);await expect(active.request('company','/records')).rejects.toThrow('Stale');expect(active.status('company')).toBe('unknown');
});

test('artifact SDK accepts only digest keys and scoped binary success responses',async()=>{
  const {artifactDownloader}=require('../core/artifactDownload');
  const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],authority);const download=artifactDownloader(router);
  for(const key of ['https://attacker.invalid/bundle','artifacts/../secret','artifacts/not-a-digest.bundle']) await expect(download(key)).rejects.toThrow('Invalid artifact key');
  expect(ports.send).not.toHaveBeenCalled();
  const key=`artifacts/${'a'.repeat(64)}.bundle`;ports.send=async()=>({status:200,body:new Uint8Array([1,2,3])});
  await expect(download(key)).resolves.toEqual(new Uint8Array([1,2,3]));
  ports.send=async()=>({status:200,body:'unverified string'});await expect(download(key)).rejects.toThrow('Artifact unavailable');
  ports.send=async()=>({status:401,body:null});await expect(download(key)).rejects.toThrow('401');expect(router.status('artifacts')).toBe('denied');
});
test('session authority is mandatory and denies before discovery/token/network',async()=>{
 expect(()=>new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],null as unknown as SessionAuthority)).toThrow('authority required');
 ports.assignment=jest.fn(ports.assignment);ports.restrictedToken=jest.fn(ports.restrictedToken);
 const denied:SessionAuthority={run:async()=>{throw Error('Authority changed');}};
 const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],denied);await expect(router.request('company','/records')).rejects.toThrow('Authority changed');expect(ports.assignment).not.toHaveBeenCalled();expect(ports.restrictedToken).not.toHaveBeenCalled();expect(ports.send).not.toHaveBeenCalled();expect(router.status('company')).toBe('unknown');
});

test('explicit QR mutations preserve method/body and reject unsupported operations before credentials',async()=>{
 const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],authority);
 await router.execute('company','/qr/owned',{method:'PUT',body:{description:null}});
 expect(ports.send).toHaveBeenLastCalledWith(expect.objectContaining({method:'PUT',body:'{"description":null}',token:'scoped-token'}));
 await router.execute('company','/qr/owned',{method:'DELETE'});
 expect(ports.send).toHaveBeenLastCalledWith(expect.objectContaining({method:'DELETE',body:undefined}));
 ports.assignment=jest.fn(ports.assignment);ports.restrictedToken=jest.fn(ports.restrictedToken);(ports.send as jest.Mock).mockClear();
 for(const operation of [{method:'TRACE'}, {method:'GET',body:{}}, {method:'PUT',body:()=>{}}, {method:'POST',body:'x'.repeat(2*1024*1024)}]){
   await expect(router.execute('company','/qr/owned',operation as never)).rejects.toThrow();
 }
 expect(ports.assignment).not.toHaveBeenCalled();expect(ports.restrictedToken).not.toHaveBeenCalled();expect(ports.send).not.toHaveBeenCalled();
});

test('suspending one bound Company client cancels its IO without revoking another module or marking service unavailable',async()=>{
 const scope=new AbortController();ports.restrictedToken=async()=>({value:'scoped',company:'alpha',user:'alice',audience:'company:alpha',expiresAt:Date.now()+60000,releaseId:'set-1',api:'1.0.0'});
 ports.send=jest.fn(request=>new Promise((resolve,reject)=>{request.signal.addEventListener('abort',()=>reject(Error('Cancelled transport')),{once:true});scope.abort();}));
 const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],authority),binding={company:'alpha',id:'set-1',api:'1.0.0'};
 const suspended=router.forCompanyRelease(binding,scope.signal);await expect(suspended.execute('/qr',{method:'GET'})).rejects.toThrow('aborted');expect(controller.signal.aborted).toBe(false);expect(router.status('company')).toBe('unknown');
 (ports.send as jest.Mock).mockResolvedValue({status:200,body:{items:[]}});await expect(router.forCompanyRelease(binding).execute('/qr',{method:'GET'})).resolves.toEqual({status:200,body:{items:[]}});
 const count=(ports.send as jest.Mock).mock.calls.length;await expect(suspended.execute('/qr',{method:'GET'})).rejects.toThrow('aborted');expect(ports.send).toHaveBeenCalledTimes(count);
});
test('module suspension during restricted token acquisition prevents Company send even if port ignores cancellation',async()=>{
 const scope=new AbortController();ports.restrictedToken=async(_kind,_company,_audience,_release,signal)=>{scope.abort();expect(signal!.aborted).toBe(true);return{value:'scoped',company:'alpha',user:'alice',audience:'company:alpha',expiresAt:Date.now()+60000,releaseId:'set-1',api:'1.0.0'};};
 const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000'],authority);await expect(router.forCompanyRelease({company:'alpha',id:'set-1',api:'1.0.0'},scope.signal).execute('/qr',{method:'GET'})).rejects.toThrow('aborted');expect(ports.send).not.toHaveBeenCalled();
});
