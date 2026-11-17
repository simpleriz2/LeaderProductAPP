import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import type { RemoteModuleFactory } from '../../core/moduleFactory';
import { createQrController } from './controller';
declare const __LP2_MODULE_VERSION__: string;
const styles = {
  panel: { padding: 16, gap: 12 },
  row: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccd5df',
    borderRadius: 6,
    gap: 8,
  },
  button: { padding: 10, backgroundColor: '#e6eef8', borderRadius: 4 },
  input: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#aab7c8',
    borderRadius: 4,
  },
  heading: { fontSize: 22, fontWeight: '600' as const },
  muted: { color: '#566477' },
};
const factory: RemoteModuleFactory = {
  id: 'qr',
  version: __LP2_MODULE_VERSION__,
  contract: '2.0.0',
  schema: 2,
  requiresOnline: false,
  create(ports) {
    const controller = createQrController(ports);
    function Screen() {
      const state = React.useSyncExternalStore(
          controller.subscribe,
          controller.getSnapshot,
          controller.getSnapshot,
        ),
        form = state.form;
      const button = (label: string, onPress: () => void, disabled = false) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={disabled || state.busy}
          onPress={onPress}
          style={[styles.button, (disabled || state.busy) && { opacity: 0.5 }]}
        >
          <Text>{label}</Text>
        </Pressable>
      );
      return (
        <ScrollView
          contentContainerStyle={styles.panel}
          keyboardShouldPersistTaps="handled"
        >
          <Text accessibilityRole="header" style={styles.heading}>
            QR-коды
          </Text>
          <Text style={styles.muted}>
            {state.online
              ? 'Подтверждённая сессия'
              : 'Без сети: сохранённые черновики'}
          </Text>
          {state.error && <Text accessibilityRole="alert">{state.error}</Text>}
          {state.busy && <Text>Выполняем операцию…</Text>}
          {button('Обновить список', () => {
            void controller.refresh();
          })}
          {controller.can('create_qr') &&
            button('Новый текстовый QR', () => controller.newText())}
          {form && (
            <View style={styles.row}>
              <Text accessibilityRole="header">
                {form.created
                  ? 'Создание подтверждено'
                  : form.pending
                  ? 'Ожидает подтверждения'
                  : 'Черновик QR'}
              </Text>
              {form.draft.qrType === 'TEXT' ? (
                <>
                  <Text>Наименование</Text>
                  <TextInput
                    accessibilityLabel="Наименование QR"
                    style={styles.input}
                    value={form.draft.description}
                    editable={!state.busy && !form.pending && !form.created}
                    onChangeText={value =>
                      controller.change('description', value)
                    }
                  />
                  <Text>Текст</Text>
                  <TextInput
                    accessibilityLabel="Текст QR"
                    style={styles.input}
                    value={form.draft.values.text ?? ''}
                    multiline
                    editable={!state.busy && !form.pending && !form.created}
                    onChangeText={value => controller.change('text', value)}
                  />
                  {!form.created &&
                    !form.pending &&
                    button('Сохранить черновик', () => {
                      void controller.save();
                    })}
                  {!form.created &&
                    controller.can('create_qr') &&
                    button(
                      form.pending ? 'Повторить подтверждение' : 'Создать QR',
                      () => {
                        void controller.submit();
                      },
                      !state.online,
                    )}
                </>
              ) : (
                <Text>
                  Черновик {form.draft.qrType}: {form.draft.description}. Данные
                  сохранены.
                </Text>
              )}
            </View>
          )}
          <Text accessibilityRole="header">Сохранённые черновики</Text>
          {!state.drafts.length && (
            <Text style={styles.muted}>Сохранённых черновиков нет</Text>
          )}
          {state.drafts.map(record => (
            <View key={record.id} style={styles.row}>
              <Text>{record.value.description || record.value.qrType}</Text>
              <Text>{record.value.documentId ? 'Создан' : 'Черновик'}</Text>
              {button(
                'Открыть черновик ' +
                  (record.value.description || record.value.qrType),
                () => {
                  void controller.openDraft(record.id);
                },
              )}
            </View>
          ))}
          {state.draftNextAfter &&
            button('Ещё черновики', () => {
              void controller.moreDrafts();
            })}
          {controller.can('view_qr') && (
            <>
              <Text accessibilityRole="header">Мои QR-коды</Text>
              {!state.online && (
                <Text style={styles.muted}>
                  Список с сервера обновится после подключения и проверки
                  доступа.
                </Text>
              )}
              {state.online && !state.items.length && !state.busy && (
                <Text style={styles.muted}>QR-кодов пока нет</Text>
              )}
              {state.items.map(document => (
                <View key={document.id} style={styles.row}>
                  <Text>{document.description || document.qrType}</Text>
                  <Text>
                    {document.status === 'ACTIVE'
                      ? 'Активен'
                      : document.status === 'PAUSED'
                      ? 'Приостановлен'
                      : 'Удалён'}
                  </Text>
                  {document.qrType === 'TEXT' && <Text>{document.qrData}</Text>}
                  {document.status !== 'DELETED' &&
                    controller.can('update_qr') &&
                    button(
                      document.status === 'ACTIVE'
                        ? 'Приостановить'
                        : 'Возобновить',
                      () => {
                        void controller.status(
                          document,
                          document.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                        );
                      },
                      !state.online,
                    )}
                  {document.status !== 'DELETED' &&
                    controller.can('delete_qr') &&
                    button(
                      'Удалить QR',
                      () => {
                        void controller.status(document, 'DELETED');
                      },
                      !state.online,
                    )}
                  {document.status === 'DELETED' &&
                    controller.can('restore_qr') &&
                    button(
                      'Восстановить QR',
                      () => {
                        void controller.status(document, 'RESTORE');
                      },
                      !state.online,
                    )}
                </View>
              ))}
              {state.nextAfter &&
                button(
                  'Ещё QR-коды',
                  () => {
                    void controller.more();
                  },
                  !state.online,
                )}
            </>
          )}
        </ScrollView>
      );
    }
    return { ...controller, Screen };
  },
};
export default factory;
