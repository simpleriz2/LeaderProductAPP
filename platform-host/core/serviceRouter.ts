import {utf8Size} from './utf8.ts';
import type {SessionAuthority} from './sessionAuthority';
import type { SessionLease } from './sessionCoordinator';
export type CompanyReleaseBinding = Readonly<{company:string; id:string; api:string}>;
export type ServiceMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type ServiceKind = 'company' | 'artifacts' | 'help';
export type ServiceAssignment = { kind: ServiceKind; company: string; audience: string; endpoint: string };
export type ServiceToken = { value: string; company: string; user: string; audience: string; expiresAt: number; releaseId?:string; api?:string };
export type ServiceAvailability = 'unknown' | 'reachable' | 'unavailable' | 'denied';
export interface ServiceRoutingPorts {
  /** Only authenticated Central discovery may implement this port. No user-entered URL setter. */
  assignment(kind: ServiceKind, company: string): Promise<ServiceAssignment>;
  restrictedToken(kind: ServiceKind, company: string, audience: string, release?:CompanyReleaseBinding, signal?:AbortSignal): Promise<ServiceToken>;
  /** Native/Web adapters MUST reject redirects before forwarding Authorization. */
  send(request: { url: string; method: ServiceMethod; body?: string; token: string; signal: AbortSignal; redirect: 'error' }): Promise<{ status: number; body: unknown }>;
}
export class ServiceRouter {
  private availability = new Map<ServiceKind, ServiceAvailability>();
  private allowed: Set<string>;
  private readonly lease: SessionLease;
  private readonly ports: ServiceRoutingPorts;
  private readonly authority:SessionAuthority;
  constructor(lease: SessionLease, ports: ServiceRoutingPorts, allowedOrigins: readonly string[],authority:SessionAuthority) {
    if(!authority?.run)throw Error('Service session authority required');this.authority=authority;
    this.lease = lease; this.ports = ports;
    this.allowed = new Set(allowedOrigins.map(origin => {
      const url = new URL(origin);
      if(url.origin !== origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw Error('Invalid service allowlist');
      if(url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('Cleartext service must be loopback');
      return origin;
    }));
  }
  status(kind: ServiceKind): ServiceAvailability { return this.availability.get(kind) || 'unknown'; }
  async request(kind: ServiceKind, relativePath: string, body?: unknown): Promise<{ status: number; body: unknown }> {
    return this.execute(kind,relativePath,{method:body===undefined?'GET':'POST',body});
  }
  /** The host supplies its verified ACTIVE activation, never the latest discovery candidate. */
  forCompanyRelease(release:CompanyReleaseBinding, signal?:AbortSignal) {
    if(!release || release.company!==this.lease.session.company || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(release.id) || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(release.api))throw Error('Invalid active company release');
    const pinned=Object.freeze({...release});
    return Object.freeze({execute:(path:string,operation:{method:ServiceMethod;body?:unknown})=>this.perform('company',path,operation,pinned,signal)});
  }
  async execute(kind: ServiceKind, relativePath: string, operation: {method: ServiceMethod; body?: unknown}): Promise<{status:number;body:unknown}> {
    return this.perform(kind,relativePath,operation);
  }
  private async perform(kind:ServiceKind,relativePath:string,operation:{method:ServiceMethod;body?:unknown},release?:CompanyReleaseBinding,scopeSignal?:AbortSignal):Promise<{status:number;body:unknown}> {
    this.lease.assertCurrent();
    if(!operation || !['GET','POST','PUT','DELETE','PATCH'].includes(operation.method)) throw Error('Unsupported service method');
    if(operation.method==='GET' && operation.body!==undefined) throw Error('GET body forbidden');
    const serialized=operation.body===undefined?undefined:JSON.stringify(operation.body);
    if(operation.body!==undefined && serialized===undefined) throw Error('Invalid JSON body');
    if(serialized!==undefined && utf8Size(serialized)>2*1024*1024) throw Error('Request too large');
    if(!this.lease.online) throw Error('Service requires online confirmation');
    const decoded = decodeURIComponent(relativePath);
    if(!relativePath.startsWith('/') || decoded.startsWith('//') || /[\\#\u0000-\u001f]/.test(decoded) || decoded.split(/[/?]/).some(p=>p==='.'||p==='..')) throw Error('Invalid service path');
    const controller=new AbortController();const abort=()=>controller.abort();
    for(const source of [this.lease.signal,scopeSignal]){if(source?.aborted)controller.abort();else source?.addEventListener('abort',abort,{once:true});}
    const checkpoint=()=>{this.lease.assertCurrent();if(controller.signal.aborted)throw Error('Service operation aborted');};
    try{checkpoint();return await this.authority.run(this.lease,async()=>{

    const assignment = await this.ports.assignment(kind,this.lease.session.company);
    checkpoint();
    const endpoint = new URL(assignment.endpoint);
    if(assignment.kind !== kind || assignment.company !== this.lease.session.company || typeof assignment.audience !== 'string' || !assignment.audience || !this.allowed.has(endpoint.origin) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('Untrusted service assignment');
    const base = `${endpoint.origin}${endpoint.pathname.replace(/\/+$/,'')}/`;
    const target = new URL(relativePath.slice(1),base);
    if(target.origin !== endpoint.origin || !target.pathname.startsWith(new URL(base).pathname)) throw Error('Service path escaped assignment');
    const token = await this.ports.restrictedToken(kind,assignment.company,assignment.audience,release,controller.signal);
    checkpoint();
    if(token.company !== assignment.company || token.user !== this.lease.session.user || token.audience !== assignment.audience || !Number.isFinite(token.expiresAt) || token.expiresAt <= Date.now() || typeof token.value !== 'string' || !/^[A-Za-z0-9._~=-]+$/.test(token.value)) throw Error('Wrong service token scope');
    if(release && (token.releaseId!==release.id || token.api!==release.api))throw Error('Wrong active release token');
    try {
      const response = await this.ports.send({url:target.toString(),method:operation.method,body:serialized,token:token.value,signal:controller.signal,redirect:'error'});
      checkpoint();
      this.availability.set(kind,response.status===401||response.status===403?'denied':response.status>=500?'unavailable':'reachable');
      return response;
    } catch(error) {
      // Responses/errors from an invalidated account cannot affect another account's status/UI.
      checkpoint(); this.availability.set(kind,'unavailable'); throw error;
    }
    });}finally{for(const source of [this.lease.signal,scopeSignal])source?.removeEventListener('abort',abort);}
  }
}
