const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  http = require('node:http');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
if (!process.env.LP2_API_PILOT_ROOT)
  throw Error('Explicit API fork path required');
const apiRoot = path.resolve(process.env.LP2_API_PILOT_ROOT);
require(path.join(apiRoot, 'node_modules/ts-node')).register({
  project: path.join(apiRoot, 'tsconfig.json'),
  transpileOnly: true,
});
const { Pool } = require(path.join(apiRoot, 'node_modules/pg'));
const { startPilot } = require(path.join(
  apiRoot,
  'dev/platform-pilot/pilot.cjs',
));
const { createCompanyQrRepository } = require(path.join(
  apiRoot,
  'src/modules/qr/company/repository.ts',
));
const { createCompanyQrHttpHandler } = require(path.join(
  apiRoot,
  'src/modules/qr/company/http.ts',
));
const { packageWebRemote } = require('../../scripts/packWebRemote.cjs');
const root = path.resolve(__dirname, '../..'),
  runtime = require('../../host.runtime.json').web.runtime;
async function startBusinessFixture() {
  const url = new URL(
    process.env.LP2_COMPANY_TEST_DATABASE_URL || 'http://invalid',
  );
  if (
    process.env.NODE_ENV !== 'test' ||
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '54329' ||
    url.username !== 'lp2_fixture' ||
    url.pathname !== '/lp2_realtime_fixture'
  )
    throw Error('Explicit owned PostgreSQL fixture required');
  const pool = new Pool({ connectionString: url.toString(), max: 2 }),
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lp2-web-business-')),
    out = path.join(temp, 'public'),
    subjects = [];
  let pilot,
    server,
    qrHits = 0,
    closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    try {
      if (server?.listening)
        await new Promise(resolve => server.close(resolve));
      await pilot?.close();
      for (const [company, user] of subjects) {
        const rows = await pool.query(
          'SELECT local_user FROM lp2_company.subjects WHERE company=$1 AND central_user=$2',
          [company, user],
        );
        for (const row of rows.rows) {
          await pool.query(
            'DELETE FROM lp2_company.qr_create_receipts WHERE company=$1 AND owner=$2',
            [company, row.local_user],
          );
          await pool.query(
            'DELETE FROM lp2_company.qr_documents WHERE company=$1 AND owner=$2',
            [company, row.local_user],
          );
        }
        await pool.query(
          'DELETE FROM lp2_company.subjects WHERE company=$1 AND central_user=$2',
          [company, user],
        );
      }
    } finally {
      await pool.end();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  try {
    const marker = await pool.query(
      "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
    );
    if (marker.rows[0]?.marker !== 'LP-MS-F isolated realtime fixture')
      throw Error('Owned PostgreSQL marker missing');
    for (const file of ['schema.sql', '002_create_receipts.sql'])
      await pool.query(
        fs.readFileSync(
          path.join(apiRoot, 'src/modules/qr/company', file),
          'utf8',
        ),
      );
    for (const [company, user] of [
      ['alpha', 'alice'],
      ['alpha', 'carol'],
      ['beta', 'bob'],
    ]) {
      const existing = await pool.query(
        'SELECT 1 FROM lp2_company.subjects WHERE company=$1 AND central_user=$2',
        [company, user],
      );
      if (existing.rowCount)
        throw Error('Fixture subject occupied; no overwrite');
      await pool.query(
        'INSERT INTO lp2_company.subjects(company,central_user,local_user) VALUES($1,$2,$3)',
        [company, user, randomUUID()],
      );
      subjects.push([company, user]);
    }
    server = http.createServer((req, res) => {
      const name = new URL(req.url, 'http://127.0.0.1').pathname;
      let file;
      try {
        file = path.resolve(
          out,
          name === '/' ? 'index.html' : decodeURIComponent(name.slice(1)),
        );
      } catch {
        res.writeHead(400);
        return res.end();
      }
      if (
        !file.startsWith(out + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      ) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, {
        'content-type': file.endsWith('.html')
          ? 'text/html'
          : 'text/javascript',
        'cache-control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const qr1 = packageWebRemote('qr', '1.0.0', { profile: 'business' }),
      qr2 = packageWebRemote('qr', '2.0.0', { profile: 'business' }),
      help = packageWebRemote('help', '1.0.0');
    const release = (company, id, artifacts) => ({
      format: 2,
      platform: 'web',
      company,
      id,
      minHost: 5,
      runtime,
      api: '1.0.0',
      artifacts,
    });
    const assignment = release => ({
      release,
      files: new Map(
        release.artifacts
          .flatMap(a => [a, ...a.assets])
          .map(file => [
            file.path,
            fs.readFileSync(path.join(root, 'build/immutable-web', file.path)),
          ]),
      ),
    });
    const alpha = assignment(
        release('alpha', 'alpha-qr-business-1', [qr1, help]),
      ),
      beta = assignment(release('beta', 'beta-qr-business-2', [qr2]));
    pilot = await startPilot({
      webOrigins: [origin],
      releases: [alpha, beta],
      companyHandlerFactory: (company, authorizeOnline, supportedApis) => {
        const handler = createCompanyQrHttpHandler(
          createCompanyQrRepository(pool, company),
          { company, authorizeOnline, supportedApis },
        );
        return (req, res) => {
          if (/^\/qr(?:\/|\?|$)/.test(req.url)) qrHits++;
          return handler(req, res);
        };
      },
    });
    const allowed = [
        origin,
        pilot.central.url,
        pilot.artifactServer.url,
        ...Object.values(pilot.companies).map(c => c.url),
      ],
      profile = path.join(temp, 'public-profile.json');
    fs.writeFileSync(
      profile,
      JSON.stringify({
        mode: 'local-pilot',
        central: pilot.central.url,
        allowedOrigins: allowed,
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
    return {
      origin,
      allowed,
      pilot,
      qrHits: () => qrHits,
      close,
      count: async (company, user) =>
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM lp2_company.qr_documents d JOIN lp2_company.subjects s ON s.company=d.company AND s.local_user=d.owner WHERE s.company=$1 AND s.central_user=$2',
            [company, user],
          )
        ).rows[0].count,
      badFactory() {
        const bad = assignment(
          release('alpha', 'alpha-bad-factory', [
            { ...qr1, version: '9.0.0' },
            help,
          ]),
        );
        pilot.assignRelease(bad.release, bad.files);
      },
      restoreAssignment() {
        pilot.assignRelease(alpha.release, alpha.files);
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
module.exports = { startBusinessFixture };
