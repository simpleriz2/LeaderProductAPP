import {createNativeOperationId} from '../adapters/operationId.native';
test('native secure entropy is mandatory and malformed IDs never become operation identities',()=>{
 expect(()=>createNativeOperationId(null as never)).toThrow('unavailable');
 expect(()=>createNativeOperationId({randomUUID:()=> 'Math.random-placeholder'})()).toThrow('Invalid');
 const id='44c7758f-8762-4e35-969e-1c41a7de04fb';expect(createNativeOperationId({randomUUID:()=>id})()).toBe(id);
});
