/** Local disposable pilot only. No original environment/config/database or external listener. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const readline = require('node:readline');
const { execFileSync } = require('node:child_process');
if (!process.env.LP2_API_PILOT_ROOT)
  throw Error('Explicit local API fork LP2_API_PILOT_ROOT required');
const { startPilot } = require(path.join(
  process.env.LP2_API_PILOT_ROOT,
  'dev/platform-pilot/pilot.cjs',
));
const { packageWebRemote } = require('../../scripts/packWebRemote.cjs');
const root = path.resolve(__dirname, '../..'),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lp2-web-host-local-')),
  out = path.join(temp, 'web'),
  runtime = require('../../host.runtime.json').web.runtime;
let pilot,
  server,
  commands,
  stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  commands?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await pilot?.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
(async () => {
  server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname,
      file = path.resolve(
        out,
        name === '/' ? 'index.html' : decodeURIComponent(name.slice(1)),
      );
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
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
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
  const files = r =>
    new Map(
      r.artifacts
        .flatMap(a => [a, ...a.assets])
        .map(a => [
          a.path,
          fs.readFileSync(path.join(root, 'build/immutable-web', a.path)),
        ]),
    );
  const initial = release('alpha', 'alpha-web1', [qr1, help]),
    update = release('alpha', 'alpha-web2', [qr2, help]),
    broken = release('alpha', 'alpha-bad3', [bad, help]),
    beta = release('beta', 'beta-web2', [qr2]);
  pilot = await startPilot({
    webOrigins: [origin],
    releases: [initial, beta].map(release => ({
      release,
      files: files(release),
    })),
  });
  const profile = path.join(temp, 'profile.json');
  fs.writeFileSync(
    profile,
    JSON.stringify({
      mode: 'local-pilot',
      central: pilot.central.url,
      allowedOrigins: [
        pilot.central.url,
        pilot.artifactServer.url,
        ...Object.values(pilot.companies).map(c => c.url),
      ],
      roots: {
        'pilot-key': Buffer.from(
          pilot.publicKey.export({ format: 'jwk' }).x,
          'base64url',
        ).toString('base64'),
      },
    }),
  );
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
      env: { ...process.env, LP2_HOST_PROFILE: profile, LP2_WEB_OUTPUT: out },
      stdio: 'pipe',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  console.log(`Local fork pilot: ${origin}`);
  console.log(
    'Fixture users: alice / carol (alpha), bob (beta); password: fixture-only',
  );
  console.log(
    'Commands: update | bad | restore | central-offline | quit. Stop: Ctrl+C. State/keys are disposable.',
  );
  commands = readline.createInterface({ input: process.stdin });
  commands.on('line', line => {
    void (async () => {
      switch (line.trim()) {
        case 'update':
          pilot.assignRelease(update, files(update));
          console.log('Alpha assigned web2');
          break;
        case 'bad':
          pilot.assignRelease(broken, files(broken));
          console.log('Alpha assigned deliberate startup-failure probe');
          break;
        case 'restore':
          pilot.assignRelease(initial, files(initial));
          console.log('Alpha assigned web1');
          break;
        case 'central-offline':
          await pilot.stopCentral();
          console.log('Local Central stopped');
          break;
        case 'quit':
          await stop();
          break;
        default:
          console.log('Unknown local command');
      }
    })().catch(() => console.error('Local command failed'));
  });
})().catch(async () => {
  console.error('Local pilot failed to start');
  await stop();
  process.exitCode = 1;
});
