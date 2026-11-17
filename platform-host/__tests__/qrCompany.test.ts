import {createQrCompanyClient,QrCompanyError,type QrCompanyPort} from '../modules/qr/companyClient';
const id='f6596f43-bce6-4861-a8e2-b1b593b7f38b';
const document={id,qrType:'CONTACT',qrData:'BEGIN:VCARD\r\nFN:Saved\r\nEND:VCARD',description:null,status:'ACTIVE',revision:1};
test('domain client keeps null partial edit, DELETE and independent restore semantics on bound port',async()=>{
 const execute=jest.fn(async()=>({status:200,body:{document}}));const api=createQrCompanyClient({execute});
 await api.update(id,1,{description:null});expect(execute).toHaveBeenLastCalledWith('/qr/'+id,{method:'PUT',body:{description:null,expectedRevision:1}});
 await api.remove(id,1);expect(execute).toHaveBeenLastCalledWith('/qr/'+id,{method:'DELETE',body:{expectedRevision:1}});
 await api.restore(id,1);expect(execute).toHaveBeenLastCalledWith('/qr/'+id+'/restore',{method:'PUT',body:{expectedRevision:1}});
});
test('invalid commands/unsafe cursors fail before any credentials/HTTP port',async()=>{
 const execute=jest.fn();const api=createQrCompanyClient({execute});
 await expect(api.get('../other')).rejects.toThrow();await expect(api.list(5000)).rejects.toThrow();await expect(api.create('new-random-id',{qrType:'TEXT',qrData:'draft'})).rejects.toThrow();await expect(api.update(id,0,{description:null})).rejects.toThrow();await expect(api.update(id,1,{qrType:'WIFI'} as never)).rejects.toThrow();await expect(api.create(id,{qrType:'TEXT',qrData:{value:undefined}})).rejects.toThrow();expect(execute).not.toHaveBeenCalled();
});
test('malformed or cursor-looping responses never become domain records; denial/conflict/update-required remain typed',async()=>{
 let response:{status:number;body:unknown}={status:200,body:{document:{...document,revision:Infinity}}};const api=createQrCompanyClient({execute:async()=>response});await expect(api.get(id)).rejects.toThrow('revision');
 response={status:200,body:{items:[document,document],nextAfter:id}};await expect(api.list()).rejects.toThrow('cursor');
 response={status:200,body:{items:[],nextAfter:id}};await expect(api.list()).rejects.toThrow('cursor');
 for(const status of [401,403,409,503]){response={status,body:{error:'Test denial'}};await expect(api.get(id)).rejects.toEqual(new QrCompanyError(status,'Test denial'));}
});
