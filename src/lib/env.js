'use strict';

/**
 * Минимальный загрузчик .env без внешних зависимостей.
 * Уже установленные переменные окружения имеют приоритет над файлом.
 */

const fs = require('fs');

function parse(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function load(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const parsed = parse(fs.readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return parsed;
  } catch {
    return {};
  }
}

module.exports = { load, parse };
