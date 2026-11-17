const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
if (!process.env.LP2_API_PILOT_ROOT)
  throw Error('Explicit local API fork LP2_API_PILOT_ROOT required');
const { startPilot } = require(path.join(
  process.env.LP2_API_PILOT_ROOT,
  'dev/platform-pilot/pilot.cjs',
));
const { packageWebRemote } = require('../../scripts/packWebRemote.cjs');
const { readLocalWebProfile } = require('../../scripts/localWebProfile.cjs');
const root = path.resolve(__dirname, '../..'),
  runtime = require('../../host.runtime.json').web.runtime;
const qr1 = packageWebRemote('qr', '1.0.0'),
  help = packageWebRemote('help', '1.0.0'),
  qr2 = packageWebRemote('qr', '2.0.0'),
  bad = packageWebRemote('qr', '3.0.0', { failStartup: true });
const release = (company, id, artifacts) => ({
  format: 2,
  platform: 'web',
  company,
  id,
  minHost: 1,
  runtime,
  api: '1.0.0',
  artifacts,
});
function assignment(release) {
  return {
    release,
    files: new Map(
      release.artifacts
        .flatMap(a => [a, ...a.assets])
        .map(file => [
          file.path,
          fs.readFileSync(path.join(root, 'build/immutable-web', file.path)),
        ]),
    ),
  };
}
const alpha1 = assignment(release('alpha', 'alpha-web1', [qr1, help])),
  alpha2 = assignment(release('alpha', 'alpha-web2', [qr2, help])),
  alphaBad = assignment(release('alpha', 'alpha-bad3', [bad, help])),
  beta = assignment(release('beta', 'beta-web2', [qr2]));
