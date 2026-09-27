'use strict';

/**
 * Проверка драйвера kv — единственного постоянного хранилища на Vercel.
 *
 * Зачем отдельный файл. На Vercel файловая система доступна только для чтения,
 * а /tmp эфемерный: заявки живут внутри одного инстанса и исчезают при
 * следующем деплое. Единственный путь к постоянному хранилищу — Redis по REST
 * (Upstash / Vercel KV). При этом до продакшена этот драйвер не был проверен
 * ни одним тестом: остальные тесты работают на файле. Ошибка в нём означала бы
 * потерю заявок на живом сайте, поэтому проверяем его всерьёз.
 *
 * Что именно проверяется:
 *   1) два независимых инстанса приложения смотрят в одно хранилище;
 *   2) заявка, созданная на первом, читается со второго — это и есть «данные
 *      пережили перезапуск инстанса», которого нет у файлового драйвера;
 *   3) драйвер действительно берёт распределённую блокировку перед записью:
 *      без неё два инстанса могли бы продать один слот дважды;
 *   4) приложение больше не считает себя демо-стендом.
 *
 * Redis поднимается свой, на 127.0.0.1: повторяет REST-протокол Upstash
 * (POST с массивом команды, ответ { result } | { error }) и проверяет токен.
 * Внешние сервисы и интернет не нужны.
 *
 * Запуск: npm run test:kv  (входит в npm test)
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOKEN = 'kv-test-token';
const TIMEZONE = 'Asia/Almaty';

/* ── Заглушка Redis по REST-протоколу Upstash ───────────────────────────── */

function createRedisStub() {
  const store = new Map();
  const commands = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const reply = (payload, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        reply({ error: 'unauthorized' }, 401);
        return;
      }

      let args;
      try {
        args = JSON.parse(body);
      } catch {
        reply({ error: 'bad request' }, 400);
        return;
      }

      const [command, ...rest] = args;
      commands.push(args);

      if (command === 'GET') {
        reply({ result: store.has(rest[0]) ? store.get(rest[0]) : null });
        return;
      }

      if (command === 'SET') {
        const [key, value, ...options] = rest;
        if (options.includes('NX') && store.has(key)) {
          reply({ result: null });
          return;
        }
        store.set(key, value);
        reply({ result: 'OK' });
        return;
      }

      if (command === 'DEL') {
        reply({ result: store.delete(rest[0]) ? 1 : 0 });
        return;
      }

      if (command === 'EVAL') {
        // Единственный скрипт в проекте: «удали ключ, если значение наше».
        const key = rest[2];
        const expected = rest[3];
        if (store.get(key) === expected) {
          store.delete(key);
          reply({ result: 1 });
          return;
        }
        reply({ result: 0 });
        return;
      }

      reply({ error: `команда ${command} не поддержана заглушкой` });
    });
  });

  return { server, store, commands };
}

/* ── Вспомогательное ────────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function freePort() {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Запускает реальный server.js как отдельный процесс — как это делает Vercel. */
function startInstance(port, kvUrl, dataDir) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      // VERCEL намеренно не выставлен: на платформе сервер не открывает порт
      // сам (его назначает Vercel), а нам нужен обычный listen на localhost.
      // Драйвер kv включается переменной STORE_DRIVER — как в продакшене,
      // где постоянное хранилище задаётся именно ей и адресом Redis.
      VERCEL: '',
      PORT: String(port),
      HOST: '127.0.0.1',
      SITE_URL: `http://127.0.0.1:${port}`,
      SITE_TIMEZONE: TIMEZONE,
      STORE_DRIVER: 'kv',
      KV_REST_API_URL: kvUrl,
      KV_REST_API_TOKEN: TOKEN,
      MOCK_MODE: 'false',
      ADMIN_PASSWORD: 'kv-test-password',
      ADMIN_TOKEN: '',
      ADMIN_SESSION_SECRET: 'kv-test-session-secret',
      DATA_DIR: dataDir,
      QUIET: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const log = [];
  child.stdout.on('data', (chunk) => log.push(String(chunk)));
  child.stderr.on('data', (chunk) => log.push(String(chunk)));

  return { child, log };
}

async function waitForHealth(base, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(base + '/api/health');
      if (response.ok) return await response.json();
    } catch {
      /* инстанс ещё поднимается */
    }
    if (Date.now() > deadline) throw new Error('инстанс не ответил за ' + timeoutMs + ' мс');
    await sleep(150);
  }
}

async function request(base, pathname, options) {
  const response = await fetch(base + pathname, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* не JSON */
  }
  return { status: response.status, text, json };
}

/* ── Сценарий ───────────────────────────────────────────────────────────── */

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}

