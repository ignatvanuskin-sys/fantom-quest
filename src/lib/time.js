'use strict';

/**
 * Утилиты работы со временем без внешних зависимостей.
 *
 * Ключевая проблема, которую решает модуль: бизнес работает 09:00–02:00
 * ежедневно, то есть игровой день пересекает календарную дату. Слот «00:30»
 * относится к игровому дню ПРЕДЫДУЩЕЙ календарной даты.
 *
 * Все слоты хранятся парой (businessDate = YYYY-MM-DD, time = HH:MM), где
 * businessDate — дата открытия смены. Абсолютный момент времени вычисляется
 * через zonedToUtc().
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Смещение таймзоны (local − UTC) в миллисекундах для конкретного момента. */
function tzOffsetMs(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Наивные компоненты локального времени → реальный момент UTC. */
function zonedToUtc(timeZone, { year, month, day, hour = 0, minute = 0 }) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let offset = tzOffsetMs(timeZone, new Date(naive));
  let ts = naive - offset;
  // Вторая итерация закрывает переходы на летнее время и смены смещения.
  offset = tzOffsetMs(timeZone, new Date(ts));
  ts = naive - offset;
  return new Date(ts);
}

/** Реальный момент → компоненты локального времени в таймзоне. */
function utcToZoned(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short'
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
    date: pad4(year) + '-' + pad2(month) + '-' + pad2(day),
    time: pad2(hour) + ':' + pad2(Number(parts.minute))
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}
function pad4(n) {
  return String(n).padStart(4, '0');
}

/** Проверка формата даты YYYY-MM-DD с учётом реального числа дней в месяце. */
function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function isValidTime(value) {
  return typeof value === 'string' && TIME_RE.test(value);
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  probe.setUTCDate(probe.getUTCDate() + days);
  return probe.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  const pa = Date.parse(a + 'T00:00:00Z');
  const pb = Date.parse(b + 'T00:00:00Z');
  return Math.round((pa - pb) / 86400000);
}

function todayIn(timeZone, now = new Date()) {
  return utcToZoned(timeZone, now).date;
}

function minuteOfDay(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Абсолютное начало слота для игрового дня.
 * Время до начала смены (< shiftStart) трактуется как «после полуночи» —
 * то есть относится к следующей календарной дате.
 */
function slotStartInstant(timeZone, businessDate, time, shiftStart = '09:00') {
  const crosses = minuteOfDay(time) < minuteOfDay(shiftStart);
  const calendarDate = crosses ? addDays(businessDate, 1) : businessDate;
  const [y, m, d] = calendarDate.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return zonedToUtc(timeZone, { year: y, month: m, day: d, hour: h, minute: mi });
}

/**
 * Границы игрового дня: [shiftStart того же дня, shiftEnd следующих суток).
 * Для 09:00–02:00 окно = D 09:00 → D+1 02:00.
 */
function businessWindow(timeZone, businessDate, shiftStart, shiftEnd) {
  const [sy, sm, sd] = businessDate.split('-').map(Number);
  const [sh, smi] = shiftStart.split(':').map(Number);
  const start = zonedToUtc(timeZone, { year: sy, month: sm, day: sd, hour: sh, minute: smi });
  const next = addDays(businessDate, 1);
  const [ny, nm, nd] = next.split('-').map(Number);
  const [eh, emi] = shiftEnd.split(':').map(Number);
  const end = zonedToUtc(timeZone, { year: ny, month: nm, day: nd, hour: eh, minute: emi });
  return { start, end };
}

/** Список минут старта слотов внутри игрового дня. */
function slotTimes(shiftStart, shiftEnd, stepMinutes) {
  const open = minuteOfDay(shiftStart);
  const close = minuteOfDay(shiftEnd);
  const total = close <= open ? 24 * 60 - open + close : close - open;
  const times = [];
  for (let offset = 0; offset <= total - stepMinutes; offset += stepMinutes) {
    const minute = (open + offset) % (24 * 60);
    times.push(pad2(Math.floor(minute / 60)) + ':' + pad2(minute % 60));
  }
  return times;
}

const WEEKDAYS_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MONTHS_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря'
];
const WEEKDAYS_SHORT_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** «27 сентября, вс» — без внешних локалей. */
function formatDateRu(dateStr) {
  if (!isValidDate(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = WEEKDAYS_SHORT_RU[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${d} ${MONTHS_RU[m - 1]}, ${weekday}`;
}

function weekdayShortRu(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAYS_SHORT_RU[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** «27 сентября 2026, 01:00 (Asia/Almaty)» / с учётом «ночи» предыдущего дня. */
function formatSlotRu(timeZone, businessDate, time) {
  const instant = slotStartInstant(timeZone, businessDate, time);
  const z = utcToZoned(timeZone, instant);
  const crosses = z.date !== businessDate;
  return `${z.day} ${MONTHS_RU[z.month - 1]}, ${z.time}${crosses ? ' (после полуночи)' : ''}`;
}

function formatDateTimeRu(timeZone, date) {
  const z = utcToZoned(timeZone, date);
  return `${z.day} ${MONTHS_RU[z.month - 1]} ${z.year}, ${z.time}`;
}

function isoWeekdayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 6 : js - 1; // 0 = понедельник
}

module.exports = {
  DATE_RE,
  TIME_RE,
  tzOffsetMs,
  zonedToUtc,
  utcToZoned,
  isValidDate,
  isValidTime,
  addDays,
  diffDays,
  todayIn,
  minuteOfDay,
  slotStartInstant,
  businessWindow,
  slotTimes,
  formatDateRu,
  weekdayShortRu,
  formatSlotRu,
  formatDateTimeRu,
  isoWeekdayIndex,
  WEEKDAYS_SHORT_RU,
  WEEKDAYS_RU,
  MONTHS_RU
};
