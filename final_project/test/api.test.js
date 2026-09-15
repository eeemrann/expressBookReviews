const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const app = require('../index');
const { createBookClient } = require('../router/general');
const { users } = require('../router/auth_users');

test('book review API over HTTP', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const api = axios.create({ baseURL, proxy: false, validateStatus: () => true });
  const credentials = (username) => ({ username, password: 'test-password' });
  async function login(username) {
    const response = await api.post('/customer/login', credentials(username));
    assert.equal(response.status, 200);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /SameSite=Strict/);
    return { headers: { Cookie: response.headers['set-cookie'][0].split(';')[0] } };
  }

  await t.test('public catalog, ISBN, author, title and reviews', async () => {
    const all = await api.get('/');
    assert.equal(all.status, 200);
    assert.equal(Object.keys(all.data).length, 10);
    assert.equal((await api.get('/isbn/1')).data.title, 'Things Fall Apart');
    assert.deepEqual(Object.keys((await api.get('/author/unknown')).data), ['4', '5', '6', '7']);
    assert.equal((await api.get('/title/Things%20Fall%20Apart')).data['1'].author, 'Chinua Achebe');
    assert.deepEqual((await api.get('/review/1')).data, {});
  });

  await t.test('missing books and inherited object keys return 404', async () => {
    for (const path of ['/isbn/999', '/isbn/__proto__', '/review/constructor', '/author/nobody', '/title/missing']) {
      assert.equal((await api.get(path)).status, 404, path);
    }
  });

  await t.test('registration validates inputs and rejects duplicates', async () => {
    for (const data of [{}, { username: 'alice' }, { username: [], password: 'p' }, { username: 'alice', password: ' ' }]) {
      assert.equal((await api.post('/register', data)).status, 400);
    }
    assert.equal((await api.post('/register', credentials('alice'))).status, 201);
    assert.equal((await api.post('/register', credentials('alice'))).status, 409);
    const record = users.find((user) => user.username === 'alice');
    assert.equal(record.password, undefined);
    assert.notEqual(record.passwordHash, 'test-password');
    assert.equal((await api.post('/register', credentials('bob'))).status, 201);
  });

  await t.test('simultaneous registrations cannot create duplicate users', async () => {
    const responses = await Promise.all([api.post('/register', credentials('racer')), api.post('/register', credentials('racer'))]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  });

  await t.test('invalid login and unauthenticated review writes are rejected', async () => {
    assert.equal((await api.post('/customer/login', {})).status, 400);
    assert.equal((await api.post('/customer/login', credentials('missing'))).status, 401);
    assert.equal((await api.post('/customer/login', { username: 'alice', password: 'wrong' })).status, 401);
    assert.equal((await api.put('/customer/auth/review/1?review=bad')).status, 401);
    assert.equal((await api.delete('/customer/auth/review/1')).status, 401);
  });

  const alice = await login('alice');
  const bob = await login('bob');
  await t.test('login regenerates the session and invalidates the previous cookie', async () => {
    const response = await api.post('/customer/login', credentials('alice'), alice);
    assert.equal(response.status, 200);
    const oldCookie = alice.headers.Cookie;
    alice.headers.Cookie = response.headers['set-cookie'][0].split(';')[0];
    assert.notEqual(alice.headers.Cookie, oldCookie);
    assert.equal((await api.put('/customer/auth/review/1?review=x', null, { headers: { Cookie: oldCookie } })).status, 401);
  });

  await t.test('review input validation and missing ISBN', async () => {
    for (const query of ['', '?review=%20', '?review=a&review=b', '?review[x]=a']) {
      assert.equal((await api.put(`/customer/auth/review/1${query}`, null, alice)).status, 400);
    }
    assert.equal((await api.put('/customer/auth/review/999?review=x', null, alice)).status, 404);
    assert.equal((await api.delete('/customer/auth/review/__proto__', alice)).status, 404);
  });

  await t.test('one user updates their review without replacing another user', async () => {
    assert.equal((await api.put('/customer/auth/review/1?review=Alice%20first', null, alice)).status, 201);
    assert.equal((await api.put('/customer/auth/review/1?review=Bob%20review', null, bob)).status, 201);
    const updated = await api.put('/customer/auth/review/1?review=Alice%20updated&username=bob', null, alice);
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.data.reviews, { alice: 'Alice updated', bob: 'Bob review' });
  });

  await t.test('deletion only removes the signed-in user review', async () => {
    const deleted = await api.delete('/customer/auth/review/1?username=bob', alice);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.data.reviews, { bob: 'Bob review' });
    assert.equal((await api.delete('/customer/auth/review/1', alice)).status, 404);
    assert.deepEqual((await api.get('/review/1')).data, { bob: 'Bob review' });
  });

  await t.test('a forged session cookie cannot authorize changes', async () => {
    const forged = { headers: { Cookie: `${alice.headers.Cookie}tampered` } };
    assert.equal((await api.put('/customer/auth/review/1?review=forged', null, forged)).status, 401);
  });

  await t.test('expired and incorrectly signed session JWTs are rejected', async (subtest) => {
    const sign = jwt.sign;
    for (const invalidSignature of [false, true]) {
      subtest.mock.method(jwt, 'sign', (payload, secret, options) =>
        sign(payload, invalidSignature ? 'incorrect-key' : secret, { ...options, expiresIn: invalidSignature ? '1h' : -1 }));
      const session = await login('alice');
      subtest.mock.restoreAll();
      assert.equal((await api.put('/customer/auth/review/1?review=invalid', null, session)).status, 401);
    }
  });

  await t.test('special usernames remain ordinary review properties', async () => {
    assert.equal((await api.post('/register', credentials('__proto__'))).status, 201);
    const special = await login('__proto__');
    const response = await api.put('/customer/auth/review/2?review=Safe', null, special);
    assert.equal(response.status, 201);
    assert.equal(Object.hasOwn(response.data.reviews, '__proto__'), true);
    assert.equal(response.data.reviews.__proto__, 'Safe');
    assert.equal((await api.delete('/customer/auth/review/2', special)).status, 200);
  });

  await t.test('all four Axios functions make real HTTP calls and propagate errors', async () => {
    const client = createBookClient(baseURL);
    assert.equal(Object.keys(await client.getAllBooks()).length, 10);
    assert.equal((await client.getBookByISBN('1')).title, 'Things Fall Apart');
    assert.equal(Object.keys(await client.getBooksByAuthor('Unknown')).length, 4);
    assert.equal((await client.getBooksByTitle("Njál's Saga"))['7'].author, 'Unknown');
    for (const request of [() => client.getBookByISBN('missing'), () => client.getBooksByAuthor('missing'), () => client.getBooksByTitle('missing')]) {
      await assert.rejects(request, (err) => err.response.status === 404);
    }
  });

  await t.test('malformed JSON and unknown endpoints return JSON errors', async () => {
    assert.equal((await api.post('/register', '{', { headers: { 'Content-Type': 'application/json' } })).status, 400);
    const missing = await api.get('/missing');
    assert.equal(missing.status, 404);
    assert.match(missing.headers['content-type'], /application\/json/);
  });
});
