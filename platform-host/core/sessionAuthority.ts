import type {SessionLease} from './sessionCoordinator';
/** Platform Auth owns current authority. Required for protected IO; no permissive Core default. */
export interface SessionAuthority{run<T>(lease:SessionLease,work:()=>Promise<T>):Promise<T>}
