import {createNativeScriptResolver} from '../core/nativeScriptResolver';
import type {Activation} from '../core/releaseSet';
const file=(name:string)=>({name,digest:'a'.repeat(64),path:`artifacts/${'a'.repeat(64)}.bundle`,size:123});
const activation:Activation={company:'alpha',user:'alice',dataGeneration:'data-1',signed:{keyId:'test',payload:'fixture',signature:'fixture'},release:{format:2,platform:'android',company:'alpha',id:'one',minHost:1,runtime:'fixture',api:'1.0.0',artifacts:[{...file('qr.container.bundle'),module:'qr',version:'1.0.0',contract:'1.0.0',schema:0,requires:{minHost:1,capabilities:{},contracts:{}},assets:[file('__federation_expose_Screen.chunk.bundle'),file('mf-manifest.json')]}]}};
function fixture(){const files={verifiedFile:jest.fn(async()=>`file:///data/user/0/com.leaderproduct.app.fork/files/lp2-release-store/execution/alpha/alice/${'a'.repeat(64)}.bundle`)};const checkpoint=jest.fn(async()=>{});return{files,checkpoint,resolver:createNativeScriptResolver(activation,files,checkpoint)};}
test('native resolver maps exact signed container/chunk IDs to private verified files without network metadata',async()=>{
 const f=fixture();const entry=await f.resolver.resolve('qr');expect(entry).toEqual({url:expect.stringMatching(/^file:\/\//),absolute:true,cache:false,retry:0,verifyScriptSignature:'off'});
 await f.resolver.resolve('__federation_expose_Screen','qr');expect(f.files.verifiedFile).toHaveBeenCalledTimes(2);expect(f.files.verifiedFile).toHaveBeenCalledWith('alpha','alice','a'.repeat(64),123);expect(f.checkpoint).toHaveBeenCalledTimes(4);
});
test('unknown scripts/callers/traversal/metadata never fall through to another resolver',async()=>{
 const f=fixture();for(const [id,caller]of [['help',undefined],['qr','other'],['../__federation_expose_Screen','qr'],['mf-manifest.json','qr'],['https://cdn/qr','qr']])await expect(f.resolver.resolve(id!,caller)).rejects.toThrow();expect(f.files.verifiedFile).not.toHaveBeenCalled();
});
test('stale lease, unexpected native URLs and disposal reject before returning a locator',async()=>{
 const f=fixture();f.checkpoint.mockRejectedValueOnce(Error('Revoked'));await expect(f.resolver.resolve('qr')).rejects.toThrow('Revoked');expect(f.files.verifiedFile).not.toHaveBeenCalled();
 for(const url of ['https://cdn/qr.bundle','file:///tmp/untrusted.bundle',`file:///data/../lp2-release-store/execution/alpha/alice/${'a'.repeat(64)}.bundle`]){f.files.verifiedFile.mockResolvedValueOnce(url);await expect(f.resolver.resolve('qr')).rejects.toThrow('execution URL');}
 f.files.verifiedFile.mockImplementationOnce(async()=>{f.resolver.dispose();return`file:///data/lp2-release-store/execution/alpha/alice/${'a'.repeat(64)}.bundle`;});await expect(f.resolver.resolve('qr')).rejects.toThrow('disposed');await expect(f.resolver.resolve('qr')).rejects.toThrow('disposed');
});
