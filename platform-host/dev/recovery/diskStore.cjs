/** Local durability adapter; Node SQLite/filesystem, never imported into Android/Web. */
const fs = require('node:fs');
const {parseStoredActivation}=require('../../core/storedActivation.ts');
const { atomicallyWrite } = require('../io/atomicFile.cjs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { artifactFiles } = require('../../core/releaseSet.ts');
const { DatabaseSync } = require('node:sqlite');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function safePart(value) { if(typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) throw Error('Invalid namespace'); return value; }
function openDiskStore(root, failpoint = () => {}) {
  fs.mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(path.join(root, 'bootstrap.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS activation (company TEXT NOT NULL, user TEXT NOT NULL, current TEXT, lkg TEXT, PRIMARY KEY(company,user));');
  const blobFile = (company, user, hash) => path.join(root, 'blobs', safePart(company), safePart(user), safePart(hash));
  const stageDir = ns => { ns.split('/').forEach(safePart); return path.join(root, 'staging', digest(ns)); };
  const read = (company,user,field='current') => {
    safePart(company);safePart(user);const record=db.prepare(`SELECT ${field} FROM activation WHERE company=? AND user=?`).get(company,user);
    if(!record)return null;const value=record[field];if(value===null&&field==='lkg')return null;
    if(typeof value!=='string')throw Error('Corrupt stored activation');
    return parseStoredActivation(JSON.parse(value),company,user);
  };
  return {
    current: async (company,user) => read(company,user),
    cachedFile: async (company,user,file) => {
      try { return fs.readFileSync(blobFile(company,user,file.digest)); }
      catch(error) { if(error.code==='ENOENT')return null;throw error; }
    },
    lastGood: async (company,user) => read(company,user,'lkg'),
    confirmHealthy: async expected => {
      db.exec('BEGIN IMMEDIATE');
      try {
        if(JSON.stringify(read(expected.company,expected.user))!==JSON.stringify(expected))throw Error('Concurrent health confirmation');
        db.prepare('UPDATE activation SET lkg=? WHERE company=? AND user=?').run(JSON.stringify(expected),expected.company,expected.user);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    stage: async (ns, artifact, bytes) => {
      if(digest(bytes) !== artifact.digest) throw Error('Stage digest mismatch');
      atomicallyWrite(path.join(stageDir(ns), safePart(artifact.digest)), bytes);
    },
    discard: async ns => { fs.rmSync(stageDir(ns), { recursive: true, force: true }); },
    commit: async (expected, next, ns) => {
      const staging = stageDir(ns);
      // Promote immutable content before committing pointers. Orphans after crash are safe; GC is deferred.
      for(const artifact of artifactFiles(next.release)) {
        const bytes = fs.readFileSync(path.join(staging, safePart(artifact.digest)));
        if(digest(bytes) !== artifact.digest) throw Error('Staged cache tampered');
        atomicallyWrite(blobFile(next.company, next.user, artifact.digest), bytes);
      }
      failpoint('beforeCommit');
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = read(next.company,next.user);
        if(JSON.stringify(existing) !== JSON.stringify(expected)) throw Error('Concurrent activation');
        db.prepare('INSERT INTO activation(company,user,current,lkg) VALUES(?,?,?,?) ON CONFLICT(company,user) DO UPDATE SET current=excluded.current').run(next.company,next.user,JSON.stringify(next),null);
        db.exec('COMMIT');
      } catch(error) { db.exec('ROLLBACK'); throw error; }
      failpoint('afterCommit');
      try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* Committed state is valid; defer staging GC. */ }
    },
    readVerifiedBytes: activation => artifactFiles(activation.release).map(a => { const bytes = fs.readFileSync(blobFile(activation.company, activation.user, a.digest)); if(digest(bytes) !== a.digest) throw Error('Cached artifact tampered'); return bytes; }),
    blobFile,
    close: () => db.close(),
  };
}
module.exports = { openDiskStore, atomicallyWrite, digest };
