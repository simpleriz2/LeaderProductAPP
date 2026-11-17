import {
  snapshotConfirmedSession,
  hasSessionAction,
} from '../core/confirmedSession';
const base = {
  company: 'alpha',
  user: 'alice',
  modules: ['qr', 'help'],
  confirmation: 'central-1',
};
test('legacy module-only probe snapshot grants no actions; confirmed action sets are deeply copied/frozen', () => {
  expect(
    hasSessionAction(snapshotConfirmedSession(base), 'qr', 'view_qr'),
  ).toBe(false);
  const permissions = { qr: ['view_qr'], help: [] as string[] };
  const session = snapshotConfirmedSession({ ...base, permissions });
  permissions.qr.push('delete_qr');
  expect(hasSessionAction(session, 'qr', 'view_qr')).toBe(true);
  expect(hasSessionAction(session, 'qr', 'delete_qr')).toBe(false);
  expect(hasSessionAction(session, 'help', 'read_help')).toBe(false);
  expect(hasSessionAction(session, 'unknown', 'view_qr')).toBe(false);
  expect(Object.isFrozen(session.permissions)).toBe(true);
  expect(Object.isFrozen(session.permissions!.qr)).toBe(true);
});
test.each([
  {},
  { qr: ['view_qr'] },
  { qr: ['view_qr'], help: [], other: [] },
  { qr: ['view_qr', 'view_qr'], help: [] },
  { qr: ['*'], help: [] },
  { qr: 'view_qr', help: [] },
  { qr: Array(129).fill('view_qr'), help: [] },
  null,
])('malformed/incomplete/foreign action map %j rejects', permissions => {
  expect(() => snapshotConfirmedSession({ ...base, permissions })).toThrow(
    'Invalid action',
  );
});
