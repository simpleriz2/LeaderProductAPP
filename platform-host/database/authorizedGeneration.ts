import type {SessionAuthority} from '../core/sessionAuthority';
import type {SessionLease} from '../core/sessionCoordinator';
import type {DataAccessGuard,createGenerationFence} from './generationFence';
/** Fixed order prevents authority changes during data access/preparation: Auth -> account generation. */
export function bindAuthorizedGeneration(authority:SessionAuthority,lease:SessionLease,fence:ReturnType<typeof createGenerationFence>):DataAccessGuard&{activation<T>(work:()=>Promise<T>):Promise<T>}{
  if(!authority?.run)throw Error('Data session authority required');
  return{
    run:(scope,module,schema,signal,work)=>{
      lease.assertCurrent();if(scope.company!==lease.session.company||scope.user!==lease.session.user||signal!==lease.signal)throw Error('Data authority scope mismatch');
      return authority.run(lease,()=>fence.run(scope,module,schema,signal,work));
    },
    activation:work=>authority.run(lease,()=>fence.activation(lease,work)),
  };
}
