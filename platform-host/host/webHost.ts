import type { ComponentType } from 'react';
import type {
  Activation,
  ReleaseContext,
  SignedRelease,
} from '../core/releaseSet';
import type {
  BootstrapPorts,
  BootstrapProgress,
} from '../core/releaseBootstrap';
import {
  bootstrapRelease,
  confirmReleaseHealthy,
  recoverLastHealthy,
} from '../core/releaseBootstrap';
import { verifyOfflineSession } from '../core/offlineSession';
import type { SignedOfflineSession } from '../core/offlineSession';
import {
  SessionCoordinator,
  type SessionLease,
} from '../core/sessionCoordinator';
import { bindReleaseSession } from '../core/releaseSession';
import { ServiceRouter } from '../core/serviceRouter';
import { artifactDownloader } from '../core/artifactDownload';
import {
  openWebSessionStore,
  createWebSessionAuthority,
  bindWebSessionInvalidation,
} from '../adapters/offlineSession.web';
import { openWebReleaseStorage } from '../adapters/releaseStorage.web';
import { openVerifiedWebFederation } from '../adapters/federation.web';
import { createWebTrust } from '../adapters/trust.web';
import { createWebArtifactTransport } from '../adapters/artifacts.web';
import { withWebRequestDeadline } from '../adapters/requestDeadline.web';
import { readResponseBytes } from '../adapters/httpBytes.web';
import { createIndexedDbDriver } from '../database/indexedDbDriver.web';
import { createWebGenerationLock } from '../database/generationLock.web';
import { createGenerationFence } from '../database/generationFence';
import { bindAuthorizedGeneration } from '../database/authorizedGeneration';
import {
  prepareDataGeneration,
  schemasForRelease,
} from '../database/migrations';
import runtime from '../host.runtime.json';
export type LocalWebProfile = {
  mode: 'local-pilot';
  central: string;
  allowedOrigins: string[];
  roots: Record<string, string>;
};
export type WebHostState = {
  phase: 'login' | 'preparing' | 'ready' | 'recovery' | 'restart';
  message: string;
  savedUser?: string;
  user?: string;
  company?: string;
  modules: string[];
  selected?: string;
  Screen?: ComponentType;
  healthy?: boolean;
};
type Discovery = {
  company: string;
  companyApi: string;
  artifactApi: string;
  modules: string[];
  release: SignedRelease;
  offlineGrant: SignedOfflineSession;
};
class RestartRequired extends Error {}
class CentralDenied extends Error {}
/** Local pilot composition. No production defaults, persistent bearer, arbitrary URL setter or legacy business imports. */
export async function createWebHost(profile: LocalWebProfile) {
  const trust = createWebTrust(profile.roots),
    sessionStore = await openWebSessionStore(trust),
    cache = await openWebReleaseStorage(trust),
    driver = createIndexedDbDriver();
  const authority = createWebSessionAuthority(sessionStore),
    fence = createGenerationFence(createWebGenerationLock(), cache.current);
  const listeners = new Set<() => void>(),
    screens = new Map<string, ComponentType>(),
    mounted = new Set<string>(),
    activeProbes = new Set<string>();
  let state: WebHostState = {
      phase: 'login',
      message: 'Войдите или откройте сохранённую сессию',
      modules: [],
    },
    universal: string | null = null,
    discovery: Discovery | null = null;
  let loader: Awaited<ReturnType<typeof openVerifiedWebFederation>> | null =
      null,
    activation: Activation | null = null,
    prepared: {
      lease: SessionLease;
      context: ReleaseContext;
      ports: BootstrapPorts;
    } | null = null;
  let transition = 0,
    authController = new AbortController(),
    disposed = false,
    healthPending = false;
  const emit = (next: WebHostState) => {
    if (disposed) return;
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  };
  const message = (progress: BootstrapProgress) => {
    const labels = {
      checking: 'Проверяем назначенную версию',
      updating: 'Подготавливаем обновление',
      'verifying-installed': 'Проверяем сохранённый комплект',
      ready: 'Комплект готов',
      recovery: 'Требуется восстановление',
    };
    const detail = progress.release;
    emit({
      ...state,
      phase: 'preparing',
      Screen: undefined,
      message:
        labels[progress.phase] +
        (detail && detail.total
          ? ` (${detail.completed}/${detail.total})`
          : ''),
    });
  };
  async function central(
    path: '/login' | '/discovery' | '/tokens',
    body: unknown,
    signal: AbortSignal,
  ) {
    return withWebRequestDeadline(signal, 15000, async bounded => {
      const response = await fetch(profile.central + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(path !== '/login' && universal
            ? { Authorization: `Bearer ${universal}` }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: bounded,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      });
      const bytes = await readResponseBytes(response, bounded, 256 * 1024);
      if (response.status !== 200)
        throw response.status === 401 && path !== '/login'
          ? new CentralDenied()
          : Error('Central request failed');
      return JSON.parse(new TextDecoder().decode(bytes));
    });
  }
  const modules = ['qr', 'help'].map(id => ({
    id,
    requiresOnline: false,
    async init(lease: SessionLease) {
      lease.assertCurrent();
      if (!screens.has(id)) throw Error('Module preflight unavailable');
    },
    async activate() {
      activeProbes.add(id);
    },
    async suspend() {
      activeProbes.delete(id);
      if (state.selected === id)
        emit({ ...state, Screen: undefined, selected: undefined });
    },
    async dispose() {
      activeProbes.delete(id);
    },
  }));
  const coordinator = new SessionCoordinator(sessionStore, modules, {
    async prepare(lease) {
      const context: ReleaseContext = {
        platform: 'web',
        company: lease.session.company,
        user: lease.session.user,
        host: runtime.web.version,
        runtime: runtime.web.runtime,
        compatibleApis: ['1.0.0'],
        modules: lease.session.modules,
        capabilities: {},
        contracts: lease.session.permissions ? { authActions: ['1.0.0'] } : {},
        moduleContracts: { qr: ['1.0.0'], help: ['1.0.0'] },
      };
      const data = bindAuthorizedGeneration(authority, lease, fence);
      const transport = createWebArtifactTransport();
      const router = new ServiceRouter(
        lease,
        {
          assignment: async kind => {
            if (!discovery || kind === 'help')
              throw Error('Service unavailable');
            return {
              kind,
              company: discovery.company,
              audience:
                kind === 'artifacts'
                  ? 'artifacts'
                  : `company:${discovery.company}`,
              endpoint:
                kind === 'artifacts'
                  ? discovery.artifactApi
                  : discovery.companyApi,
            };
          },
          restrictedToken: async (_kind, _company, audience) => {
            const token = (await central(
              '/tokens',
              { audience },
              lease.signal,
            )) as {
              token: string;
              audience: string;
              company: string;
              user: string;
              expiresAt: number;
            };
            return { ...token, value: token.token };
          },
          send: async request => {
            const response = await transport(request);
            if (response.status !== 200) {
              // A missing/denied artifact may be a mid-update entitlement change. Confirm at pinned Central.
              const fresh = (await central(
                '/discovery',
                undefined,
                lease.signal,
              )) as Discovery;
              const confirmed = (
                await verifyOfflineSession(fresh.offlineGrant, trust)
              ).session;
              lease.assertCurrent();
              if (
                confirmed.company !== lease.session.company ||
                confirmed.user !== lease.session.user
              )
                throw Error('Central identity mismatch');
              if (
                lease.session.modules.some(
                  module => !confirmed.modules.includes(module),
                ) ||
                Object.entries(lease.session.permissions || {}).some(
                  ([module, actions]) =>
                    actions.some(
                      action =>
                        !confirmed.permissions?.[module]?.includes(action),
                    ),
                )
              )
                throw new CentralDenied();
            }
            return response;
          },
        },
        profile.allowedOrigins,
        authority,
      );
      const ports: BootstrapPorts = {
        storage: cache,
        trust,
        withDataActivation: work => data.activation(work),
        createAttemptId: () => crypto.randomUUID(),
        download: artifactDownloader(router),
        assignedRelease: async () => {
          if (!discovery) throw Error('Online discovery required');
          return discovery.release;
        },
        prepareData: (release, previous) =>
          prepareDataGeneration(driver, lease, release, previous, [], () =>
            crypto.randomUUID(),
          ),
        verifyData: active =>
          authority.run(lease, () =>
            driver.verify(
              {
                company: active.company,
                user: active.user,
                generation: active.dataGeneration,
              },
              schemasForRelease(active.release),
            ),
          ),
        onProgress: message,
      };
      const result = await bootstrapRelease(lease, context, ports);
      lease.assertCurrent();
      activation = result.activation;
      prepared = { lease, context, ports };
      mounted.clear();
      if (loader) {
        emit({
          ...state,
          phase: 'restart',
          Screen: undefined,
          message: 'Обновление подготовлено. Перезапустите рабочий комплект',
        });
        throw new RestartRequired();
      }
      loader = await openVerifiedWebFederation(
        activation,
        context,
        bindReleaseSession(lease, context, { ...ports, onProgress: undefined }),
        ports.verifyData,
      );
      // Probe contract has no import-time workers. Business factory lifecycle/health contracts remain a separate migration.
      for (const id of lease.session.modules) {
        screens.set(id, await loader.screen(id));
        lease.assertCurrent();
      }
      emit({
        phase: 'ready',
        message: 'Выберите модуль',
        modules: [...lease.session.modules],
        company: lease.session.company,
        user: lease.session.user,
        savedUser: lease.session.user,
        healthy: false,
      });
    },
  });
  const unbind = bindWebSessionInvalidation(sessionStore, coordinator, () => {
    ++transition;
    universal = null;
    authController.abort();
    emit({
      ...state,
      phase: 'restart',
      Screen: undefined,
      message: 'Сессия изменилась в другой вкладке. Перезапустите приложение',
    });
  });
  try {
    const saved = await sessionStore.peekLastConfirmed();
    if (saved) emit({ ...state, savedUser: saved.user });
  } catch {
    emit({
      ...state,
      phase: 'recovery',
      message:
        'Сохранённую сессию не удалось проверить. Нужен вход через Central',
    });
  }
  async function confirmOnline(
    ticket: Awaited<ReturnType<typeof sessionStore.beginOnlineConfirmation>>,
    signal: AbortSignal,
    revision: number,
  ) {
    const next = (await central('/discovery', undefined, signal)) as Discovery;
    if (
      !next ||
      typeof next.company !== 'string' ||
      typeof next.companyApi !== 'string' ||
      typeof next.artifactApi !== 'string' ||
      !Array.isArray(next.modules)
    )
      throw Error('Invalid discovery');
    if (revision !== transition || disposed)
      throw Error('Superseded host login');
    const session = await ticket.acceptOnlineGrant(next.offlineGrant);
    if (revision !== transition || disposed)
      throw Error('Superseded host login');
    if (
      next.company !== session.company ||
      JSON.stringify(next.modules) !== JSON.stringify(session.modules)
    )
      throw Error('Discovery identity mismatch');
    discovery = next;
    await coordinator.confirm(session);
  }
  async function guarded(work: () => Promise<void>, revision = transition) {
    try {
      await work();
    } catch (error) {
      if (
        revision !== transition ||
        disposed ||
        error instanceof RestartRequired
      )
        return;
      if (error instanceof CentralDenied) {
        universal = null;
        emit({
          ...state,
          phase: 'preparing',
          Screen: undefined,
          message: 'Завершаем неподтверждённую сессию',
        });
        try {
          await coordinator.logout('revoked');
          emit({
            phase: 'restart',
            modules: [],
            message:
              'Central не подтвердил сессию. Перезапустите приложение для входа',
          });
        } catch {
          emit({
            phase: 'recovery',
            modules: [],
            message: 'Не удалось завершить выход. Рабочие экраны заблокированы',
          });
        }
        return;
      }
      emit({
        ...state,
        phase: 'recovery',
        Screen: undefined,
        message: 'Не удалось подготовить рабочий комплект. Данные сохранены',
      });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    login: async (user: string, password: string) => {
      const revision = ++transition;
      authController.abort();
      authController = new AbortController();
      const signal = authController.signal;
      emit({
        ...state,
        phase: 'preparing',
        message: 'Проверяем вход',
        Screen: undefined,
      });
      universal = null;
      discovery = null;
      await guarded(async () => {
        const ticket = await sessionStore.beginOnlineConfirmation();
        const result = (await central(
          '/login',
          { user, password,platform:'web' },
          signal,
        )) as { token: string };
        if (revision !== transition || disposed)
          throw Error('Superseded host login');
        if (
          !result ||
          typeof result.token !== 'string' ||
          result.token.length > 512 ||
          !/^[A-Za-z0-9_-]+$/.test(result.token)
        )
          throw Error('Invalid Central session');
        universal = result.token;
        await confirmOnline(ticket, signal, revision);
      });
    },
    restoreOffline: async () => {
      ++transition;
      authController.abort();
      universal = null;
      discovery = null;
      await guarded(() => coordinator.restoreOffline());
    },
    refresh: async () => {
      if (!universal) {
        emit({
          ...state,
          phase: 'recovery',
          Screen: undefined,
          message: 'Для проверки обновлений войдите при подключении к сети',
        });
        return;
      }
      const revision = ++transition;
      authController.abort();
      authController = new AbortController();
      await guarded(async () => {
        const ticket = await sessionStore.beginOnlineConfirmation();
        await confirmOnline(ticket, authController.signal, revision);
      });
    },
    select: async (id: string) =>
      guarded(async () => {
        await coordinator.activate(id);
        coordinator.currentLease().assertCurrent();
        if (!activeProbes.has(id)) throw Error('Probe not active');
        emit({
          ...state,
          phase: 'ready',
          selected: id,
          Screen: screens.get(id),
          message: 'Рабочий комплект',
        });
      }),
    moduleFailure: async () => {
      const revision = transition;
      try {
        await coordinator.goOffline();
      } catch {
        /* Recovery must not execute another set in this document. */
      }
      if (revision !== transition || disposed) return;
      emit({
        ...state,
        phase: 'recovery',
        Screen: undefined,
        message:
          'Модуль не удалось запустить. Можно восстановить рабочий комплект',
      });
    },
    recover: async () =>
      guarded(async () => {
        try {
          await coordinator.goOffline();
        } catch (error) {
          if (!(error instanceof RestartRequired)) throw error;
        }
        if (!prepared) throw Error('No recovery context');
        const result = await recoverLastHealthy(
          prepared.lease,
          prepared.context,
          prepared.ports,
        );
        activation = result.activation;
        emit({
          ...state,
          phase: 'restart',
          Screen: undefined,
          message:
            'Рабочий комплект восстановлен. Перезапустите приложение и откройте сохранённую сессию',
        });
      }),
    mounted: async (id: string) => {
      if (!prepared || !activation || state.selected !== id || healthPending)
        return;
      const current = prepared,
        candidate = activation;
      mounted.add(id);
      if (!current.lease.session.modules.every(module => mounted.has(module)))
        return;
      healthPending = true;
      try {
        await confirmReleaseHealthy(
          current.lease,
          current.context,
          current.ports,
          candidate,
          async () => {
            current.lease.assertCurrent();
          },
        );
        current.lease.assertCurrent();
        emit({ ...state, healthy: true });
      } catch {
        try {
          current.lease.assertCurrent();
          emit({
            ...state,
            phase: 'recovery',
            Screen: undefined,
            message:
              'Не удалось подтвердить рабочий комплект. Данные сохранены',
          });
        } catch {
          /* Other account owns the UI now. */
        }
      } finally {
        healthPending = false;
      }
    },
    logout: async () => {
      ++transition;
      authController.abort();
      universal = null;
      discovery = null;
      emit({
        ...state,
        phase: 'preparing',
        Screen: undefined,
        message: 'Завершаем сессию',
      });
      try {
        await coordinator.logout();
        loader?.dispose();
        emit({
          phase: 'restart',
          message: 'Вы вышли. Перезапустите приложение для нового входа',
          modules: [],
        });
      } catch {
        emit({
          phase: 'recovery',
          modules: [],
          message: 'Не удалось завершить выход. Рабочие экраны заблокированы',
        });
      }
    },
    dispose: async () => {
      disposed = true;
      ++transition;
      authController.abort();
      unbind();
      loader?.dispose();
      listeners.clear();
      try {
        await coordinator.invalidateExternalSession();
      } finally {
        if (activation)
          await driver.close({
            company: activation.company,
            user: activation.user,
            generation: activation.dataGeneration,
          });
        cache.close();
        sessionStore.close();
      }
    },
  };
}
