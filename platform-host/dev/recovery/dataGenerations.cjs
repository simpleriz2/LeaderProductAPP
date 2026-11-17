const { DatabaseSync, backup } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function dataFile(root, company, user, generation) {
  for(const v of [company,user,generation]) if(typeof v !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v)) throw Error('Invalid namespace');
  return path.join(root,'data',company,user,`${generation}.sqlite`);
}
async function prepareForUser(root, user, release, previous, failMigration = false) {
  const generation = `data-${randomUUID()}`;
  const file = dataFile(root,release.company,user,generation); fs.mkdirSync(path.dirname(file),{recursive:true});
  if(previous) {
    if(previous.company !== release.company || previous.user !== user) throw Error('Cross-namespace migration');
    const source = new DatabaseSync(dataFile(root,previous.company,previous.user,previous.dataGeneration));
    try { await backup(source,file); } finally { source.close(); }
  }
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS schema_versions(module TEXT PRIMARY KEY, version INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS drafts(module TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(module,id)); CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL,receipt TEXT); CREATE TABLE IF NOT EXISTS help_cursor(id TEXT PRIMARY KEY,cursor TEXT);');
    // Harness migrations own only fixture tables. Existing business migrations are never replaced.
    for(const artifact of release.artifacts) {
      const old = db.prepare('SELECT version FROM schema_versions WHERE module=?').get(artifact.module)?.version || 0;
      if(artifact.schema < old) throw Error('Destructive DB downgrade denied');
      if(artifact.schema > 2 || artifact.schema < 1) throw Error('Unknown migration');
      db.prepare('INSERT INTO schema_versions(module,version) VALUES(?,?) ON CONFLICT(module) DO UPDATE SET version=excluded.version').run(artifact.module,artifact.schema);
    }
    if(release.artifacts.some(a=>a.schema === 2) && !db.prepare('PRAGMA table_info(drafts)').all().some(c=>c.name === 'revision')) db.exec('ALTER TABLE drafts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
    if(failMigration) throw Error('Injected migration failure');
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }
  return generation;
}
module.exports = { prepareForUser, dataFile };