async function run() {
  console.log('\nFANTOM — постоянное хранилище (драйвер kv)\n');

  const stub = createRedisStub();
  const stubPort = await listen(stub.server);
  const kvUrl = `http://127.0.0.1:${stubPort}`;

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantom-kv-'));
  const ports = [await freePort(), await freePort()];
  const instances = [];

  let reference = null;
  const phone = '+7 700 123 45 67';
  const date = require('../src/lib/time').addDays(
    require('../src/lib/time').todayIn(TIMEZONE),
    7
  );

  try {
    /* Инстанс A поднимается первым: он создаёт базу в пустом Redis. */
    const a = startInstance(ports[0], kvUrl, dataDir);
    instances.push(a);
    const baseA = `http://127.0.0.1:${ports[0]}`;
    const healthA = await waitForHealth(baseA);

    await check('Инстанс с KV больше не считает себя демо-стендом', () => {
      assert.strictEqual(healthA.storage.driver, 'kv', `драйвер: ${healthA.storage.driver}`);
      assert.strictEqual(healthA.storage.persistent, true, 'хранилище должно быть постоянным');
      assert.strictEqual(healthA.storage.demoMode, false, 'демо-режим должен быть выключен');
      assert.strictEqual(healthA.storage.writesEnabled, true, 'запись должна быть разрешена');
    });

    /* Инстанс B — второй параллельный процесс, как вторая лямбда на Vercel. */
    const b = startInstance(ports[1], kvUrl, dataDir);
    instances.push(b);
    const baseB = `http://127.0.0.1:${ports[1]}`;
    await waitForHealth(baseB);

    await check('Заявка создаётся на первом инстансе', async () => {
      const res = await request(baseA, '/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          packageId: 'paket-horror',
          date,
          time: '18:00',
          guests: 2,
          name: 'Тест Хранилище',
          phone,
          messenger: 'whatsapp',
          comment: 'Проверка kv-драйвера',
          consent: true,
          source: 'kv-test',
          formStartedAt: Date.now() - 10_000
        })
      });
      assert.strictEqual(res.status, 201, `ответ ${res.status}: ${res.text.slice(0, 200)}`);
      reference = res.json.booking.reference;
      assert.ok(reference, 'ответ без номера заявки');
    });

    await check('Заявка читается на том же инстансе (контроль)', async () => {
      assert.ok(reference, 'нет номера заявки из предыдущего шага');
      const res = await request(baseA, `/api/bookings/${encodeURIComponent(reference)}?phone=${encodeURIComponent(phone)}`);
      assert.strictEqual(res.status, 200, `ответ ${res.status}: ${res.text.slice(0, 200)}`);
      assert.strictEqual(res.json.booking.reference, reference);
    });

    await check('Заявка видна со второго инстанса (данные пережили перезапуск)', async () => {
      assert.ok(reference, 'нет номера заявки из предыдущего шага');
      const res = await request(baseB, `/api/bookings/${encodeURIComponent(reference)}?phone=${encodeURIComponent(phone)}`);
      assert.strictEqual(res.status, 200, `ответ ${res.status}: ${res.text.slice(0, 200)}`);
      assert.strictEqual(res.json.booking.reference, reference);
      assert.strictEqual(res.json.booking.packageId, 'paket-horror');
    });

    await check('Драйвер действительно берёт распределённую блокировку', () => {
      const lockSets = stub.commands.filter(
        (args) => args[0] === 'SET' && args[1] === 'fantom:lock' && args.includes('NX')
      );
      assert.ok(lockSets.length > 0, 'нет ни одной попытки взять блокировку через SET NX');
      const releases = stub.commands.filter((args) => args[0] === 'EVAL');
      assert.ok(releases.length > 0, 'блокировка ни разу не снималась через EVAL');
    });

    await check('База лежит в KV, а не в памяти процесса', () => {
      assert.ok(stub.store.has('fantom:db'), 'в Redis нет ключа fantom:db');
      const data = JSON.parse(stub.store.get('fantom:db'));
      assert.ok(Array.isArray(data.bookings), 'в базе нет списка заявок');
      const stored = data.bookings.map((item) => item.reference);
      assert.ok(
        stored.includes(reference),
        `в Redis заявка ${reference} не найдена. Там: ${stored.join(', ') || 'пусто'}`
      );
    });
  } finally {
    for (const instance of instances) {
      instance.child.kill();
    }
    await sleep(200);
    stub.server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  const failed = results.filter((item) => !item.ok);
  console.log('\n' + '─'.repeat(72));
  console.log(`  Проверок: ${results.length}   провалено: ${failed.length}`);
  console.log('─'.repeat(72) + '\n');

  process.exit(failed.length ? 1 : 0);
}

run().catch((error) => {
  console.error('Скрипт упал:', error.message);
  if (process.env.VERBOSE) console.error(error.stack);
  process.exit(1);
});
