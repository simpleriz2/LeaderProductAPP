import { ServiceRouter, type ServiceRoutingPorts } from '../core/serviceRouter';
import type { SessionLease } from '../core/sessionCoordinator';
let lease: SessionLease, ports: ServiceRoutingPorts, controller: AbortController;
beforeEach(()=>{
  controller=new AbortController();lease={session:{company:'alpha',user:'alice',modules:['qr'],confirmation:'c1'},online:true,signal:controller.signal,assertCurrent:()=>{if(controller.signal.aborted)throw Error('Stale');}};
  ports={assignment:async kind=>({kind,company:'alpha',audience:`${kind}:alpha`,endpoint:'http://127.0.0.1:3000/api'}),restrictedToken:async(kind,company,audience)=>({value:'scoped-token',company,user:'alice',audience,expiresAt:Date.now()+60000}),send:jest.fn(async()=>({status:200,body:{ok:true}}))};
});
test('uses assigned service and audience; logical services have independent availability',async()=>{
  const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000']);
  await router.request('company','/records/alice-draft');expect(router.status('company')).toBe('reachable');expect(router.status('artifacts')).toBe('unknown');
  expect(ports.send).toHaveBeenCalledWith(expect.objectContaining({url:'http://127.0.0.1:3000/api/records/alice-draft',token:'scoped-token',redirect:'error'}));
  ports.send=async()=>{throw Error('Storage offline');};await expect(router.request('artifacts','/manifest')).rejects.toThrow('Storage offline');
  expect(router.status('artifacts')).toBe('unavailable');expect(router.status('company')).toBe('reachable');
});
test.each(['//attacker.invalid','/../records','/%2e%2e/records','/\\attacker','/foo#fragment'])('rejects escaped path %s before token/network',async input=>{
  const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000']);await expect(router.request('company',input)).rejects.toThrow('path');expect(ports.send).not.toHaveBeenCalled();
});
test.each(['endpoint','company','user','audience','expired'])('rejects incorrect %s assignment/token',async reason=>{
  if(reason==='endpoint')ports.assignment=async kind=>({kind,company:'alpha',audience:'company:alpha',endpoint:'https://attacker.invalid'});
  else ports.restrictedToken=async()=>({value:'scoped',company:reason==='company'?'beta':'alpha',user:reason==='user'?'bob':'alice',audience:reason==='audience'?'global':'company:alpha',expiresAt:reason==='expired'?0:Date.now()+60000});
  const router=new ServiceRouter(lease,ports,['http://127.0.0.1:3000']);await expect(router.request('company','/records')).rejects.toThrow();expect(ports.send).not.toHaveBeenCalled();
});
test('offline never performs a new service login/request; stale in-flight response is ignored',async()=>{
  const router=new ServiceRouter({...lease,online:false},ports,['http://127.0.0.1:3000']);await expect(router.request('company','/records')).rejects.toThrow('online');expect(ports.send).not.toHaveBeenCalled();
  ports.send=async()=>{controller.abort();return {status:200,body:{private:'old-user'}};};
  const active=new ServiceRouter(lease,ports,['http://127.0.0.1:3000']);await expect(active.request('company','/records')).rejects.toThrow('Stale');expect(active.status('company')).toBe('unknown');
});
