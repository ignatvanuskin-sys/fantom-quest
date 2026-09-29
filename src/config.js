'use strict';

const os = require('os');
const path = require('path');
const { load } = require('./lib/env');
const pkg = require('../package.json');

const ROOT = path.join(__dirname, '..');
load(path.join(ROOT, '.env'));

const env = process.env;

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || String(value) === '1';
}

/**
 * Пустая переменная окружения — это «не задано», а не ноль.
 * `Number('')` возвращает 0, поэтому RATE_LIMIT_MAX= (пустое значение)
 * раньше превращался в 0 и блокировал все запросы к API.
 */
function int(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Пустая переменная окружения — «не задано», а не пустая строка. */
function str(value, fallback = '') {
  return value === undefined || value === null || String(value).trim() === '' ? fallback : String(value);
}

/**
 * Таймзона, понятная Intl. Любая опечатка в SITE_TIMEZONE («Asia/Almaty »,
 * «Alma-Aty», пустая строка) заставляла Intl.DateTimeFormat бросать
 * RangeError — и падал каждый запрос, включая /healthz. Ошибочное значение
 * заменяем безопасным и предупреждаем в консоль.
 */
function validTimezone(value, fallback = 'Asia/Almaty') {
  const candidate = str(value);
  if (!candidate) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    console.warn(
      `[config] SITE_TIMEZONE="${candidate}" не распознана, используется ${fallback}. Проверьте значение.`
    );
    return fallback;
  }
}

// ── Платформа ────────────────────────────────────────────────────────────────
// На Vercel файловая система доступна только для чтения, а /tmp — эфемерный:
// он живёт в пределах одного прогретого инстанса и теряется вместе с ним.
// Поэтому «файловый» драйвер на Vercel не является постоянным хранилищем,
// и это должно быть видно и в API, и в интерфейсе.
const isVercel = Boolean(env.VERCEL || env.VERCEL_ENV);

// Upstash Redis и Vercel KV используют один и тот же REST-протокол,
// поэтому поддерживаются оба набора переменных окружения.
const kvUrl = str(env.KV_REST_API_URL) || str(env.UPSTASH_REDIS_REST_URL);
const kvToken = str(env.KV_REST_API_TOKEN) || str(env.UPSTASH_REDIS_REST_TOKEN);
const kvConfigured = Boolean(kvUrl && kvToken);

const storeDriver = str(env.STORE_DRIVER) || (kvConfigured ? 'kv' : 'file');

// Постоянное хранилище: KV всегда, файл — только вне Vercel.
const persistentStorage = storeDriver === 'kv' ? true : !isVercel;
const demoMode = !persistentStorage;

// ── Адреса ───────────────────────────────────────────────────────────────────
const vercelHost = str(env.VERCEL_PROJECT_PRODUCTION_URL) || str(env.VERCEL_URL);
const port = int(env.PORT, 3000);
const siteUrl = String(
  env.SITE_URL || (vercelHost ? `https://${vercelHost}` : `http://localhost:${port}`)
).replace(/\/+$/, '');

// DATA_DIR позволяет тестам и staging-окружению работать на отдельной базе.
// На Vercel каталог проекта только для чтения, поэтому база уходит в /tmp.
const dataDir =
  env.DATA_DIR && !isVercel
    ? path.resolve(env.DATA_DIR)
    : isVercel
      ? path.join(os.tmpdir(), 'fantom-data')
      : path.join(ROOT, 'data');

