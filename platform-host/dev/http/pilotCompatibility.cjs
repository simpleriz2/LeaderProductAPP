// Cross-repository contract proof. Explicit local API fork path; no external service/default.
const path=require('node:path');const assert=require('node:assert/strict');
if(!process.env.LP2_API_PILOT_ROOT)throw Error('Set LP2_API_PILOT_ROOT to the local LeaderProductAPI fork');
const {startPilot}=require(path.join(process.env.LP2_API_PILOT_ROOT,'dev/platform-pilot/pilot.cjs'));
const {ServiceRouter}=require('../../core/serviceRouter.ts');const {createWebHttpTransport}=require('../../adapters/http.web.ts');
(async()=>{
  const pilot=await startPilot();try {
    for(const [user,company] of [['alice','alpha'],['bob','beta']]) {
      const session=await (await fetch(`${pilot.central.url}/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user,password:'fixture-only'})})).json();
      const controller=new AbortController();
      const lease={session:{company,user,modules:['qr'],confirmation:'pilot-confirmed'},online:true,signal:controller.signal,assertCurrent:()=>{if(controller.signal.aborted)throw Error('Stale');}};
      const router=new ServiceRouter(lease,{
        assignment:async kind=>{
          const response=await fetch(`${pilot.central.url}/discovery`,{headers:{authorization:`Bearer ${session.token}`}});
          if(!response.ok)throw Error('Central denied');
          const discovery=await response.json();
          return {kind,company:discovery.company,audience:`company:${discovery.company}`,endpoint:discovery.companyApi};
        },
        restrictedToken:async(_,requestedCompany,audience)=>{
          assert.equal(requestedCompany,company);
          const r=await fetch(`${pilot.central.url}/tokens`,{method:'POST',headers:{authorization:`Bearer ${session.token}`,'content-type':'application/json'},body:JSON.stringify({audience})});assert.equal(r.status,200);
          const token=await r.json();return {...token,value:token.token};
        },send:createWebHttpTransport(),
      },[pilot.companies[company].url],{async run(lease,work){lease.assertCurrent();const result=await work();lease.assertCurrent();return result;}});
      const response=await router.request('company',`/records/${user}-draft`);assert.equal(response.status,200);assert.equal(response.body.company,company);assert.equal(response.body.owner,user);
      assert.equal(router.status('artifacts'),'unknown');
      pilot.revoke(user);await assert.rejects(router.request('company',`/records/${user}-draft`),/Central denied/);
    }
    console.log('APP ServiceRouter + real HTTP transport / API Central+Company pilot: two-tenant routing and revoke passed');
  } finally {await pilot.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
