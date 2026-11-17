import React from 'react';
import {
  createWebHost,
  type LocalWebProfile,
  type WebHostState,
} from './host/webHost';
declare const __LP2_LOCAL_PROFILE__: LocalWebProfile | null;
type Host = Awaited<ReturnType<typeof createWebHost>>;
class ModuleBoundary extends React.Component<
  { onFailure: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? (
      <p role="alert">
        Модуль не удалось открыть. Сохранённые данные не удалены.
      </p>
    ) : (
      this.props.children
    );
  }
}
function MountedScreen({
  host,
  Screen,
  id,
}: {
  host: Host;
  Screen: React.ComponentType;
  id: string;
}) {
  React.useEffect(() => {
    void host.mounted(id);
  }, [host, id]);
  return <Screen />;
}
function WorkingScreen({ host, state }: { host: Host; state: WebHostState }) {
  return state.Screen && state.selected ? (
    <ModuleBoundary
      key={state.selected}
      onFailure={() => void host.moduleFailure()}
    >
      <MountedScreen host={host} Screen={state.Screen} id={state.selected} />
    </ModuleBoundary>
  ) : null;
}
function ConfiguredHost({ host }: { host: Host }) {
  const state = React.useSyncExternalStore(host.subscribe, host.getSnapshot),
    [user, setUser] = React.useState(''),
    [password, setPassword] = React.useState('');
  const login = (event: React.FormEvent) => {
    event.preventDefault();
    const secret = password;
    setPassword('');
    void host.login(user, secret);
  };
  return (
    <>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
      {state.user && (
        <p>
          Компания: {state.company} · Пользователь: {state.user}
        </p>
      )}
      {(state.phase === 'login' || state.phase === 'recovery') && (
        <>
          <form onSubmit={login}>
            <p>
              <label>
                Пользователь{' '}
                <input
                  autoComplete="username"
                  required
                  value={user}
                  onChange={event => setUser(event.target.value)}
                />
              </label>
            </p>
            <p>
              <label>
                Пароль{' '}
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                />
              </label>
            </p>
            <button type="submit">Войти</button>
          </form>
          {state.phase === 'recovery' && (
            <p>
              <button onClick={() => void host.recover()}>
                Восстановить рабочий комплект
              </button>
            </p>
          )}
          {state.savedUser && (
            <p>
              <button onClick={() => void host.restoreOffline()}>
                Продолжить без сети: {state.savedUser}
              </button>
            </p>
          )}
        </>
      )}
      {state.phase === 'ready' && (
        <>
          <nav aria-label="Модули">
            {state.modules.map(id => (
              <button
                key={id}
                aria-pressed={state.selected === id}
                onClick={() => void host.select(id)}
              >
                {id === 'qr' ? 'QR' : 'Help'}
              </button>
            ))}
          </nav>
          <WorkingScreen host={host} state={state} />
          {state.healthy && <p>Комплект проверен</p>}
          <p>
            <button onClick={() => void host.refresh()}>
              Проверить обновления
            </button>{' '}
            <button onClick={() => void host.logout()}>Выйти</button>
          </p>
        </>
      )}
      {state.phase === 'restart' && (
        <button onClick={() => location.reload()}>Перезапустить</button>
      )}
    </>
  );
}
export default function App() {
  const [host, setHost] = React.useState<Host | null>(null),
    [failure, setFailure] = React.useState(false);
  React.useEffect(() => {
    let live = true,
      instance: Host | null = null;
    if (__LP2_LOCAL_PROFILE__)
      void createWebHost(__LP2_LOCAL_PROFILE__)
        .then(value => {
          instance = value;
          if (live) setHost(value);
          else void value.dispose();
        })
        .catch(() => {
          if (live) setFailure(true);
        });
    return () => {
      live = false;
      void instance?.dispose();
    };
  }, []);
  return (
    <main
      style={{
        maxWidth: 880,
        margin: '2rem auto',
        padding: '0 1rem',
        fontFamily: 'system-ui,sans-serif',
        lineHeight: 1.5,
      }}
    >
      <h1>Leader Product 2.0 Fork</h1>
      {__LP2_LOCAL_PROFILE__ && <p>Локальный пилот</p>}
      {!__LP2_LOCAL_PROFILE__ ? (
        <p>Среда ещё не настроена</p>
      ) : failure ? (
        <p role="alert">
          Не удалось открыть локальное хранилище. Данные не удалены.
        </p>
      ) : host ? (
        <ConfiguredHost host={host} />
      ) : (
        <p role="status">Открываем приложение…</p>
      )}
    </main>
  );
}
