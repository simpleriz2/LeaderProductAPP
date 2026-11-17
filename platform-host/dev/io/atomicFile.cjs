const fs=require('node:fs');const path=require('node:path');const{randomUUID}=require('node:crypto');
function atomicallyWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.pending`;
  const fd = fs.openSync(temporary, 'w');
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  const dir = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}
module.exports={atomicallyWrite};
