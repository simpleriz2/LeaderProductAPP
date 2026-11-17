import type {ReleaseContext,ReleasePorts} from './releaseSet';
import type {SessionLease} from './sessionCoordinator';
/** Binds every cached/download/migration/activation continuation to the confirmed account. */
export function bindReleaseSession(lease:SessionLease,context:ReleaseContext,ports:Omit<ReleasePorts,'checkpoint'>):ReleasePorts {
  const checkpoint=()=>{
    lease.assertCurrent();
    if(context.company!==lease.session.company||context.user!==lease.session.user||context.modules.length!==lease.session.modules.length||!context.modules.every(m=>lease.session.modules.includes(m)))throw Error('Release session scope mismatch');
  };
  checkpoint();
  return {...ports,checkpoint,download:async key=>{
    checkpoint();if(!lease.online)throw Error('Offline release download denied');
    const bytes=await ports.download(key);checkpoint();return bytes;
  }};
}
