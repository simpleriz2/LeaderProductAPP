import {bindReleaseSession} from '../core/releaseSession';
import type {ReleaseContext,ReleasePorts} from '../core/releaseSet';
const context:ReleaseContext={platform:'android',company:'alpha',user:'alice',modules:['qr'],host:3,runtime:'fixture',compatibleApis:['1.0.0'],capabilities:{},contracts:{},moduleContracts:{qr:['1.0.0']}};
const ports={download:jest.fn(async()=>new Uint8Array([1]))} as unknown as Omit<ReleasePorts,'checkpoint'>;
test('release binding rejects another company/user/permission scope and offline network work',async()=>{
  const lease={session:{company:'alpha',user:'alice',modules:['qr'],confirmation:'confirmed'},online:false,signal:new AbortController().signal,assertCurrent:jest.fn()};
  for(const changed of [{company:'beta'},{user:'bob'},{modules:['help']}])expect(()=>bindReleaseSession(lease,{...context,...changed},ports)).toThrow('scope');
  const bound=bindReleaseSession(lease,context,ports);await expect(bound.download('fixture')).rejects.toThrow('Offline');expect(ports.download).not.toHaveBeenCalled();
});
test('release binding checks lease again after an in-flight download',async()=>{
  let stale=false;const lease={session:{company:'alpha',user:'alice',modules:['qr'],confirmation:'confirmed'},online:true,signal:new AbortController().signal,assertCurrent:()=>{if(stale)throw Error('Stale lease');}};
  const bound=bindReleaseSession(lease,context,{...ports,download:async()=>{stale=true;return new Uint8Array([1]);}});
  await expect(bound.download('fixture')).rejects.toThrow('Stale');
});