async function fixture(t, { useProfile = true } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lp2-host-ui-')),
    out = path.join(temp, 'web'),
    profileDir = path.join(temp, 'browser');
  let context, pilot;
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname,
      relative =
        name === '/' ? 'index.html' : decodeURIComponent(name.slice(1)),
      file = path.resolve(out, relative);
    if (
      !file.startsWith(out + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('cache-control', 'no-store');
    res.setHeader(
      'content-type',
      file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.js')
        ? 'text/javascript'
        : 'application/octet-stream',
    );
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await context?.close().catch(() => {});
    await pilot?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  pilot = await startPilot({ releases: [alpha1, beta], webOrigins: [origin] });
  const origins = [
    origin,
    pilot.central.url,
    ...Object.values(pilot.companies).map(c => c.url),
    pilot.artifactServer.url,
  ];
  const profile = {
    mode: 'local-pilot',
    central: pilot.central.url,
    allowedOrigins: origins.slice(1),
    roots: {
      'pilot-key': Buffer.from(
        pilot.publicKey.export({ format: 'jwk' }).x,
        'base64url',
      ).toString('base64'),
    },
  };
  const profileFile = path.join(temp, 'profile.json');
  fs.writeFileSync(profileFile, JSON.stringify(profile));
  assert.deepEqual(readLocalWebProfile(profileFile), profile);
  const buildEnv = { ...process.env, LP2_WEB_OUTPUT: out };
  if (useProfile) buildEnv.LP2_HOST_PROFILE = profileFile;
  else delete buildEnv.LP2_HOST_PROFILE;
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/@rspack/cli/bin/rspack.js'),
      'build',
      '--config',
      'rspack.web.cjs',
    ],
    {
      cwd: root,
      env: buildEnv,
      stdio: 'pipe',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const platformRequests = [];
  async function open() {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      args: ['--no-sandbox'],
    });
    await context.route('**/*', route =>
      origins.includes(new URL(route.request().url()).origin)
        ? route.continue()
        : route.abort('blockedbyclient'),
    );
    context.on('request', request => {
      if (origins.slice(1).includes(new URL(request.url()).origin))
        platformRequests.push(request.url());
    });
    const page = await context.newPage();
    await page.goto(origin);
    await page
      .getByRole('heading', { name: 'Leader Product 2.0 Fork' })
      .waitFor();
    return page;
  }
  return {
    pilot,
    platformRequests,
    open,
    close: () => context.close(),
    async fresh() {
      await context.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
      return open();
    },
  };
}
async function login(page, user) {
  await page.getByLabel('Пользователь', { exact: true }).fill(user);
  await page.getByLabel('Пароль', { exact: true }).fill('fixture-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('navigation', { name: 'Модули' }).waitFor();
}
async function show(page, module, version) {
  await page
    .getByRole('button', { name: module === 'qr' ? 'QR' : 'Help', exact: true })
    .click();
  await page
    .getByText(`${module === 'qr' ? 'QR' : 'Help'} delivery probe ${version}`, {
      exact: true,
    })
    .waitFor();
}
async function logout(page) {
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await page
    .getByRole('button', { name: 'Перезапустить', exact: true })
    .click();
  await page.getByLabel('Пользователь', { exact: true }).waitFor();
}
async function offline(page, user) {
  await page
    .getByRole('button', { name: `Продолжить без сети: ${user}`, exact: true })
    .click();
  await page.getByRole('navigation', { name: 'Модули' }).waitFor();
}
test('actual host UI: signed startup, two remotes, one-remote update, failed React startup rollback, account switch and offline restart', async t => {
  const f = await fixture(t);
  let page = await f.open();
  await login(page, 'alice');
  await show(page, 'qr', '1.0.0');
  await show(page, 'help', '1.0.0');
  await page.getByText('Комплект проверен', { exact: true }).waitFor();
  const before = f.pilot.introspections();
  f.pilot.assignRelease(alpha2.release, alpha2.files);
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Перезапустить', exact: true })
    .waitFor();
  assert.equal(f.pilot.introspections() - before, 1);
  await page
    .getByRole('button', { name: 'Перезапустить', exact: true })
    .click();
  await offline(page, 'alice');
  await show(page, 'qr', '2.0.0');
  await show(page, 'help', '1.0.0');
  await page.getByText('Комплект проверен', { exact: true }).waitFor();
  await logout(page);
  f.pilot.assignRelease(alphaBad.release, alphaBad.files);
  await login(page, 'alice');
  await page.getByRole('button', { name: 'QR', exact: true }).click();
  await page
    .getByRole('button', { name: 'Восстановить рабочий комплект', exact: true })
    .waitFor();
  assert.equal(
    await page.getByText('Комплект проверен', { exact: true }).count(),
    0,
  );
  await page
    .getByRole('button', { name: 'Восстановить рабочий комплект', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Перезапустить', exact: true })
    .click();
  await offline(page, 'alice');
  await show(page, 'qr', '2.0.0');
  await show(page, 'help', '1.0.0');
  await logout(page);
  f.pilot.assignRelease(alpha2.release, alpha2.files);
  await login(page, 'carol');
  assert.equal(
    await page.getByRole('button', { name: 'Help', exact: true }).count(),
    0,
  );
  await show(page, 'qr', '2.0.0');
  await logout(page);
  await login(page, 'bob');
  await show(page, 'qr', '2.0.0');
  assert.equal(
    await page.getByRole('button', { name: 'Help', exact: true }).count(),
    0,
  );
  await logout(page);
  await login(page, 'alice');
  await show(page, 'qr', '2.0.0');
  await show(page, 'help', '1.0.0');
  await page.getByText('Комплект проверен', { exact: true }).waitFor();
  await f.pilot.stopCentral();
  await f.close();
  page = await f.open();
  await offline(page, 'alice');
  await show(page, 'qr', '2.0.0');
  await show(page, 'help', '1.0.0');
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await page
    .getByText('Для проверки обновлений войдите при подключении к сети', {
      exact: true,
    })
    .waitFor();
  page = await f.fresh();
  await page.getByLabel('Пользователь', { exact: true }).fill('alice');
  await page.getByLabel('Пароль', { exact: true }).fill('fixture-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page
    .getByText('Не удалось подготовить рабочий комплект. Данные сохранены', {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByRole('navigation', { name: 'Модули' }).count(),
    0,
  );
  assert.equal(
    await page.getByRole('button', { name: /Продолжить без сети/ }).count(),
    0,
  );
});
test('host keeps working screens closed during download and rejects corrupted bytes before execution/data initialization', async t => {
  const f = await fixture(t);
  let page = await f.open(),
    releaseDownload;
  const wait = new Promise(resolve => {
    releaseDownload = resolve;
  });
  let hit;
  const seen = new Promise(resolve => {
    hit = resolve;
  });
  await page
    .context()
    .route(`${f.pilot.artifactServer.url}/artifacts/*`, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      hit();
      await wait;
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: Buffer.from('corrupt executable'),
      });
    });
  await page.getByLabel('Пользователь', { exact: true }).fill('alice');
  await page.getByLabel('Пароль', { exact: true }).fill('fixture-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await seen;
  assert.equal(
    await page.getByRole('navigation', { name: 'Модули' }).count(),
    0,
  );
  assert.equal(
    await page.evaluate(() => typeof globalThis.lp2_qr),
    'undefined',
  );
  releaseDownload();
  await page
    .getByText('Не удалось подготовить рабочий комплект. Данные сохранены', {
      exact: true,
    })
    .waitFor();
  const evidence = await page.evaluate(async () => ({
    global: typeof globalThis.lp2_qr,
    domain: (
      await indexedDB.databases()
    ).some(db => db.name === 'lp2-domain-data-v1'),
  }));
  assert.deepEqual(evidence, { global: 'undefined', domain: false });
  await f.close();
  page = await f.open();
  await page
    .getByRole('button', { name: 'Продолжить без сети: alice', exact: true })
    .click();
  await page
    .getByText('Не удалось подготовить рабочий комплект. Данные сохранены', {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByRole('navigation', { name: 'Модули' }).count(),
    0,
  );
});
test('build profile refuses production origins, embedded private fields/keys and symlink input; absent profile has no endpoints', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lp2-profile-check-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'profile.json'),
    good = {
      mode: 'local-pilot',
      central: 'http://127.0.0.1:3001',
      allowedOrigins: ['http://127.0.0.1:3001'],
      roots: { root: Buffer.alloc(32).toString('base64') },
    };
  assert.equal(readLocalWebProfile(), null);
  for (const value of [
    { ...good, central: 'https://production.invalid' },
    { ...good, privateKey: 'fixture-private-value' },
    { ...good, roots: { root: '-----BEGIN PRIVATE KEY-----' } },
    { ...good, allowedOrigins: ['http://127.0.0.1:3001/'] },
  ]) {
    fs.writeFileSync(file, JSON.stringify(value));
    assert.throws(() => readLocalWebProfile(file));
  }
  fs.writeFileSync(file, JSON.stringify(good));
  const link = path.join(temp, 'link.json');
  fs.symlinkSync(file, link);
  assert.throws(() => readLocalWebProfile(link));
});
test('confirmed Central denial closes working UI and invalidates persisted offline proof without deleting artifact cache', async t => {
  const f = await fixture(t),
    page = await f.open();
  await login(page, 'alice');
  await show(page, 'qr', '1.0.0');
  f.pilot.revoke('alice');
  await page
    .getByRole('button', { name: 'Проверить обновления', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Перезапустить', exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole('navigation', { name: 'Модули' }).count(),
    0,
  );
  await page
    .getByRole('button', { name: 'Перезапустить', exact: true })
    .click();
  await page.getByLabel('Пользователь', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: /Продолжить без сети/ }).count(),
    0,
  );
  const blobs = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('lp2-release-bootstrap-v2', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction('blobs', 'readonly'),
            count = tx.objectStore('blobs').count();
          count.onsuccess = () => resolve(count.result);
          tx.oncomplete = () => db.close();
        };
      }),
  );
  assert.ok(blobs > 0);
});
test('revocation during protected download is reconfirmed at Central and cannot reopen stale offline rights', async t => {
  const f = await fixture(t),
    page = await f.open();
  let release;
  const hold = new Promise(resolve => {
    release = resolve;
  });
  let reached;
  const seen = new Promise(resolve => {
    reached = resolve;
  });
  await page
    .context()
    .route(`${f.pilot.artifactServer.url}/artifacts/*`, async route => {
      if (route.request().method() !== 'GET') return route.continue();
      reached();
      await hold;
      const response = await route.fetch();
      await route.fulfill({ response });
    });
  await page.getByLabel('Пользователь', { exact: true }).fill('alice');
  await page.getByLabel('Пароль', { exact: true }).fill('fixture-only');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await seen;
  f.pilot.revoke('alice');
  release();
  await page
    .getByRole('button', { name: 'Перезапустить', exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => typeof globalThis.lp2_qr),
    'undefined',
  );
  await page
    .getByRole('button', { name: 'Перезапустить', exact: true })
    .click();
  await page.getByLabel('Пользователь', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: /Продолжить без сети/ }).count(),
    0,
  );
});

test('unconfigured default Web host has no login/module UI and makes no platform requests', async t => {
  const f = await fixture(t, { useProfile: false }),
    page = await f.open();
  await page.getByText('Среда ещё не настроена', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Войти', exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole('navigation', { name: 'Модули' }).count(),
    0,
  );
  assert.equal(f.pilot.introspections(), 0);
  assert.deepEqual(f.platformRequests, []);
});
