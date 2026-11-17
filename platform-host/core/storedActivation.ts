import type {Activation} from './releaseSet';
const id=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
/** Structural validation ONLY; signature/files/data must still pass bootstrap verification before use. */
export function parseStoredActivation(value:unknown,company:string,user:string):Activation{
  const activation=value as Activation;
  if(!activation||typeof activation!=='object'||Array.isArray(activation)||activation.company!==company||activation.user!==user||!id(company)||!id(user)||!id(activation.dataGeneration)||activation.release?.company!==company||!id(activation.release.id)||!Array.isArray(activation.release.artifacts)||!id(activation.signed?.keyId)||typeof activation.signed?.payload!=='string'||activation.signed.payload.length>256*1024||typeof activation.signed?.signature!=='string')throw Error('Corrupt stored activation');
  return activation;
}
