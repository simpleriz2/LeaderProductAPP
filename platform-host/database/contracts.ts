/** Internal database-driver protocol. Feature modules receive ModuleDatabase, never SQL/driver handles. */
export type DataScope={company:string;user:string;generation:string};
export type DataRow={id:string;revision:number;payload:string};
export type RawChange={collection:string;id:string;expectedRevision:number|null;payload:string|null};
export type WriteReceipt={collection:string;id:string;revision:number|null};
export type DataBatch={module:string;expectedSchema:number;targetSchema?:number;changes:RawChange[]};
export interface DataDriver{
  close(scope:DataScope):Promise<void>;
  /** Null source is first installation ONLY: retained account generations must trigger recovery, never empty reset. */
  fork(source:DataScope|null,target:DataScope):Promise<void>;
  schema(scope:DataScope,module:string):Promise<number>;
  read(scope:DataScope,module:string,schema:number,collection:string,id:string):Promise<DataRow|null>;
  list(scope:DataScope,module:string,schema:number,collection:string,limit:number,after?:string):Promise<DataRow[]>;
  write(scope:DataScope,batch:DataBatch):Promise<WriteReceipt[]>;
  verify(scope:DataScope,schemas:Readonly<Record<string,number>>):Promise<void>;
}
export const identifier=(value:string):string=>{if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))throw Error('Invalid data namespace');return value;};
export function utf8Size(value:string):number{
  let size=0;for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code<128)size++;else if(code<2048)size+=2;else if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error('Invalid Unicode');size+=4;}else{if(code>=0xdc00&&code<=0xdfff)throw Error('Invalid Unicode');size+=3;}}return size;
}
export const recordId=(value:string):string=>{if(typeof value!=='string'||!value.length||value.length>512||/[\u0000-\u001f]/.test(value)||utf8Size(value)>512)throw Error('Invalid record id');return value;};
export function jsonPayload(value:string):number{if(typeof value!=='string'||value.length>2*1024*1024)throw Error('Invalid record payload');const size=utf8Size(value);if(size>2*1024*1024)throw Error('Record payload too large');JSON.parse(value);return size;}
export function validateScope(scope:DataScope):void{for(const value of [scope.company,scope.user,scope.generation])identifier(value);}
export function validateBatch(batch:DataBatch):void{
  identifier(batch.module);
  if(!Number.isSafeInteger(batch.expectedSchema)||batch.expectedSchema<0||!Array.isArray(batch.changes)||batch.changes.length>512)throw Error('Invalid data batch');
  if(batch.targetSchema!==undefined&&(!Number.isSafeInteger(batch.targetSchema)||batch.targetSchema!==batch.expectedSchema+1))throw Error('Migrations must be ordered single steps');
  if(batch.targetSchema===undefined&&batch.expectedSchema<1)throw Error('Uninitialized module schema');
  const seen=new Set<string>();let length=0;
  for(const change of batch.changes){identifier(change.collection);recordId(change.id);const key=JSON.stringify([change.collection,change.id]);if(seen.has(key))throw Error('Duplicate record mutation');seen.add(key);
    if(change.expectedRevision!==null&&(!Number.isSafeInteger(change.expectedRevision)||change.expectedRevision<1))throw Error('Invalid expected revision');
    if(change.payload===null){if(change.expectedRevision===null)throw Error('Delete requires revision');}
    else length+=jsonPayload(change.payload);
  }
  if(length>8*1024*1024)throw Error('Data batch too large');
}
