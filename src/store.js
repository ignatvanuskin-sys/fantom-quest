'use strict';

/**
 * Хранилище данных.
 *
 * Три драйвера с одинаковым интерфейсом:
 *
 *   file   — один JSON-файл с атомарной записью. По умолчанию вне Vercel.
 *   kv     — Redis по REST-протоколу (Upstash / Vercel KV). Единственный
 *            драйвер, который даёт постоянное хранилище на Vercel.
 *   memory — ничего не сохраняет. Используется как аварийный режим, когда
 *            запись на диск недоступна, чтобы приложение не падало с 500.
 *
 * Атомарность резервирования слота обеспечивается транзакцией:
 * мьютекс в процессе + распределённая блокировка (для kv) вокруг
 * чтения-изменения-записи. Без блокировки два инстанса могли бы продать
 * один и тот же слот.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { createDefaultData } = require('./seed-data');

const locks = new Map();
let cache = null;
let fsAvailable = true;
let warned = false;
let override = null;

function config() {
  return require('./config');
}

/** Сериализация async-операций по ключу. */
function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.then(fn, fn);
  locks.set(
    key,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}

function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.warn('[store] ' + message);
}

// ── Драйвер: файл ────────────────────────────────────────────────────────────

function ensureDirs() {
  if (!fsAvailable) return;
  const cfg = config();
  try {
    for (const dir of [cfg.dataDir, path.dirname(cfg.auditFile)]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  } catch (error) {
    fsAvailable = false;
    warnOnce(
      `каталог данных недоступен для записи (${error.code || error.message}). ` +
        'Работаем в памяти: данные не сохраняются. Подключите KV или задайте DATA_DIR.'
    );
  }
}

async function atomicWrite(file, contents) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, contents, 'utf8');
  await fsp.rename(tmp, file);
}

async function readRaw() {
  const cfg = config();
  try {
    const contents = await fsp.readFile(cfg.dbFile, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      // Битый файл не должен приводить к потере данных молча.
      const backup = `${cfg.dbFile}.corrupt.${Date.now()}`;
      await fsp.rename(cfg.dbFile, backup).catch(() => {});
      throw new Error(
        `data/db.json повреждён и перемещён в ${path.basename(backup)}. ` +
          'Восстановите файл из бэкапа или выполните: npm run seed'
      );
    }
    if (error.code === 'EROFS' || error.code === 'EACCES' || error.code === 'EPERM') {
      fsAvailable = false;
      warnOnce(`файловая система только для чтения (${error.code}). Работаем в памяти.`);
      return null;
    }
    throw error;
  }
}

const fileDriver = {
  name: 'file',
  volatile: false,
  async load() {
    ensureDirs();
    if (!fsAvailable) return null;
    return readRaw();
  },
  async save(data) {
    ensureDirs();
    if (!fsAvailable) return;
    await atomicWrite(config().dbFile, JSON.stringify(data, null, 2));
  }
};

// ── Драйвер: память ──────────────────────────────────────────────────────────

const memoryDriver = {
  name: 'memory',
  volatile: false,
  async load() {
    return null;
  },
  async save() {
    /* намеренно ничего не сохраняем */
  }
};

// ── Драйвер: Redis по REST (Upstash / Vercel KV) ─────────────────────────────

const DB_KEY = 'fantom:db';
const LOCK_KEY = 'fantom:lock';
const LOCK_TTL_MS = 10000;
const LOCK_WAIT_MS = 5000;

