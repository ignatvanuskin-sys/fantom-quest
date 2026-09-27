'use strict';

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

function int(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const siteUrl = String(env.SITE_URL || `http://localhost:${int(env.PORT, 3000)}`).replace(/\/+$/, '');

// DATA_DIR позволяет тестам и staging-окружению работать на отдельной базе
// и не трогать production-данные.
const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data');

const config = {
  version: pkg.version,
  root: ROOT,
  publicDir: path.join(ROOT, 'public'),
  dataDir,
  dbFile: path.join(dataDir, 'db.json'),
  auditFile: path.join(dataDir, 'audit.log.jsonl'),
  docsDir: path.join(ROOT, 'docs'),

  port: int(env.PORT, 3000),
  host: env.HOST || '127.0.0.1',
  siteUrl,
  timezone: env.SITE_TIMEZONE || 'Asia/Almaty',

  adminToken: env.ADMIN_TOKEN || 'dev-admin-token-change-me',
  isDefaultAdminToken: !env.ADMIN_TOKEN || env.ADMIN_TOKEN === 'dev-admin-token-change-me',

  mockMode: bool(env.MOCK_MODE, true),

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

module.exports = config;
