import {identifier} from './contracts.ts';
import type {GenerationLock} from './generationFence';
/** Shared across every tab of this origin. No unsafe local-only fallback when Web Locks is unavailable. */
export function createWebGenerationLock(manager:LockManager=globalThis.navigator?.locks):GenerationLock{
  if(!manager?.request)throw Error('Cross-tab data locks unavailable');
  return{run:(company,user,mode,signal,work)=>manager.request(`lp2-data/${identifier(company)}/${identifier(user)}`,{mode,signal},work)};
}
