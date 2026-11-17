import {identifier} from './contracts.ts';
import type {DataScope} from './contracts';
import type {SessionLease} from '../core/sessionCoordinator';
import type {Activation} from '../core/releaseSet';
export interface GenerationLock{run<T>(company:string,user:string,mode:'shared'|'exclusive',signal:AbortSignal,work:()=>Promise<T>):Promise<T>}
export interface DataAccessGuard{run<T>(scope:DataScope,module:string,schema:number,signal:AbortSignal,work:()=>Promise<T>):Promise<T>}
export function createGenerationFence(lock:GenerationLock,current:(company:string,user:string)=>Promise<Activation|null>){
  return{
    run:<T>(scope:DataScope,module:string,schema:number,signal:AbortSignal,work:()=>Promise<T>)=>lock.run(scope.company,scope.user,'shared',signal,async()=>{
      if(signal.aborted)throw Error('Stale data lease');const active=await current(scope.company,scope.user);
      if(signal.aborted)throw Error('Stale data lease');if(active?.company!==scope.company||active?.user!==scope.user||active?.dataGeneration!==scope.generation)throw Error('Data generation changed; restart required');
      if(!active.release.artifacts.some(a=>a.module===module&&a.schema===schema))throw Error('Data module rights/schema changed; restart required');
      return work();
    }),
    activation:<T>(lease:SessionLease,work:()=>Promise<T>)=>lock.run(lease.session.company,lease.session.user,'exclusive',lease.signal,async()=>{
      lease.assertCurrent();const result=await work();lease.assertCurrent();return result;
    }),
  };
}
/** Native single-JS-host/reference lock. All operations serialize; a multi-process host needs native coordination. */
export function createSerialGenerationLock():GenerationLock{
  const tails=new Map<string,Promise<void>>();
  return{run:<T>(company:string,user:string,_mode:'shared'|'exclusive',signal:AbortSignal,work:()=>Promise<T>):Promise<T>=>{
    const key=`${identifier(company)}/${identifier(user)}`;if(signal.aborted)return Promise.reject(Error('Stale data lease'));
    const result=(tails.get(key)||Promise.resolve()).then(()=>{if(signal.aborted)throw Error('Stale data lease');return work();});
    const tail=result.then(()=>{},()=>{});tails.set(key,tail);void tail.then(()=>{if(tails.get(key)===tail)tails.delete(key);});
    return new Promise((resolve,reject)=>{const abort=()=>reject(Error('Stale data lease'));signal.addEventListener('abort',abort,{once:true});result.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
  }};
}
