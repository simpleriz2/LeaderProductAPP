const fs = require('node:fs');
function readLocalWebProfile(file) {
  if (!file) return null;
  if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 16384)
    throw Error('Invalid local profile file');
  const profile = JSON.parse(fs.readFileSync(file, 'utf8')),
    origin = value => {
      const url = new URL(value);
      if (
        url.origin !== value ||
        url.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      )
        throw Error('Local host profile requires loopback origins');
      return value;
    };
  if (
    !profile ||
    profile.mode !== 'local-pilot' ||
    Object.keys(profile).some(
      key => !['mode', 'central', 'allowedOrigins', 'roots'].includes(key),
    )
  )
    throw Error('Invalid local profile fields');
  origin(profile.central);
  if (
    !Array.isArray(profile.allowedOrigins) ||
    !profile.allowedOrigins.length ||
    profile.allowedOrigins.length > 16 ||
    new Set(profile.allowedOrigins).size !== profile.allowedOrigins.length ||
    !profile.allowedOrigins.includes(profile.central)
  )
    throw Error('Invalid local profile allowlist');
  profile.allowedOrigins.forEach(origin);
  if (
    !profile.roots ||
    Array.isArray(profile.roots) ||
    typeof profile.roots !== 'object' ||
    !Object.keys(profile.roots).length ||
    Object.keys(profile.roots).length > 8
  )
    throw Error('Explicit public trust roots required');
  for (const [key, value] of Object.entries(profile.roots))
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key) ||
      typeof value !== 'string' ||
      !/^[A-Za-z0-9+/]{43}=$/.test(value) ||
      Buffer.from(value, 'base64').length !== 32
    )
      throw Error('Profile accepts only raw Ed25519 public roots');
  return profile;
}
module.exports = { readLocalWebProfile };
