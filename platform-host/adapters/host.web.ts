import metadata from '../host.runtime.json';
export function getHostIdentity(){return {platform:'web' as const,host:metadata.web.version,runtime:metadata.web.runtime,capabilities:{http:[1],releaseCrypto:[1],hostInfo:[1]}};}
