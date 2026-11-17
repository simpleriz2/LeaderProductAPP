const{test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
if(!process.env.LP2_API_PILOT_ROOT)throw Error('Explicit API pilot path required');
const{startPilot}=require(path.join(process.env.LP2_API_PILOT_ROOT,'dev/platform-pilot/pilot.cjs'));
const{ServiceRouter}=require('../../core/serviceRouter.ts');const{createWebHttpTransport}=require('../../adapters/http.web.ts');
test('actual Company router pins active release across assignment and API retirement, never forwards mismatched token',async t=>{
 const p=await startPilot();t.after(()=>p.close());
 const central=async(path,body,token)=>fetch(p.central.url+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const session=(await(await central('/login',{user:'alice',password:'fixture-only'})).json()).token;
 const first=JSON.parse((await(await central('/discovery',undefined,session)).json()).release.payload);
 const lease={session:{company:'alpha',user:'alice',modules:['qr'],confirmation:'test'},online:true,signal:new AbortController().signal,assertCurrent(){if(this.signal.aborted)throw Error('Stale');}};
 let wrongToken=false,sendCount=0;const send=createWebHttpTransport();
 const ports={assignment:async()=>({kind:'company',company:'alpha',audience:'company:alpha',endpoint:p.companies.alpha.url}),restrictedToken:async(kind,company,audience,release)=>{
   const response=await central('/tokens',{audience,activeReleaseId:wrongToken?undefined:release.id},session);if(!response.ok)throw Error(`Token status ${response.status}`);const token=await response.json();return{...token,value:token.token};
 },send:request=>{sendCount++;return send(request);}};
 const router=new ServiceRouter(lease,ports,[p.companies.alpha.url],{run:async(lease,work)=>{lease.assertCurrent();return work();}});
 const old=router.forCompanyRelease({company:'alpha',id:first.id,api:first.api});assert.equal((await old.execute('/records/alice-draft',{method:'GET'})).status,200);
 p.setSupportedApis('alpha',['1.0.0','2.0.0']);const release={...first,id:'alpha-api2-client',api:'2.0.0'};const artifactToken=(await(await central('/tokens',{audience:'artifacts'},session)).json()).token;const files=new Map();for(const artifact of first.artifacts){for(const file of [artifact,...artifact.assets]){const response=await fetch(p.artifactServer.url+'/'+file.path,{headers:{authorization:`Bearer ${artifactToken}`}});assert.equal(response.status,200);files.set(file.path,Buffer.from(await response.arrayBuffer()));}}p.assignRelease(release,files);
 assert.equal((await old.execute('/records/alice-draft',{method:'GET'})).status,200);
 const next=router.forCompanyRelease({company:'alpha',id:release.id,api:release.api});assert.equal((await next.execute('/records/alice-draft',{method:'GET'})).status,200);
 wrongToken=true;const before=sendCount;await assert.rejects(old.execute('/records/alice-draft',{method:'GET'}),/Wrong active release token/);assert.equal(sendCount,before);wrongToken=false;
 p.setSupportedApis('alpha',['2.0.0']);await assert.rejects(old.execute('/records/alice-draft',{method:'GET'}),/Token status 409/);assert.equal((await next.execute('/records/alice-draft',{method:'GET'})).status,200);
 assert.throws(()=>router.forCompanyRelease({company:'beta',id:'beta-4',api:'1.0.0'}),/Invalid active/);
});
