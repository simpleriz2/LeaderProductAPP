import {ScriptManager,getWebpackContext} from '@callstack/repack/client';
import type {ModuleFederationRuntimePlugin} from '@module-federation/enhanced/runtime';
/** Rejects entry errors instead of allowing the federation runtime's default network loader. */
export default function verifiedNativeEntry():ModuleFederationRuntimePlugin{
  return{name:'lp2-verified-native-entry',async loadEntry({remoteInfo}){
    const {entryGlobalName:name,entry}=remoteInfo;
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||entry!==`lp2-verified://${name}/${name}.container.bundle`)throw Error('Unregistered native entry profile');
    await ScriptManager.shared.loadScript(name,undefined,getWebpackContext(),entry);
    const container=(globalThis as unknown as Record<string,Exclude<Awaited<ReturnType<NonNullable<ModuleFederationRuntimePlugin['loadEntry']>>>,void>>)[name];
    if(!container||typeof container.get!=='function'||typeof container.init!=='function')throw Error('Native container did not initialize');
    return container;
  }};
}
