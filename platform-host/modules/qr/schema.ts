import type {SchemaOwner} from '../../database/migrations';
/** Static DB-layer bootstrap history; no domain runtime, network, React or feature initialization. */
export const qrSchemaOwner:SchemaOwner={module:'qr',base:1,initialize:async()=>{},migrations:[]};
