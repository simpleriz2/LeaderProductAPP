import metadata from '../host.runtime.json';import{getHostIdentity}from '../adapters/host.native';
const{identities,enforceEvolution}=require('../scripts/hostRuntime.cjs');
const native={runtime:metadata.android.runtime,nativeFingerprint:metadata.android.nativeFingerprint,hostVersion:metadata.android.version,capabilitiesJson:JSON.stringify(metadata.android.capabilities)};
test('uses actual native identity and rejects a bundle built for another fork kernel',()=>{
  expect(getHostIdentity(native).runtime).toBe(metadata.android.runtime);
  expect(getHostIdentity({...native,capabilitiesJson:JSON.stringify(Object.fromEntries(Object.entries(metadata.android.capabilities).reverse()))}).runtime).toBe(metadata.android.runtime);
  expect(()=>getHostIdentity({...native,nativeFingerprint:'stale'})).toThrow('mismatch');expect(()=>getHostIdentity({...native,hostVersion:999})).toThrow('mismatch');
  expect(()=>getHostIdentity({...native,capabilitiesJson:'{}'})).toThrow('capabilities');
});
test('native implementation changes require APK version increment while compatible ABI family stays usable',()=>{
  const spec={androidVersionCode:1,webHostVersion:1,sharedAbi:1,versionName:'0.1.0',capabilities:{http:[1]}};
  const libraries={native:{react:'19.3.0','react-native':'0.88.1'},web:{react:'19.3.0','react-dom':'19.3.0','react-native-web':'0.21.4'}};
  const a=identities(spec,libraries,[['Native.kt','hash-a']]);const invalid=identities(spec,libraries,[['Native.kt','hash-b']]);
  expect(()=>enforceEvolution(a,invalid)).toThrow('bump androidVersionCode');
  const b=identities({...spec,androidVersionCode:2},libraries,[['Native.kt','hash-b']]);enforceEvolution(a,b);expect(b.android.runtime).toBe(a.android.runtime);expect(b.android.nativeFingerprint).not.toBe(a.android.nativeFingerprint);
  const rn=identities({...spec,androidVersionCode:2},{...libraries,native:{...libraries.native,'react-native':'0.89.0'}},[['Native.kt','hash-a']]);expect(rn.android.runtime).not.toBe(a.android.runtime);
});
