'use strict';

/**
 * Хранилище данных: один JSON-файл с атомарной записью и мьютексом.
 *
 * Почему так:
 *  - Атомарность резервирования слота требует read-check-write внутри
 *    критической секции. Мьютекс сериализует такие операции в процессе,
 *    а запись через временный файл + rename защищает от повреждения
 *    данных при падении процесса.
 *  - Для одного инстанса этого достаточно. При переходе на несколько
 *    инстансов замените драйвер на PostgreSQL (см. README, «Миграция»).
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { createDefaultData } = require('./seed-data');

const locks = new Map();
let cache = null;

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

function ensureDirs() {
  const cfg = config();
  for (const dir of [cfg.dataDir, path.dirname(cfg.auditFile)]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
    throw error;
  }
}

async function load() {
  if (cache) return cache;
  ensureDirs();
  const raw = await readRaw();
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
  const cfg = config();
  const copy = { ...cache, meta: { ...cache.meta, updatedAt: new Date().toISOString() } };
  cache.meta = copy.meta;
  await atomicWrite(cfg.dbFile, JSON.stringify(copy, null, 2));
}

/** Чтение в режиме только для чтения. Возвращает живой объект — не мутируйте. */
async function read() {
  return load();
}

/**
 * Мутирующая транзакция под глобальным мьютексом.
 * fn получает объект данных, может его менять и вернуть результат.
 * Изменения сохраняются на диск только если fn не бросил исключение.
 */
async function transaction(fn) {
  return withLock('db', async () => {
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

module.exports = { load, read, transaction, persist, resetToDefaults, invalidate, withLock, atomicWrite, ensureDirs };
