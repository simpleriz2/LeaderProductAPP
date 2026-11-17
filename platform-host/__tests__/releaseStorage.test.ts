import {createNativeReleaseStorage,type ReleaseStorageBridge} from '../adapters/releaseStorage.native';
import type {Activation} from '../core/releaseSet';
const activation={company:'alpha',user:'alice',release:{company:'alpha',id:'set-1'},signed:{payload:'signed fixture'},dataGeneration:'data-1'} as Activation;
function bridge():ReleaseStorageBridge{return {current:jest.fn(async()=>JSON.stringify(activation)),lastGood:jest.fn(async()=>null),cachedFile:jest.fn(async()=>null),stage:jest.fn(async()=>{}),discard:jest.fn(async()=>{}),commit:jest.fn(async()=>{})};}
test('native storage reads only matching activation namespaces and never substitutes unavailable storage',async()=>{
  const native=bridge();const store=createNativeReleaseStorage(native);
  await expect(store.current('alpha','alice')).resolves.toEqual(activation);await expect(store.lastGood('alpha','alice')).resolves.toBeNull();
  await expect(store.current('beta','bob')).rejects.toThrow('namespace');
  native.current=async()=>'{broken';await expect(store.current('alpha','alice')).rejects.toThrow();
  expect(()=>createNativeReleaseStorage(null as unknown as ReleaseStorageBridge)).toThrow('unavailable');
});
test('native storage preserves CAS and bytes while surfacing atomic commit failures',async()=>{
  const native=bridge();const store=createNativeReleaseStorage(native);const file={name:'qr.bundle',digest:'a'.repeat(64),path:`artifacts/${'a'.repeat(64)}.bundle`,size:3};
  await store.stage('alpha/alice/set-1/attempt',file,new Uint8Array([0,255,128]));expect(native.stage).toHaveBeenCalledWith('alpha/alice/set-1/attempt',file.digest,'AP+A');
  native.cachedFile=async()=> 'AP+A';await expect(store.cachedFile('alpha','alice',file)).resolves.toEqual(new Uint8Array([0,255,128]));
  await store.commit(null,activation,'alpha/alice/set-1/attempt');expect(native.commit).toHaveBeenCalledWith(null,JSON.stringify(activation),'alpha/alice/set-1/attempt');
  native.commit=async()=>{throw Error('Disk full');};await expect(store.commit(activation,activation,'alpha/alice/set-1/attempt')).rejects.toThrow('Disk full');
});
