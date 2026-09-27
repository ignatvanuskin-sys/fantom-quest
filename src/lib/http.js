'use strict';

/**
 * Микро-фреймворк: роутер, парсинг тела, безопасные ответы.
 * Без внешних зависимостей — намеренно, чтобы проект запускался
 * одной командой на любой машине.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const config = require('../config');
const { ensureDirs } = require('../store');

const BODY_LIMIT = 64 * 1024; // 64 КБ — заявке больше не нужно

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function createRouter() {
  const routes = [];
  const add = (method, pattern, handler, options = {}) => {
    routes.push({ method: method.toUpperCase(), pattern, handler, options });
  };
  return {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    patch: (p, h, o) => add('PATCH', p, h, o),
    put: (p, h, o) => add('PUT', p, h, o),
    delete: (p, h, o) => add('DELETE', p, h, o),
    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method.toUpperCase()) continue;
        const match = route.pattern.exec(pathname);
        if (match) return { route, params: match.groups || {}, match };
      }
      return null;
    },
    routes
  };
}

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...extra
  };
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    ...securityHeaders(),
    ...headers
  });
  res.end(body);
}

function sendHtml(res, status, html, headers = {}) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': body.length,
    ...securityHeaders(),
    ...headers
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8', headers = {}) {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': body.length,
    ...securityHeaders(),
    ...headers
  });
  res.end(body);
}

function redirect(res, location, status = 302) {
  res.writeHead(status, { location, ...securityHeaders() });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new HttpError(413, 'payload_too_large', 'Слишком большой запрос.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
  const raw = await readBody(req);
  if (!raw) return {};
  if (contentType === 'application/json') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      throw new HttpError(400, 'bad_json', 'Тело запроса не является корректным JSON.');
    }
  }
  if (contentType === 'application/x-www-form-urlencoded' || contentType === '') {
    const params = new URLSearchParams(raw);
    const out = {};
    for (const [key, value] of params) out[key] = value;
    return out;
  }
  throw new HttpError(415, 'unsupported_media_type', 'Поддерживаются application/json и form-urlencoded.');
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

async function serveStatic(req, res, pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!relative) return false;
  const resolved = path.resolve(config.publicDir, relative);
  // Защита от path traversal.
  if (!resolved.startsWith(path.resolve(config.publicDir))) {
    throw new HttpError(403, 'forbidden', 'Доступ запрещён.');
  }
  let stat;
  try {
    stat = await fsp.stat(resolved);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(resolved).toLowerCase();
  const isHtml = ext === '.html';
  const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, securityHeaders());
    res.end();
    return true;
  }
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    etag,
    'cache-control': isHtml ? 'no-cache' : 'public, max-age=86400, must-revalidate',
    ...securityHeaders()
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(resolved).pipe(res);
  return true;
}

/** Логирование запросов без персональных данных. */
function logRequest(req, res, startedAt) {
  if (process.env.QUIET === '1') return;
  const ms = Date.now() - startedAt;
  const url = (req.url || '').split('?')[0];
  const line = `${req.method} ${url} ${res.statusCode} ${ms}ms`;
  if (res.statusCode >= 500) console.error('[http] ' + line);
  else if (res.statusCode >= 400) console.warn('[http] ' + line);
  else console.log('[http] ' + line);
}

async function ensureDataDirs() {
  ensureDirs();
}

module.exports = {
  createRouter,
  parseBody,
  readBody,
  sendJson,
  sendHtml,
  sendText,
  redirect,
  clientIp,
  serveStatic,
  securityHeaders,
  logRequest,
  ensureDataDirs,
  HttpError,
  MIME,
  BODY_LIMIT
};
