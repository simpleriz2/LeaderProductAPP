import { hasSessionAction } from '../../core/confirmedSession.ts';
import type { ModuleHostPorts } from '../../core/moduleFactory';
import {
  createQrCompanyClient,
  QrCompanyError,
  type QrDocument,
} from './companyClient.ts';
import { createQrDraftRepository, type QrDraft } from './drafts.ts';
import { createQrCreateAttempts } from './createAttempts.ts';
import type { RecordValue } from '../../database/moduleDatabase';
export type QrState = {
  busy: boolean;
  error: string | null;
  online: boolean;
  items: QrDocument[];
  nextAfter: string | null;
  drafts: RecordValue<QrDraft>[];
  draftNextAfter?: string;
  form: {
    id: string;
    revision: number | null;
    draft: QrDraft;
    pending: boolean;
    created: boolean;
  } | null;
};
/** First business UI slice: list/status and durable TEXT creation. Other legacy QR workflows remain retained. */
export function createQrController(ports: ModuleHostPorts) {
  const { lease } = ports,
    drafts = createQrDraftRepository(ports.data, lease),
    attempts = createQrCreateAttempts(
      ports.data,
      lease,
      ports.createOperationId,
    );
  const listeners = new Set<() => void>(),
    pending = new Set<Promise<unknown>>();
  let active = false,
    epoch = 0,
    scope: AbortController | null = null;
  let state: QrState = {
    busy: false,
    error: null,
    online: lease.online,
    items: [],
    nextAfter: null,
    drafts: [],
    form: null,
  };
  const can = (action: string) => hasSessionAction(lease.session, 'qr', action);
  const emit = (patch: Partial<QrState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const checkpoint = (revision = epoch) => {
    lease.assertCurrent();
    if (!active || revision !== epoch || scope?.signal.aborted)
      throw Error('QR module suspended');
  };
  const api = () => {
    checkpoint();
    return createQrCompanyClient(ports.company(scope!.signal));
  };
  async function localDrafts(reset = true) {
    const page = await drafts.list(
      20,
      reset ? undefined : state.draftNextAfter,
    );
    checkpoint();
    emit({
      drafts: reset ? page.items : [...state.drafts, ...page.items],
      draftNextAfter: page.nextAfter,
    });
  }
  async function load(reset = true) {
    await localDrafts();
    if (!lease.online || !can('view_qr')) return;
    const page = await api().list(
      50,
      reset ? undefined : state.nextAfter ?? undefined,
    );
    checkpoint();
    emit({
      items: reset ? page.items : [...state.items, ...page.items],
      nextAfter: page.nextAfter,
    });
  }
  function run(work: () => Promise<void>) {
    if (!active || state.busy) return Promise.resolve();
    const revision = epoch;
    emit({ busy: true, error: null });
    const task: Promise<void> = Promise.resolve().then(async () => {
      try {
        checkpoint(revision);
        await work();
        checkpoint(revision);
      } catch (error) {
        if (active && revision === epoch && !lease.signal.aborted) {
          emit({
            error:
              error instanceof QrCompanyError
                ? error.status === 409
                  ? 'Данные изменились. Обновите список перед повтором.'
                  : error.status === 503
                  ? 'Сервис временно недоступен. Сохранённые черновики доступны.'
                  : error.status === 401 || error.status === 403
                  ? 'Нужна повторная проверка доступа.'
                  : 'Не удалось выполнить операцию.'
                : error instanceof Error
                ? error.message
                : 'Не удалось выполнить операцию.',
          });
          if (
            error instanceof QrCompanyError &&
            (error.status === 401 || error.status === 403)
          )
            ports.requestAuthorizationCheck();
        }
      } finally {
        pending.delete(task);
        if (active && revision === epoch) emit({ busy: false });
      }
    });
    pending.add(task);
    return task;
  }
  async function saveCurrent() {
    checkpoint();
    const form = state.form;
    if (!form || form.created) throw Error('Выберите новый черновик');
    const revision = await drafts.save(form.id, form.draft, form.revision);
    checkpoint();
    emit({ form: { ...form, revision } });
    await localDrafts();
    return { ...form, revision };
  }
  return {
    id: 'qr',
    requiresOnline: false,
    can,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async init(current: typeof lease) {
      current.assertCurrent();
      if (
        current.signal !== lease.signal ||
        current.session.company !== lease.session.company ||
        current.session.user !== lease.session.user
      )
        throw Error('Wrong QR lifecycle lease');
    },
    async activate() {
      lease.assertCurrent();
      if (active) return;
      active = true;
      epoch++;
      scope = new AbortController();
      void run(() => load());
    },
    async suspend() {
      active = false;
      epoch++;
      scope?.abort();
      await Promise.allSettled([...pending]);
      scope = null;
    },
    async dispose() {
      active = false;
      epoch++;
      scope?.abort();
      await Promise.allSettled([...pending]);
      scope = null;
      listeners.clear();
    },
    refresh: () => run(() => load()),
    more: () => (state.nextAfter ? run(() => load(false)) : Promise.resolve()),
    moreDrafts: () =>
      state.draftNextAfter ? run(() => localDrafts(false)) : Promise.resolve(),
    newText() {
      checkpoint();
      if (state.busy || !can('create_qr')) return;
      emit({
        form: {
          id: ports.createOperationId(),
          revision: null,
          draft: {
            format: 1,
            documentId: null,
            qrType: 'TEXT',
            description: '',
            values: { text: '' },
          },
          pending: false,
          created: false,
        },
        error: null,
      });
    },
    openDraft: (id: string) =>
      run(async () => {
        const record = await drafts.get(id);
        if (!record) throw Error('Черновик не найден');
        const attempt =
          can('create_qr') || can('view_qr') ? await attempts.get(id) : null;
        checkpoint();
        emit({
          form: {
            id,
            revision: record.revision,
            draft: record.value,
            pending: attempt?.value.status === 'pending',
            created: record.value.documentId !== null,
          },
        });
      }),
    change(field: 'text' | 'description', value: string) {
      checkpoint();
      if (
        state.busy ||
        !state.form ||
        state.form.pending ||
        state.form.created ||
        state.form.draft.qrType !== 'TEXT'
      )
        return;
      const form = state.form;
      emit({
        form: {
          ...form,
          draft:
            field === 'text'
              ? { ...form.draft, values: { ...form.draft.values, text: value } }
              : { ...form.draft, description: value },
        },
      });
    },
    save: () =>
      run(async () => {
        await saveCurrent();
      }),
    submit: () =>
      run(async () => {
        if (!lease.online || !can('create_qr'))
          throw Error(
            'Для создания QR требуется подтверждённая сеть и право создания',
          );
        let form = state.form;
        if (!form || form.draft.qrType !== 'TEXT')
          throw Error('Выберите текстовый черновик');
        if (form.created)
          throw Error(
            'QR уже создан. Для другого кода создайте новый черновик.',
          );
        const existing = await attempts.get(form.id);
        if (!existing) {
          form = await saveCurrent();
          await attempts.prepare(form.id, form.revision!, {
            qrType: 'TEXT',
            qrData: form.draft.values.text ?? '',
            description: form.draft.description.trim()
              ? form.draft.description
              : null,
          });
          checkpoint();
          emit({ form: { ...form, pending: true } });
        }
        await attempts.transmit(form.id, api());
        checkpoint();
        const saved = await drafts.get(form.id);
        if (!saved) throw Error('Подтверждённый черновик недоступен');
        emit({
          form: {
            id: form.id,
            revision: saved.revision,
            draft: saved.value,
            pending: false,
            created: true,
          },
        });
        await load();
      }),
    status: (
      document: QrDocument,
      status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'RESTORE',
    ) =>
      run(async () => {
        if (!lease.online) throw Error('Изменение QR требует связи');
        const client = api();
        if (status === 'RESTORE')
          await client.restore(document.id, document.revision);
        else if (status === 'DELETED')
          await client.remove(document.id, document.revision);
        else await client.setStatus(document.id, document.revision, status);
        await load();
      }),
  };
}
