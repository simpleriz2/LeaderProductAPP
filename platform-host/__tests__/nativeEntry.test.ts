jest.mock('@callstack/repack/client',()=>({ScriptManager:{shared:{loadScript:jest.fn()}},getWebpackContext:()=>({fixture:true})}));
import {ScriptManager} from '@callstack/repack/client';
import verifiedNativeEntry from '../runtime/verifiedNativeEntry';
const mockLoad=ScriptManager.shared.loadScript as jest.Mock;
const hook=verifiedNativeEntry().loadEntry!;
const input=(entry='lp2-verified://qr/qr.container.bundle')=>({remoteInfo:{entryGlobalName:'qr',entry}} as Parameters<typeof hook>[0]);
afterEach(()=>{mockLoad.mockReset();delete (globalThis as unknown as Record<string,unknown>).qr;});
test('native entry hook propagates resolver/evaluation failures instead of falling through to default loader',async()=>{
 mockLoad.mockRejectedValueOnce(Error('Digest mismatch'));
 await expect(hook(input())).rejects.toThrow('Digest mismatch');expect(mockLoad).toHaveBeenCalledWith('qr',undefined,{fixture:true},'lp2-verified://qr/qr.container.bundle');
 await expect(hook(input('https://untrusted/qr'))).rejects.toThrow('Unregistered');expect(mockLoad).toHaveBeenCalledTimes(1);
});
test('native entry requires actual get/init exports after successful private-file evaluation',async()=>{
 mockLoad.mockResolvedValue(undefined);await expect(hook(input())).rejects.toThrow('did not initialize');
 const container={get:()=>{},init:()=>{}};(globalThis as unknown as Record<string,unknown>).qr=container;
 await expect(hook(input())).resolves.toBe(container);
});
