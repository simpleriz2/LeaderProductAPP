const mockApiClient=jest.fn();
jest.mock('../utils/apiClient',()=>({apiClient:(...args:unknown[])=>mockApiClient(...args)}));
import {updateQRCode,deleteQRCode} from '../utils/qrService';
beforeEach(()=>{mockApiClient.mockReset();mockApiClient.mockResolvedValue({ok:true,data:{id:'fixture-qr',qrType:'TEXT',qrData:'fixture',description:null,status:'ACTIVE',createdAt:'2026-01-01'}});});
test('partial QR edits use the actual dev PUT route',async()=>{
 const patch={description:'changed'};await updateQRCode('fixture-qr',patch);expect(mockApiClient).toHaveBeenCalledWith('/qr/fixture-qr',{method:'PUT',body:patch});
});
test('soft deletion reaches the same protected PUT route and propagates server denial',async()=>{
 await deleteQRCode('fixture-qr');expect(mockApiClient).toHaveBeenCalledWith('/qr/fixture-qr',{method:'PUT',body:{status:'DELETED'}});
 mockApiClient.mockResolvedValueOnce({ok:false,message:'Нет прав'});await expect(updateQRCode('fixture-qr',{description:'denied'})).rejects.toThrow('Нет прав');
});
