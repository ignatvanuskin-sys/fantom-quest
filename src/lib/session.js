'use strict';

/**
 * Сессии админки: подписанная кука без серверного хранилища.
 *
 * Формат: base64url(payload).hmacSha256(payload)
 * payload = { sub: 'admin', iat, exp }
 *
 * Почему так: не нужна таблица сессий, подпись проверяется на каждом запросе,
 * срок жизни ограничен. Секрет подписи — ADMIN_SESSION_SECRET; если он не задан,
 * он выводится из пароля/токена, чтобы кука всё равно не подделывалась.
 */

const crypto = require('crypto');
const config = require('../config');

const COOKIE_NAME = 'fantom_session';

function secret() {
  if (config.adminSessionSecret) return config.adminSessionSecret;
  const base = config.adminPassword || config.adminToken || '';
  return crypto.createHash('sha256').update('fantom-session|' + base).digest('hex');
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64').toString('utf8');
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function issue() {
  const now = Date.now();
  const payload = base64url(JSON.stringify({ sub: 'admin', iat: now, exp: now + config.adminSessionTtlMs }));
  return `${payload}.${sign(payload)}`;
}

/** @returns {{valid: boolean, reason?: string}} */
function verify(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) {
    return { valid: false, reason: 'malformed' };
  }
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(signature || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad_signature' };
  }
  let parsed;
  try {
    parsed = JSON.parse(fromBase64url(payload));
  } catch {
    return { valid: false, reason: 'bad_payload' };
  }
  if (!parsed.exp || parsed.exp < Date.now()) return { valid: false, reason: 'expired' };
  return { valid: true };
}

/** Постоянное по времени сравнение строк — для пароля. */
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function cookieHeader(token, options = {}) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(config.adminSessionTtlMs / 1000)}`
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

const clearCookieHeader = () =>
  `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

function readCookie(req) {
  const header = String(req.headers.cookie || '');
  const found = header
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(COOKIE_NAME + '='));
  return found ? decodeURIComponent(found.slice(COOKIE_NAME.length + 1)) : '';
}

module.exports = { COOKIE_NAME, issue, verify, safeEqual, cookieHeader, clearCookieHeader, readCookie };