function createKvDriver({ url, token }) {
  async function cmd(args) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args)
    });
    if (!response.ok) {
      throw new Error(`KV ответил HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload && payload.error) throw new Error(`KV: ${payload.error}`);
    return payload ? payload.result : null;
  }

  async function acquireLock() {
    const token_ = crypto.randomBytes(12).toString('hex');
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      const result = await cmd(['SET', LOCK_KEY, token_, 'NX', 'PX', String(LOCK_TTL_MS)]);
      if (result === 'OK') break;
      if (Date.now() > deadline) {
        throw new Error('Не удалось получить блокировку хранилища. Повторите запрос.');
      }
      await new Promise((resolve) => setTimeout(resolve, 60 + Math.floor(Math.random() * 90)));
    }
    // Снимаем блокировку только если она наша: иначе можно удалить чужую,
    // если наша успела истечь по TTL.
    return async () => {
      const script =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
      await cmd(['EVAL', script, '1', LOCK_KEY, token_]).catch(() => {});
    };
  }

  return {
    name: 'kv',
    volatile: true, // перед каждой транзакцией перечитываем состояние
    acquireLock,
    async load() {
      const raw = await cmd(['GET', DB_KEY]);
      if (!raw) return null;
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error('KV: значение по ключу ' + DB_KEY + ' повреждено и не читается как JSON.');
      }
    },
    async save(data) {
      await cmd(['SET', DB_KEY, JSON.stringify(data)]);
    }
  };
}

// ── Выбор драйвера ───────────────────────────────────────────────────────────

function activeDriver() {
  if (override) return override;
  const cfg = config();
  if (cfg.storeDriver === 'kv') {
    if (!cfg.kv) {
      throw new Error('STORE_DRIVER=kv, но KV_REST_API_URL / KV_REST_API_TOKEN не заданы.');
    }
    return createKvDriver(cfg.kv);
  }
  if (cfg.storeDriver === 'memory') return memoryDriver;
  return fsAvailable ? fileDriver : memoryDriver;
}

/** Тестовый шов: позволяет подменить драйвер без переменных окружения. */
function configure(next) {
  override = next || null;
  cache = null;
}

// ── Ядро ─────────────────────────────────────────────────────────────────────

async function load(force) {
  if (cache && !force) return cache;
  const driver = activeDriver();
  const raw = await driver.load();
  if (!raw) {
    cache = createDefaultData();
    await persist();
    return cache;
  }
  cache = migrate(raw);
  return cache;
}

/** Простейшие миграции схемы: добавляет отсутствующие коллекции. */
function migrate(data) {
  const defaults = createDefaultData();
  let changed = false;
  for (const key of Object.keys(defaults)) {
    if (data[key] === undefined) {
      data[key] = defaults[key];
      changed = true;
    }
  }
  if (!data.meta) {
    data.meta = { schemaVersion: 1, createdAt: new Date().toISOString() };
    changed = true;
  }
  if (changed) data.meta.migratedAt = new Date().toISOString();
  return data;
}

async function persist() {
  if (!cache) return;
  const driver = activeDriver();
  const copy = { ...cache, meta: { ...cache.meta, updatedAt: new Date().toISOString() } };
  cache.meta = copy.meta;
  try {
    await driver.save(copy);
  } catch (error) {
    if (driver.name === 'file') {
      // Деградация вместо падения: приложение продолжает работать,
      // но данные остаются только в памяти.
      fsAvailable = false;
      warnOnce(`не удалось записать базу (${error.code || error.message}). Работаем в памяти.`);
      return;
    }
    throw error; // KV: ошибку обязан увидеть вызывающий, чтобы транзакция откатилась
  }
}

/**
 * Чтение. Возвращает живой объект — не мутируйте его вне транзакции.
 *
 * Для драйвера с общим состоянием (kv) кэш в памяти обходится всегда.
 * На Vercel работает не один процесс, а много: заявку принимает один инстанс,
 * а страницу статуса или админку открывает уже другой, со своим кэшем. Пока
 * чтение отдавало кэш, свежая заявка была видна только тому инстансу, который
 * её записал: клиент на странице статуса получал «заявка не найдена», а
 * администратор не видел новую бронь. Лишний GET в Redis дешевле, чем
 * потерянная заявка.
 *
 * Для файлового драйвера поведение прежнее: один процесс, один файл, кэш
 * корректен, лишних чтений с диска нет.
 */
async function read() {
  const driver = activeDriver();
  return load(Boolean(driver.volatile));
}

/**
 * Мутирующая транзакция.
 * fn получает объект данных, может его менять и вернуть результат.
 * Изменения сохраняются только если fn не бросил исключение.
 */
async function transaction(fn) {
  return withLock('db', async () => {
    const driver = activeDriver();
    const release = driver.acquireLock ? await driver.acquireLock() : null;
    try {
      if (driver.volatile) cache = null; // чужие изменения важнее локального кэша
      await load();
      const snapshot = JSON.parse(JSON.stringify(cache));
      try {
        const result = await fn(cache);
        await persist();
        return result;
      } catch (error) {
        cache = snapshot; // откат в памяти
        throw error;
      }
    } finally {
      if (release) await release();
    }
  });
}

async function resetToDefaults() {
  cache = createDefaultData();
  await persist();
  return cache;
}

function invalidate() {
  cache = null;
}

module.exports = {
  load,
  read,
  transaction,
  persist,
  resetToDefaults,
  invalidate,
  withLock,
  atomicWrite,
  ensureDirs,
  configure,
  driverName: () => activeDriver().name
};