const config = {
  version: pkg.version,
  root: ROOT,
  publicDir: path.join(ROOT, 'public'),
  dataDir,
  dbFile: path.join(dataDir, 'db.json'),
  auditFile: path.join(dataDir, 'audit.log.jsonl'),
  docsDir: path.join(ROOT, 'docs'),

  platform: isVercel ? 'vercel' : 'node',
  isVercel,
  // Стандартный токен-заглушка лежит в открытом репозитории, поэтому он
  // допустим только на локальной машине. На развёрнутом стенде админка
  // полностью закрывается, пока владелец не задаст свой ADMIN_TOKEN.
  adminLoginDisabled:
    isVercel &&
    !str(env.ADMIN_PASSWORD) &&
    (!str(env.ADMIN_TOKEN) || str(env.ADMIN_TOKEN) === 'dev-admin-token-change-me'),

  // Идемпотентность заявок: сколько помним ключи повторных отправок.
  // Значение по умолчанию совпадает с тем, что обещает .env.example (15 минут):
  // расхождение между документацией и кодом означало, что повторный клик
  // по кнопке мог пройти уже через два часа.
  idempotencyWindowMs: int(env.IDEMPOTENCY_WINDOW_MINUTES, 15) * 60 * 1000,
  storeDriver,
  kv: kvConfigured ? { url: kvUrl, token: kvToken } : null,
  persistentStorage,
  demoMode,

  port,
  // На Vercel слушаем все интерфейсы: платформа сама проксирует запросы
  // на внутренний порт. Привязка к 127.0.0.1 там не нужна и вредна.
  host: isVercel ? null : env.HOST || '127.0.0.1',
  siteUrl,
  timezone: validTimezone(env.SITE_TIMEZONE, 'Asia/Almaty'),

  // Админка: основной способ входа — пароль (ADMIN_PASSWORD) с подписанной
  // сессионной кукой. ADMIN_TOKEN оставлен для совместимости и как API-ключ.
  adminToken: str(env.ADMIN_TOKEN) || 'dev-admin-token-change-me',
  adminPassword: str(env.ADMIN_PASSWORD),
  adminSessionSecret: str(env.ADMIN_SESSION_SECRET),
  adminSessionTtlMs: int(env.ADMIN_SESSION_TTL_HOURS, 12) * 3600 * 1000,
  isDefaultAdminToken: !str(env.ADMIN_TOKEN) || str(env.ADMIN_TOKEN) === 'dev-admin-token-change-me',

  // Стенд без постоянного хранилища обязан молчать: заявка не сохранена,
  // значит её нельзя ни подтвердить, ни отследить, ни показать в админке.
  // Уведомление бизнесу в таком режиме создало бы обязательство, которое
  // нечем исполнить. Поэтому demoMode принудительно включает MOCK_MODE,
  // даже если в переменных окружения стоит MOCK_MODE=false.
  mockMode: demoMode ? true : bool(env.MOCK_MODE, true),

  notifications: {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',
    webhookUrl: env.NOTIFY_WEBHOOK_URL || '',
    emailTo: env.NOTIFY_EMAIL_TO || '',
    emailFrom: env.NOTIFY_EMAIL_FROM || '',
    emailHttpEndpoint: env.EMAIL_HTTP_ENDPOINT || '',
    emailHttpToken: env.EMAIL_HTTP_TOKEN || '',
    timeoutMs: 8000
  },

  rateLimit: {
    windowMs: int(env.RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
    max: int(env.RATE_LIMIT_MAX, 8)
  },

  form: {
    minFillSeconds: int(env.FORM_MIN_FILL_SECONDS, 3),
    maxCommentLength: 600,
    maxNameLength: 80
  },

  booking: {
    // Операционные константы расписания. Настраиваются владельцем,
    // значения по умолчанию помечены как «нужно подтвердить».
    slotStepMinutes: 60,
    cleanupBufferMinutes: 15,
    maxGuestsPerBooking: 20,
    minGuestsPerBooking: 1,
    horizonDays: 30
  }
};

config.isMockMode = config.mockMode;

/**
 * Человекочитаемое объяснение ограничений стенда.
 * Именно getter, а не значение: причина должна соответствовать текущему
 * config.demoMode, иначе сообщение разойдётся с фактическим поведением.
 */
Object.defineProperty(config, 'demoReason', {
  enumerable: true,
  get() {
    return this.demoMode
      ? 'Постоянное хранилище не подключено: заявки не сохраняются между запусками ' +
          'инстанса и не отправляются бизнесу.'
      : null;
  }
});

module.exports = config;
