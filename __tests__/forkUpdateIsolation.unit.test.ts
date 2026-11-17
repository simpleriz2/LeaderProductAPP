const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('axios', () => ({ get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) }));
jest.mock('@/utils/config', () => ({ API_BASE_URL: 'http://127.0.0.1:3000' }));
import { checkForUpdate, logUpdateEvent } from '@/utils/updateService';
import { LEGACY_UPDATES_ENABLED } from '@/src/shared/forkPolicy';

test('fork refuses legacy APK checks even forced, and sends no update telemetry', async () => {
  expect(LEGACY_UPDATES_ENABLED).toBe(false);
  const result = await checkForUpdate({ platform: 'android', versionCode: 1, force: true });
  expect(result).toEqual({ ok: false, message: 'Legacy updates disabled in fork' });
  await logUpdateEvent({ eventType: 'CHECK', platform: 'android', versionCode: 1 });
  expect(mockGet).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
});
