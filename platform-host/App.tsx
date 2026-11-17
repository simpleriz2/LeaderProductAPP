import React from 'react';
import {
  Button,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { createNativeHost } from './host/nativeHost';
import { restartNativeHost } from './adapters/restart.native';
import type { LocalHostProfile } from './host/platformHost';
declare const __LP2_LOCAL_PROFILE__: LocalHostProfile | null;
type Host = Awaited<ReturnType<typeof createNativeHost>>;
class ModuleBoundary extends React.Component<
  { host: Host; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    void this.props.host.moduleFailure();
  }
  render() {
    return this.state.failed ? (
      <Text accessibilityRole="alert">
        Модуль не удалось открыть. Сохранённые данные не удалены.
      </Text>
    ) : (
      this.props.children
    );
  }
}
function MountedScreen({
  host,
  id,
  Screen,
}: {
  host: Host;
  id: string;
  Screen: React.ComponentType;
}) {
  React.useEffect(() => {
    void host.mounted(id);
  }, [host, id]);
  return <Screen />;
}
export function ConfiguredNativeHost({ host }: { host: Host }) {
  const state = React.useSyncExternalStore(host.subscribe, host.getSnapshot),
    [user, setUser] = React.useState(''),
    [password, setPassword] = React.useState(''),
    [restartError, setRestartError] = React.useState(false),
    [restarting, setRestarting] = React.useState(false);
  const login = () => {
    const secret = password;
    setPassword('');
    void host.login(user, secret);
  };
  const restart = async () => {
    setRestarting(true);
    setRestartError(false);
    try {
      await restartNativeHost(() => host.dispose());
    } catch {
      setRestartError(true);
      setRestarting(false);
    }
  };
  return (
    <View style={styles.content}>
      <Text accessibilityLiveRegion="polite">{state.message}</Text>
      {state.user && (
        <Text>
          Компания: {state.company} · Пользователь: {state.user}
        </Text>
      )}
      {(state.phase === 'login' || state.phase === 'recovery') && (
        <>
          <TextInput
            accessibilityLabel="Пользователь"
            placeholder="Пользователь"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            value={user}
            onChangeText={setUser}
            style={styles.input}
          />
          <TextInput
            accessibilityLabel="Пароль"
            placeholder="Пароль"
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={login}
            style={styles.input}
          />
          <Button title="Войти" disabled={!user || !password} onPress={login} />
          {state.phase === 'recovery' && (
            <Button
              title="Восстановить рабочий комплект"
              onPress={() => void host.recover()}
            />
          )}
          {state.savedUser && (
            <Button
              title={`Продолжить без сети: ${state.savedUser}`}
              onPress={() => void host.restoreOffline()}
            />
          )}
        </>
      )}
      {state.phase === 'ready' && (
        <>
          <View accessibilityLabel="Модули">
            {state.modules.map(id => (
              <Button
                key={id}
                title={id === 'qr' ? 'QR' : id === 'help' ? 'Help' : id}
                accessibilityState={{ selected: state.selected === id }}
                onPress={() => void host.select(id)}
              />
            ))}
          </View>
          {state.Screen && state.selected && (
            <ModuleBoundary key={state.selected} host={host}>
              <MountedScreen
                host={host}
                id={state.selected}
                Screen={state.Screen}
              />
            </ModuleBoundary>
          )}
          {state.healthy && <Text>Комплект проверен</Text>}
          <Button
            title="Проверить обновления"
            onPress={() => void host.refresh()}
          />
          <Button title="Выйти" onPress={() => void host.logout()} />
        </>
      )}
      {state.phase === 'restart' && (
        <Button
          title="Перезапустить"
          disabled={restarting}
          onPress={() => void restart()}
        />
      )}
      {restartError && (
        <Text accessibilityRole="alert">
          Не удалось перезапустить приложение. Закройте и откройте его снова.
          Данные не удалены.
        </Text>
      )}
    </View>
  );
}
export default function App() {
  const profile =
    typeof __LP2_LOCAL_PROFILE__ === 'undefined' ? null : __LP2_LOCAL_PROFILE__;
  const [host, setHost] = React.useState<Host | null>(null),
    [failure, setFailure] = React.useState(false);
  React.useEffect(() => {
    let live = true,
      instance: Host | null = null;
    if (profile)
      void createNativeHost(profile)
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
  }, [profile]);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Text accessibilityRole="header" style={styles.title}>
            Leader Product 2.0 Fork
          </Text>
          {!profile ? (
            <Text>Среда ещё не настроена</Text>
          ) : failure ? (
            <Text accessibilityRole="alert">
              Не удалось открыть локальное хранилище. Данные не удалены.
            </Text>
          ) : host ? (
            <ConfiguredNativeHost host={host} />
          ) : (
            <Text accessibilityLiveRegion="polite">Открываем приложение…</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#777',
    borderRadius: 6,
    padding: 12,
    color: '#111',
    backgroundColor: '#fff',
  },
});
