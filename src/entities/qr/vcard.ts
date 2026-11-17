export type QrContactEditFields={firstname:string;lastname:string;phone:string;email:string;website:string;org:string;contactAddress:string;note:string};
const unescape=(value:string)=>value.replace(/\\([nN,;\\])/g,(_,character:string)=>character==='n'||character==='N'?'\n':character);
function split(value:string):string[]{
  const fields=[''];let escaped=false;
  for(const character of value){if(character===';'&&!escaped)fields.push('');else fields[fields.length-1]+=character;if(escaped)escaped=false;else if(character==='\\')escaped=true;}
  return fields.map(unescape);
}
/** Pure QR-owned parser shared by native/Web form; handles structured and legacy flat addresses. */
export function parseQrContactVCard(input:string):Partial<QrContactEditFields>{
  const values=new Map<string,string>();
  for(const line of input.replace(/\r?\n[ \t]/g,'').split(/\r?\n/)){
    let quoted=false,escaped=false,colon=-1;for(let index=0;index<line.length;index++){const character=line[index];if(character==='"'&&!escaped)quoted=!quoted;if(character===':'&&!quoted&&!escaped){colon=index;break;}if(escaped)escaped=false;else if(character==='\\')escaped=true;}
    if(colon<0)continue;const name=line.slice(0,colon).split(';')[0].split('.').pop()!.toUpperCase();if(!values.has(name))values.set(name,line.slice(colon+1));
  }
  const output:Partial<QrContactEditFields>={};const name=values.get('N');
  if(name!==undefined){const parts=split(name);output.lastname=parts[0]||'';output.firstname=parts[1]||'';}
  if(!output.firstname&&!output.lastname&&values.has('FN'))output.firstname=unescape(values.get('FN')!);
  for(const[property,field]of [['TEL','phone'],['EMAIL','email'],['URL','website'],['ORG','org'],['NOTE','note']] as const){const value=values.get(property);if(value!==undefined)output[field]=unescape(value);}
  const address=values.get('ADR');if(address!==undefined){const parts=split(address);output.contactAddress=parts.length===1?parts[0]:parts.filter(Boolean).join(', ');}
  return output;
}
