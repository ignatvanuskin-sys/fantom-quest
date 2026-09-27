'use strict';

/**
 * Простой in-memory rate limiter (token bucket по ключу).
 * Для одного инстанса этого достаточно. За балансировщиком с несколькими
 * инстансами вынесите состояние в Redis — интерфейс оставлен простым.
 */

const buckets = new Map();
let lastSweep = 0;

function sweep(now, windowMs) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > windowMs * 2) buckets.delete(key);
  }
}

/**
 * @returns {{allowed: boolean, remaining: number, retryAfterSec: number}}
 */
function check(key, options = {}) {
  // Нулевой или отрицательный лимит означал бы «запрещено всё» и полностью
  // выключил бы API из-за одной опечатки в конфигурации. Считаем это
  // незаданным значением.
  const rawWindow = Number(options.windowMs);
  const rawMax = Number(options.max);
  const windowMs = Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : 10 * 60 * 1000;
  const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 8;
  const now = Date.now();
  sweep(now, windowMs);

  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  const allowed = bucket.count <= max;
  return {
    allowed,
    remaining: Math.max(0, max - bucket.count),
    retryAfterSec: allowed ? 0 : Math.ceil((bucket.start + windowMs - now) / 1000)
  };
}

function reset(key) {
  if (key) buckets.delete(key);
  else buckets.clear();
}

module.exports = { check, reset };
