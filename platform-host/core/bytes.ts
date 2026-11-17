/** Small bounded byte bridge; production large files must be hashed in the storage adapter. */
export function encodeBase64(bytes: Uint8Array): string {
  if(bytes.length>12*1024*1024)throw Error('Byte bridge limit exceeded');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return globalThis.btoa(binary);
}
export function decodeBase64(value: string): Uint8Array {
  if(value.length>16*1024*1024||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Invalid base64');
  const raw=globalThis.atob(value);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(encodeBase64(bytes)!==value)throw Error('Noncanonical base64');return bytes;
}
export function copyKeyring(keys:Readonly<Record<string,string>>):Readonly<Record<string,string>> {
  for(const [id,key]of Object.entries(keys))if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)||key.length>64||decodeBase64(key).length!==32)throw Error('Invalid pinned Ed25519 key');
  return Object.freeze({...keys});
}
