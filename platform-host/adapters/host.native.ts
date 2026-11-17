import { NativeModules } from 'react-native';
import metadata from '../host.runtime.json';
type NativeIdentity={runtime:string;nativeFingerprint:string;hostVersion:number;capabilitiesJson:string};
export function getHostIdentity(native:NativeIdentity=NativeModules.LeaderHostInfo){
  if(!native)throw Error('Native host identity unavailable');
  const expected=metadata.android;
  if(native.runtime!==expected.runtime||native.nativeFingerprint!==expected.nativeFingerprint||native.hostVersion!==expected.version)throw Error('Host bundle/native mismatch; matching fork APK required');
  const actual=JSON.parse(native.capabilitiesJson);
  const keys=Object.keys(expected.capabilities).sort();
  if(!actual||Object.keys(actual).sort().join('|')!==keys.join('|')||keys.some(key=>!Array.isArray(actual[key])||JSON.stringify([...actual[key]].sort())!==JSON.stringify([...(expected.capabilities as Record<string,number[]>)[key]].sort())))throw Error('Native host capabilities mismatch');
  const capabilities=Object.freeze(Object.fromEntries(Object.entries(expected.capabilities).map(([name,versions])=>[name,Object.freeze([...versions])])));
  return Object.freeze({platform:'android' as const,host:expected.version,runtime:expected.runtime,capabilities});
}
