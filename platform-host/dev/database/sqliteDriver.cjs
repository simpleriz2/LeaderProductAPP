/** Real local SQLite reference driver. It never opens an existing business database. */
const fs=require('node:fs');const path=require('node:path');const{DatabaseSync,backup}=require('node:sqlite');
const{identifier,validateScope,validateBatch,utf8Size}=require('../../database/contracts.ts');
function sqliteDriver(root){
 const file=scope=>{validateScope(scope);return path.join(root,'data-sdk',scope.company,scope.user,scope.generation+'.sqlite');};
 const schema=(db,module)=>db.prepare('SELECT version FROM module_schema WHERE module=?').get(identifier(module))?.version||0;
 const using=(scope,write,work)=>{const db=new DatabaseSync(file(scope),{readOnly:!write});try{if(write)db.exec('PRAGMA synchronous=FULL');db.exec(write?'BEGIN IMMEDIATE':'BEGIN');try{const result=work(db);db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}finally{db.close();}};
 const requireSchema=(db,module,version)=>{if(schema(db,module)!==version)throw Error('Module schema mismatch');};
 const driver={
  file,close:async scope=>{validateScope(scope);},
  fork:async(source,target)=>{
   if(source!==null)validateScope(source);
   if(source&&(source.company!==target.company||source.user!==target.user))throw Error('Cross-tenant data copy');const destination=file(target);fs.mkdirSync(path.dirname(destination),{recursive:true});if(!source&&!fs.existsSync(destination)&&fs.readdirSync(path.dirname(destination)).length)throw Error('Retained subject data requires recovery');try{fs.closeSync(fs.openSync(destination,'wx'));}catch(error){if(error.code==='EEXIST')throw Error('Generation already exists');throw error;}
   if(source){if(source.company!==target.company||source.user!==target.user)throw Error('Cross-tenant data copy');const db=new DatabaseSync(file(source),{readOnly:true});try{if(db.prepare('PRAGMA user_version').get().user_version!==1)throw Error('Unknown physical database version');await backup(db,destination);}finally{db.close();}}
   const db=new DatabaseSync(destination);try{db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS module_schema(module TEXT PRIMARY KEY,version INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS records(module TEXT NOT NULL,collection TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL,PRIMARY KEY(module,collection,id)); PRAGMA user_version=1;');}finally{db.close();}
  },
  schema:async(scope,module)=>using(scope,false,db=>schema(db,module)),
  read:async(scope,module,version,collection,id)=>using(scope,false,db=>{requireSchema(db,module,version);return db.prepare('SELECT id,revision,payload FROM records WHERE module=? AND collection=? AND id=?').get(module,collection,id)||null;}),
  list:async(scope,module,version,collection,limit,after)=>using(scope,false,db=>{requireSchema(db,module,version);if(!Number.isSafeInteger(limit)||limit<1||limit>256)throw Error('Invalid page size');const statement=after===undefined?db.prepare('SELECT id,revision,payload FROM records WHERE module=? AND collection=? ORDER BY id COLLATE BINARY LIMIT ?'):db.prepare('SELECT id,revision,payload FROM records WHERE module=? AND collection=? AND id>? ORDER BY id COLLATE BINARY LIMIT ?');const args=after===undefined?[module,collection,limit]:[module,collection,after,limit];const rows=[];let bytes=0;for(const row of statement.iterate(...args)){bytes+=utf8Size(row.payload);if(bytes>4*1024*1024)throw Error('Data page too large');rows.push(row);}return rows;}),
  write:async(scope,batch)=>{validateBatch(batch);return using(scope,true,db=>{
   requireSchema(db,batch.module,batch.expectedSchema);const receipts=[];
   for(const change of batch.changes){const previous=db.prepare('SELECT revision FROM records WHERE module=? AND collection=? AND id=?').get(batch.module,change.collection,change.id);if((previous?.revision||null)!==change.expectedRevision)throw Error('Record revision conflict');
    if(change.payload===null){db.prepare('DELETE FROM records WHERE module=? AND collection=? AND id=?').run(batch.module,change.collection,change.id);receipts.push({collection:change.collection,id:change.id,revision:null});}
    else{const revision=(previous?.revision||0)+1;if(!Number.isSafeInteger(revision))throw Error('Revision overflow');db.prepare('INSERT INTO records(module,collection,id,revision,payload) VALUES(?,?,?,?,?) ON CONFLICT(module,collection,id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload').run(batch.module,change.collection,change.id,revision,change.payload);receipts.push({collection:change.collection,id:change.id,revision});}
   }
   if(batch.targetSchema!==undefined)db.prepare('INSERT INTO module_schema(module,version) VALUES(?,?) ON CONFLICT(module) DO UPDATE SET version=excluded.version').run(batch.module,batch.targetSchema);
   return receipts;
  });},
  verify:async(scope,schemas)=>using(scope,false,db=>{if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA user_version').get().user_version!==1)throw Error('Invalid physical database');for(const[module,version]of Object.entries(schemas))requireSchema(db,module,version);}),
 };
 return driver;
}
module.exports={sqliteDriver};
