import {Platform} from 'react-native';
import type {SessionAuthority} from '../core/sessionAuthority';
/** ONE RN process only; native workers/multiple processes need shared native authority fencing. */
export function createNativeSessionAuthority():SessionAuthority{
  if(Platform.OS!=='android')throw Error('Native single-process authority requires Android');
  return{async run(lease,work){lease.assertCurrent();const result=await work();lease.assertCurrent();return result;}};
}
