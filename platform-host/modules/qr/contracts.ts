export const qrTypes=['PHONE','LINK','EMAIL','TEXT','WHATSAPP','TELEGRAM','CONTACT'] as const;
export type QrType=typeof qrTypes[number];
export type QrStatus='ACTIVE'|'PAUSED'|'DELETED';
export type QrDocument={id:string;qrType:QrType;qrData:string;description:string|null;status:QrStatus;revision:number};
export type QrWrite={qrType:QrType;qrData:string|Record<string,unknown>;description?:string|null};
/** Host supplies only ServiceRouter.forCompanyRelease(ACTIVE verified activation), never global HTTP/token. */
export type QrCompanyPort={execute(path:string,operation:{method:'GET'|'POST'|'PUT'|'DELETE';body?:unknown}):Promise<{status:number;body:unknown}>};
