// Verify an isolated production runtime without reading local credentials or user data.
import { mkdtemp, cp, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const staging = await mkdtemp(join(tmpdir(), 'scrapetx-production-'));
let child, log = '';
try {
  // Stage the same runtime source directories as the Docker image.
  const dockerfile = await readFile(join(root, 'Dockerfile'), 'utf8');
  const copies = [...dockerfile.matchAll(/^COPY (server|shared|fixtures\/docking) (\.\/\S+)$/gm)];
  for (const [, source, target] of copies) await cp(join(root, source), join(staging, target), { recursive: true });
  await cp(join(root, 'package.json'), join(staging, 'package.json'));
  await cp(join(root, 'dist'), join(staging, 'dist'), { recursive: true });
  await symlink(join(root, 'node_modules'), join(staging, 'node_modules'), 'dir');
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  child = spawn(process.execPath, ['server/index.js'], { cwd: staging, env: { PATH: process.env.PATH, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port) }, stdio: ['ignore','pipe','pipe'] });
  child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw Error('Production failed to start:\n' + log);
    try { if ((await fetch(base + '/api/health')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const page = await fetch(base + '/research-workflow');
  assert.equal(page.status, 200); assert.match(await page.text(), /<div id="root">/);
  for (const method of ['GET','POST']) {
    const response = await fetch(base + '/api/not-a-route', { method });
    assert.equal(response.status, 404); assert.match(response.headers.get('content-type'), /application\/json/);
  }
  assert.equal((await fetch(base + '/assets/missing.js')).status, 404);
  const logo = await fetch(base + '/source-logos/scholar.ico');
  assert.equal(logo.status, 200); assert.equal(logo.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(base + '/api/library')).status, 401);
  assert.equal((await fetch(base + '/api/health', { headers: { Origin: 'https://unrelated.example' } })).status, 403);
  const config = await (await fetch(base + '/api/config')).json();
  assert.equal(config.cloud, false, 'Production smoke must not use real cloud credentials');
  console.log('PASS: isolated production startup, deep links, provider assets, JSON API 404s, asset 404s, workspace-token and origin checks.');
} finally {
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
  await rm(staging, { recursive: true, force: true });
}
