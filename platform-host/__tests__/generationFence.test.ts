import {createGenerationFence,createSerialGenerationLock} from '../database/generationFence';
import type {Activation} from '../core/releaseSet';
const scope={company:'alpha',user:'alice',generation:'gen-1'};
const lease=(controller=new AbortController())=>({session:{company:'alpha',user:'alice',modules:['orders'],confirmation:'fixture'},online:true,signal:controller.signal,assertCurrent(){if(controller.signal.aborted)throw Error('Stale');}});
let current:Activation;
beforeEach(()=>{current={company:'alpha',user:'alice',dataGeneration:'gen-1',release:{artifacts:[{module:'orders',schema:1}]}} as Activation;});
test('migration/commit waits for active writes and rejects stale-generation access after activation',async()=>{
 const fence=createGenerationFence(createSerialGenerationLock(),async()=>current);let finish=()=>{};let entered=()=>{};const started=new Promise<void>(resolve=>{entered=resolve;});const events:string[]=[];
 const writing=fence.run(scope,'orders',1,lease().signal,async()=>{events.push('write');entered();await new Promise<void>(resolve=>{finish=resolve;});events.push('saved');});await started;
 const activating=fence.activation(lease(),async()=>{events.push('activation');current={...current,dataGeneration:'gen-2'};});
 const stale=fence.run(scope,'orders',1,lease().signal,async()=>{events.push('wrong generation');});
 finish();await writing;await activating;await expect(stale).rejects.toThrow('generation changed');expect(events).toEqual(['write','saved','activation']);
});
test('queued revoked operations reject immediately and cannot poison later locks',async()=>{
 const fence=createGenerationFence(createSerialGenerationLock(),async()=>current);let finish=()=>{};let entered=()=>{};const started=new Promise<void>(resolve=>{entered=resolve;});
 const holding=fence.activation(lease(),async()=>{entered();await new Promise<void>(resolve=>{finish=resolve;});});await started;
 const controller=new AbortController();const work=jest.fn(async()=>1);const waiting=fence.run(scope,'orders',1,controller.signal,work);controller.abort();await expect(waiting).rejects.toThrow('Stale');expect(work).not.toHaveBeenCalled();finish();await holding;
 await expect(fence.run(scope,'orders',1,lease().signal,async()=>42)).resolves.toBe(42);
});
test('latest activated permission/schema projection gates old module handles even with unchanged data generation',async()=>{
 const fence=createGenerationFence(createSerialGenerationLock(),async()=>current);current={...current,release:{...current.release,artifacts:[]}};
 await expect(fence.run(scope,'orders',1,lease().signal,async()=>1)).rejects.toThrow('rights/schema changed');
});
