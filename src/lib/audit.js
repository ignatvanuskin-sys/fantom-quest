'use strict';

/**
 * Audit log — append-only JSONL. Фиксирует все значимые действия:
 * создание заявки, смену статуса, правки контента, вход в админку,
 * срабатывание anti-spam. Персональные данные в лог не пишутся целиком.
 */

const fsp = require('fs/promises');
const config = require('../config');
const { ensureDirs } = require('../store');

const MAX_STRING = 160;

function truncate(value) {
  if (typeof value !== 'string') return value;
  return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…' : value;
}

function scrub(details) {
  if (!details || typeof details !== 'object') return details;
  const out = {};
  for (const [key, value] of Object.entries(details)) {
    if (/phone|name|comment|email/i.test(key) && typeof value === 'string') {
      // Маскируем персональные данные в логе.
      out[key] = value.length <= 4 ? '••••' : '••••' + value.slice(-4);
    } else {
      out[key] = truncate(value);
    }
  }
  return out;
}

async function append(action, details = {}, req = null) {
  ensureDirs();
  const entry = {
    at: new Date().toISOString(),
    action,
    ip: req ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '' : undefined,
    userAgent: req ? truncate(String(req.headers['user-agent'] || '')) : undefined,
    ...scrub(details)
  };
  try {
    await fsp.appendFile(config.auditFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (error) {
    // Лог не должен ломать основной поток.
    console.error('[audit] не удалось записать запись:', error.message);
  }
  return entry;
}

async function tail(limit = 100) {
  try {
    const contents = await fsp.readFile(config.auditFile, 'utf8');
    const lines = contents.split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      })
      .reverse();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

module.exports = { append, tail };
