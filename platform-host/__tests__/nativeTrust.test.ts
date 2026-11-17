import {createNativeTrust}from '../adapters/trust.native';
import{encodeBase64,decodeBase64}from '../core/bytes';
const key=encodeBase64(new Uint8Array(32));
test('unknown/rotated keys never reach verifier and caller cannot mutate pinned root after creation',async()=>{
  const bridge={verify:jest.fn(async()=>true),sha256:jest.fn(async()=> 'digest')};const roots={key};const trust=createNativeTrust(roots,bridge);roots.key=encodeBase64(new Uint8Array(32).fill(1));
  expect(await trust.verifyEd25519('unknown','payload','signature')).toBe(false);expect(bridge.verify).not.toHaveBeenCalled();
  await trust.verifyEd25519('key','payload','signature');expect(bridge.verify).toHaveBeenCalledWith(key,'payload','signature');
});
test.each(['','a','ab','abc','hello'])('base64 roundtrip for %j',text=>{const bytes=Uint8Array.from(text,c=>c.charCodeAt(0));expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);});
test('invalid key and noncanonical encoding are rejected',()=>{expect(()=>createNativeTrust({key:'invalid'},{verify:async()=>true,sha256:async()=>''})).toThrow();expect(()=>decodeBase64('AB==')).toThrow('Noncanonical');});
