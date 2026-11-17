import {NativeModules} from 'react-native';
type Bridge={randomUUID():string};
export function createNativeOperationId(bridge:Bridge=NativeModules.LeaderHostInfo){
 if(typeof bridge?.randomUUID!=='function')throw Error('Native secure operation IDs unavailable');
 return()=>{const id=bridge.randomUUID();if(typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))throw Error('Invalid native operation ID');return id;};
}
