import type { ComponentType } from 'react';
import type {
  SessionStore,
  ConfirmedSession,
  SessionCoordinator,
} from '../core/sessionCoordinator';
import type { SignedOfflineSession } from '../core/offlineSession';
import type { SessionAuthority } from '../core/sessionAuthority';
import type { CentralExchange } from '../core/centralClient';
import type {
  Trust,
  ReleaseContext,
  ReleasePorts,
  Activation,
} from '../core/releaseSet';
import type { BootstrapPorts } from '../core/releaseBootstrap';
import type { RemoteModuleFactory } from '../core/moduleFactory';
import type { ServiceRoutingPorts } from '../core/serviceRouter';
import type { GenerationLock } from '../database/generationFence';
import type { DataDriver } from '../database/contracts';
export type HostSessionStore = SessionStore & {
  peekLastConfirmed(): Promise<ConfirmedSession | null>;
  beginOnlineConfirmation(): Promise<{
    acceptOnlineGrant(signed: SignedOfflineSession): Promise<ConfirmedSession>;
  }>;
};
export type HostFederation = {
  screen(module: string): Promise<ComponentType>;
  factory(module: string): Promise<RemoteModuleFactory>;
  dispose(): void;
};
export type HostBackend = {
  identity: Pick<
    ReleaseContext,
    'platform' | 'host' | 'runtime' | 'capabilities'
  >;
  trust: Trust;
  sessionStore: HostSessionStore;
  storage: BootstrapPorts['storage'];
  driver: DataDriver;
  authority: SessionAuthority;
  generationLock: GenerationLock;
  centralExchange: CentralExchange;
  http: ServiceRoutingPorts['send'];
  artifacts: ServiceRoutingPorts['send'];
  openFederation(
    activation: Activation,
    context: ReleaseContext,
    ports: ReleasePorts,
    verifyData: BootstrapPorts['verifyData'],
  ): Promise<HostFederation>;
  createOperationId(): string;
  bindSessionInvalidation(
    coordinator: SessionCoordinator,
    onInvalidated: (error?: unknown) => void,
  ): () => void;
  close(): void | Promise<void>;
};
