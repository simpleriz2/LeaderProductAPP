import {createCentralClient,CentralDenied,type CentralExchange} from '../core/centralClient';
import {createNativeCentralExchange} from '../adapters/central.native';
test('fixed Central paths keep universal credentials out of login and reject endpoint/path injection',async()=>{
 const exchange=jest.fn(async()=>({status:200,body:'{}'}));const central=createCentralClient('http://127.0.0.1:3001',exchange,()=> 'universal-only-central'),signal=new AbortController().signal;
 await central('/login',{user:'fixture'},signal);expect(exchange).toHaveBeenLastCalledWith(expect.objectContaining({url:'http://127.0.0.1:3001/login',token:null}));await central('/discovery',undefined,signal);expect(exchange).toHaveBeenLastCalledWith(expect.objectContaining({url:'http://127.0.0.1:3001/discovery',token:'universal-only-central'}));
 const count=exchange.mock.calls.length;await expect(central('//attacker.invalid' as never,undefined,signal)).rejects.toThrow('path');expect(exchange).toHaveBeenCalledTimes(count);expect(()=>createCentralClient('http://company.invalid',exchange,()=>null)).toThrow('origin');
});
test('central denial is recognized before parsing a bad body; login denial does not invent a saved session',async()=>{
 const exchange:CentralExchange=async()=>({status:401,body:'not JSON'}),central=createCentralClient('http://127.0.0.1:3001',exchange,()=> 'expired');const signal=new AbortController().signal;
 await expect(central('/discovery',undefined,signal)).rejects.toBeInstanceOf(CentralDenied);await expect(central('/login',{},signal)).rejects.not.toBeInstanceOf(CentralDenied);
});
test('native adapter uses public bridge only without bearer and rejects oversized/redirect responses',async()=>{
 const bridge={request:jest.fn(async()=>({status:200,body:'{}'})),requestPublic:jest.fn(async()=>({status:200,body:'{}'})),cancel:jest.fn()},central=createCentralClient('http://127.0.0.1:3001',createNativeCentralExchange(bridge),()=> 'scoped-central');const signal=new AbortController().signal;
 await central('/login',{},signal);expect(bridge.requestPublic).toHaveBeenCalledTimes(1);expect(bridge.request).not.toHaveBeenCalled();await central('/tokens',{audience:'company:alpha'},signal);expect(bridge.request).toHaveBeenCalledWith(expect.any(String),'http://127.0.0.1:3001/tokens','POST','scoped-central','{"audience":"company:alpha"}');
 bridge.request.mockResolvedValue({status:302,body:''});await expect(central('/discovery',undefined,signal)).rejects.toThrow('redirect');bridge.request.mockResolvedValue({status:200,body:'x'.repeat(256*1024+1)});await expect(central('/discovery',undefined,signal)).rejects.toThrow('large');
});
