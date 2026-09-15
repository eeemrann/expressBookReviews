// Start a fresh, isolated API and capture real cURL commands and responses.
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdir, mkdtemp, writeFile, unlink, rmdir } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const app = require('../index');

async function main() {
  const output = path.resolve(__dirname, '../submission');
  await mkdir(output, { recursive: true });
  const temp = await mkdtemp(path.join(os.tmpdir(), 'book-review-evidence-'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';

  async function capture(file, route, { method = 'GET', body, cookie, expected = 200, append = false } = {}) {
    const args = ['--silent', '--show-error', '--noproxy', '*', '--max-time', '10', '-X', method];
    if (body) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
    if (cookie) args.push('-b', `${cookie}.txt`, '-c', `${cookie}.txt`);
    args.push('-w', '\\nHTTP_STATUS:%{http_code}\\n', base + route);
    const child = spawn(curl, args, { cwd: temp, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.stdin.end(body ? JSON.stringify(body) : undefined);
    const [code] = await once(child, 'close');
    if (code !== 0 || !stdout.includes(`HTTP_STATUS:${expected}`)) {
      throw new Error(`cURL failed for ${route}: ${stderr}${stdout}`);
    }
    // POSIX-shell notation for replay; requests above are spawned without a shell.
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    const command = `${body ? `printf '%s' ${quote(JSON.stringify(body))} | ` : ''}curl ${args.map(quote).join(' ')}`;
    await writeFile(path.join(output, `${file}.txt`), `${append ? '\n' : ''}${command}\n\n${stdout}`, { flag: append ? 'a' : 'w' });
    console.log(`${file}: HTTP ${expected}`);
  }

  try {
    await capture('getallbooks', '/');
    await capture('getbooksbyISBN', '/isbn/1');
    await capture('getbooksbyauthor', '/author/Unknown');
    await capture('getbooksbytitle', '/title/Things%20Fall%20Apart');
    await capture('getbookreview', '/review/1');
    const alice = { username: 'alice', password: 'demo-password' };
    const bob = { username: 'bob', password: 'demo-password' };
    await capture('register', '/register', { method: 'POST', body: alice, expected: 201 });
    await capture('register', '/register', { method: 'POST', body: alice, expected: 409, append: true });
    await capture('register', '/register', { method: 'POST', body: {}, expected: 400, append: true });
    await capture('login', '/customer/login', { method: 'POST', body: alice, cookie: 'alice' });
    await capture('reviewadded', '/customer/auth/review/1?review=A%20wonderful%20book', { method: 'PUT', cookie: 'alice', expected: 201 });
    await capture('reviewadded', '/customer/auth/review/1?review=An%20excellent%20novel', { method: 'PUT', cookie: 'alice', append: true });
    await capture('reviewadded', '/register', { method: 'POST', body: bob, expected: 201, append: true });
    await capture('reviewadded', '/customer/login', { method: 'POST', body: bob, cookie: 'bob', append: true });
    await capture('reviewadded', '/customer/auth/review/1?review=Bobs%20review', { method: 'PUT', cookie: 'bob', expected: 201, append: true });
    await capture('getbookreview', '/review/1', { append: true });
    await capture('deletereview', '/customer/auth/review/1', { method: 'DELETE', cookie: 'alice' });
    await capture('deletereview', '/review/1', { append: true });
    await capture('deletereview', '/customer/auth/review/1', { method: 'DELETE', cookie: 'alice', expected: 404, append: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const file of ['alice.txt', 'bob.txt']) {
      await unlink(path.join(temp, file)).catch((err) => { if (err.code !== 'ENOENT') throw err; });
    }
    await rmdir(temp);
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
