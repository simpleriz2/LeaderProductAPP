const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const { startBusinessFixture } = require('./fixture.cjs');
test(
  'actual verified QR factory UI, Company PG CRUD, LKG/current drafts, two subjects and saved narrowed offline rights',
  { timeout: 90000 },
  async t => {
    const fixture = await startBusinessFixture();
    t.after(() => fixture.close());
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox'],
    });
    t.after(() => browser.close());
    const context = await browser.newContext();
    t.after(() => context.close());
    await context.route('**/*', route => {
      let allowed = false;
      try {
        allowed = fixture.allowed.includes(
          new URL(route.request().url()).origin,
        );
      } catch {}
      return allowed ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const login = async user => {
      await page.getByLabel('Пользователь', { exact: true }).fill(user);
      await page.getByLabel('Пароль', { exact: true }).fill('fixture-only');
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      await expect(
        page.getByRole('navigation', { name: 'Модули' }),
      ).toBeVisible();
    };
    const qr = () =>
        page
          .getByRole('navigation', { name: 'Модули' })
          .getByRole('button', { name: 'QR', exact: true }),
      help = () =>
        page
          .getByRole('navigation', { name: 'Модули' })
          .getByRole('button', { name: 'Help', exact: true });
    await page.goto(fixture.origin);
    await login('alice');
    assert.equal(fixture.qrHits(), 0, 'preloading must not start Company sync');
    await qr().click();
    await expect(
      page.getByRole('heading', { name: 'QR-коды', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Новый текстовый QR', exact: true })
      .click();
    await page
      .getByLabel('Наименование QR', { exact: true })
      .fill('Offline draft');
    await page
      .getByLabel('Текст QR', { exact: true })
      .fill('Неотправленный текст');
    await page
      .getByRole('button', { name: 'Сохранить черновик', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Открыть черновик Offline draft',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Новый текстовый QR', exact: true })
      .click();
    await page
      .getByLabel('Наименование QR', { exact: true })
      .fill('Created by Alice');
    await page
      .getByLabel('Текст QR', { exact: true })
      .fill('Single server record');
    await page.getByRole('button', { name: 'Создать QR', exact: true }).click();
    await expect(
      page.getByText('Создание подтверждено', { exact: true }),
    ).toBeVisible();
    assert.equal(await fixture.count('alpha', 'alice'), 1);
    await page.getByRole('button', { name: 'Удалить QR', exact: true }).click();
    await page
      .getByRole('button', { name: 'Восстановить QR', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Приостановить', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Возобновить', exact: true })
      .click();
    await help().click();
    await expect(
      page.getByText('Help delivery probe 1.0.0', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Комплект проверен', { exact: true }),
    ).toBeVisible();
    fixture.badFactory();
    await page
      .getByRole('button', { name: 'Проверить обновления', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Перезапустить', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Продолжить без сети: alice', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Восстановить рабочий комплект',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Модули' })).toHaveCount(
      0,
    );
    await page
      .getByRole('button', {
        name: 'Восстановить рабочий комплект',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Перезапустить', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Продолжить без сети: alice', exact: true })
      .click();
    await qr().click();
    await page
      .getByRole('button', {
        name: 'Открыть черновик Offline draft',
        exact: true,
      })
      .click();
    await expect(page.getByLabel('Текст QR', { exact: true })).toHaveValue(
      'Неотправленный текст',
    );
    fixture.restoreAssignment();
    const logout = async () => {
      await page.getByRole('button', { name: 'Выйти', exact: true }).click();
      await page
        .getByRole('button', { name: 'Перезапустить', exact: true })
        .click();
    };
    await logout();
    await login('bob');
    await qr().click();
    await expect(
      page.getByRole('button', { name: 'Новый текстовый QR', exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole('button', {
        name: 'Открыть черновик Offline draft',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Created by Alice', { exact: true }),
    ).toHaveCount(0);
    assert.equal(await fixture.count('beta', 'bob'), 0);
    await logout();
    await login('alice');
    await qr().click();
    await page
      .getByRole('button', {
        name: 'Открыть черновик Offline draft',
        exact: true,
      })
      .click();
    await expect(page.getByLabel('Текст QR', { exact: true })).toHaveValue(
      'Неотправленный текст',
    );
    fixture.pilot.setPermissions('alice', 'qr', ['view_qr']);
    await page
      .getByRole('button', { name: 'Новый текстовый QR', exact: true })
      .click();
    await page
      .getByLabel('Наименование QR', { exact: true })
      .fill('Denied pending');
    await page.getByLabel('Текст QR', { exact: true }).fill('Keep on denial');
    await page.getByRole('button', { name: 'Создать QR', exact: true }).click();
    await page
      .getByRole('button', { name: 'Перезапустить', exact: true })
      .click();
    assert.equal(await fixture.count('alpha', 'alice'), 1);
    await fixture.pilot.stopCentral();
    await page
      .getByRole('button', { name: 'Продолжить без сети: alice', exact: true })
      .click();
    const before = fixture.qrHits();
    await qr().click();
    await expect(
      page.getByRole('button', {
        name: 'Открыть черновик Offline draft',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Открыть черновик Denied pending',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Новый текстовый QR', exact: true }),
    ).toHaveCount(0);
    assert.equal(
      fixture.qrHits(),
      before,
      'offline restoration must not call Company API',
    );
  },
);
