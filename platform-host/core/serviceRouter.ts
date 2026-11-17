import type {SessionAuthority} from './sessionAuthority';
import type { SessionLease } from './sessionCoordinator';
export type ServiceKind = 'company' | 'artifacts' | 'help';
export type ServiceAssignment = { kind: ServiceKind; company: string; audience: string; endpoint: string };
export type ServiceToken = { value: string; company: string; user: string; audience: string; expiresAt: number };
export type ServiceAvailability = 'unknown' | 'reachable' | 'unavailable' | 'denied';
export interface ServiceRoutingPorts {
  /** Only authenticated Central discovery may implement this port. No user-entered URL setter. */
  assignment(kind: ServiceKind, company: string): Promise<ServiceAssignment>;
  restrictedToken(kind: ServiceKind, company: string, audience: string): Promise<ServiceToken>;
  /** Native/Web adapters MUST reject redirects before forwarding Authorization. */
  send(request: { url: string; method: 'GET' | 'POST'; body?: string; token: string; signal: AbortSignal; redirect: 'error' }): Promise<{ status: number; body: unknown }>;
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
    this.lease.assertCurrent();
    if(!this.lease.online) throw Error('Service requires online confirmation');
    const decoded = decodeURIComponent(relativePath);
    if(!relativePath.startsWith('/') || decoded.startsWith('//') || /[\\#\u0000-\u001f]/.test(decoded) || decoded.split(/[/?]/).some(p=>p==='.'||p==='..')) throw Error('Invalid service path');
    return this.authority.run(this.lease,async()=>{
    const assignment = await this.ports.assignment(kind,this.lease.session.company);
    this.lease.assertCurrent();
    const endpoint = new URL(assignment.endpoint);
    if(assignment.kind !== kind || assignment.company !== this.lease.session.company || typeof assignment.audience !== 'string' || !assignment.audience || !this.allowed.has(endpoint.origin) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('Untrusted service assignment');
    const base = `${endpoint.origin}${endpoint.pathname.replace(/\/+$/,'')}/`;
    const target = new URL(relativePath.slice(1),base);
    if(target.origin !== endpoint.origin || !target.pathname.startsWith(new URL(base).pathname)) throw Error('Service path escaped assignment');
    const token = await this.ports.restrictedToken(kind,assignment.company,assignment.audience);
    this.lease.assertCurrent();
    if(token.company !== assignment.company || token.user !== this.lease.session.user || token.audience !== assignment.audience || !Number.isFinite(token.expiresAt) || token.expiresAt <= Date.now() || typeof token.value !== 'string' || !/^[A-Za-z0-9._~=-]+$/.test(token.value)) throw Error('Wrong service token scope');
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    try {
      const response = await this.ports.send({url:target.toString(),method:body===undefined?'GET':'POST',body:serialized,token:token.value,signal:this.lease.signal,redirect:'error'});
      this.lease.assertCurrent();
      this.availability.set(kind,response.status===401||response.status===403?'denied':response.status>=500?'unavailable':'reachable');
      return response;
    } catch(error) {
      // Responses/errors from an invalidated account cannot affect another account's status/UI.
      this.lease.assertCurrent(); this.availability.set(kind,'unavailable'); throw error;
    }
    });
  }
}
