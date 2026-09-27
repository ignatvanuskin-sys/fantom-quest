'use strict';

/**
 * Доступность слотов.
 *
 * Модель: базовая сетка слотов строится из настроек расписания
 * (сдвиг 09:00–02:00, шаг 60 минут, буфер уборки 15 минут). Слот, состояние
 * которого отличается от «свободен», материализуется в db.slots как
 * сущность AvailabilitySlot.
 *
 * Сущность AvailabilitySlot:
 *   { id, businessDate, time, startIso, endIso, status, questId?, bookingId?,
 *     capacity, booked, note, updatedAt }
 *
 * Статусы слота: open | held | booked | blocked | past
 */

const time = require('../lib/time');
const config = require('../config');

function slotId(businessDate, slotTime) {
  return `slot_${businessDate}_${slotTime.replace(':', '')}`;
}

function parseSlotId(id) {
  const match = /^slot_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/.exec(String(id || ''));
  if (!match) return null;
  return { businessDate: match[1], time: `${match[2]}:${match[3]}` };
}

function settingsOf(data) {
  return data.settings || {};
}

/** Базовая сетка времени для игрового дня. */
function grid(settings) {
  const hours = settings.hours || {};
  const shiftStart = hours.shiftStart || '09:00';
  const shiftEnd = hours.shiftEnd || '02:00';
  return time.slotTimes(shiftStart, shiftEnd, config.booking.slotStepMinutes);
}

function questsBookable(data) {
  return (data.quests || []).filter((q) => q.active && q.bookingEnabled !== false);
}

function questById(data, id) {
  return (data.quests || []).find((q) => q.id === id || q.slug === id) || null;
}

function durationFor(data, questId) {
  const quest = questById(data, questId);
  const minutes = quest && Number.isFinite(quest.durationMinutes) ? quest.durationMinutes : 60;
  return minutes;
}

/**
 * Доступность на конкретный игровой день.
 * @returns {{businessDate, timezone, slots: Array, isPast: boolean, shift: object}}
 */
function forDate(data, businessDate, options = {}) {
  const settings = settingsOf(data);
  const tz = settings.timezone || config.timezone;
  const hours = settings.hours || { shiftStart: '09:00', shiftEnd: '02:00' };
  const questId = options.questId || (questsBookable(data)[0] || {}).id;
  const duration = durationFor(data, questId);
  const buffer = config.booking.cleanupBufferMinutes;
  const now = options.now || new Date();
  const window = time.businessWindow(tz, businessDate, hours.shiftStart, hours.shiftEnd);

  const stored = new Map();
  for (const slot of data.slots || []) {
    if (slot.businessDate === businessDate) stored.set(slot.time, slot);
  }

  const bookings = (data.bookings || []).filter(
    (b) => b.businessDate === businessDate && isActiveBooking(b)
  );

  const slots = grid(settings).map((slotTime) => {
    const start = time.slotStartInstant(tz, businessDate, slotTime, hours.shiftStart);
    const end = new Date(start.getTime() + duration * 60000);
    const fitsInShift = end.getTime() <= window.end.getTime();
    const storedSlot = stored.get(slotTime);
    const booking = bookings.find((b) => b.startTime === slotTime);

    let status = 'open';
    if (booking) status = booking.status === 'pending_confirmation' ? 'held' : 'booked';
    else if (storedSlot && storedSlot.status === 'blocked') status = 'blocked';
    else if (storedSlot && storedSlot.status === 'booked' && !booking) status = 'booked';

    if (start.getTime() < now.getTime() && status === 'open') status = 'past';
    if (!fitsInShift) status = 'unavailable';

    const crossesMidnight = slotTime < hours.shiftStart;

    return {
      id: slotId(businessDate, slotTime),
      businessDate,
      time: slotTime,
      label: slotTime,
      crossesMidnight,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      status,
      available: status === 'open',
      capacity: 1,
      booked: status === 'booked' || status === 'held' ? 1 : 0,
      questId,
      durationMinutes: duration,
      cleanupBufferMinutes: buffer,
      bookingId: booking ? booking.id : null,
      note: storedSlot ? storedSlot.note || null : null,
      updatedAt: storedSlot ? storedSlot.updatedAt : null
    };
  });

  return {
    businessDate,
    dateLabel: time.formatDateRu(businessDate),
    weekday: time.weekdayShortRu(businessDate),
    timezone: tz,
    shift: { start: hours.shiftStart, end: hours.shiftEnd },
    durationMinutes: duration,
    questId,
    isPast: window.end.getTime() < now.getTime(),
    slots,
    openCount: slots.filter((s) => s.available).length
  };
}

function isActiveBooking(booking) {
  return ['new', 'pending_confirmation', 'confirmed', 'moved'].includes(booking.status);
}

/** Занят ли конкретный слот (для атомарной проверки перед вставкой). */
function isSlotTaken(data, businessDate, slotTime) {
  return (data.bookings || []).some(
    (b) => b.businessDate === businessDate && b.startTime === slotTime && isActiveBooking(b)
  );
}

/** Закрыт ли слот администратором (технический перерыв, ремонт, приватная игра). */
function isSlotBlocked(data, businessDate, slotTime) {
  const id = slotId(businessDate, slotTime);
  const slot = (data.slots || []).find((s) => s.id === id);
  return Boolean(slot && slot.status === 'blocked');
}

/** Следующие N игровых дней, начиная с сегодняшнего в таймзоне бизнеса. */
function upcoming(data, options = {}) {
  const settings = settingsOf(data);
  const tz = settings.timezone || config.timezone;
  const now = options.now || new Date();
  const from = options.from || time.todayIn(tz, now);
  const days = Math.min(options.days || 14, config.booking.horizonDays);
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const date = time.addDays(from, i);
    out.push(forDate(data, date, { questId: options.questId, now }));
  }
  return out;
}

/** Ближайший свободный слот — для hero и карточек. */
function nextOpenSlot(data, options = {}) {
  const days = upcoming(data, { ...options, days: 7 });
  for (const day of days) {
    const slot = day.slots.find((s) => s.available);
    if (slot) {
      return {
        ...slot,
        dateLabel: day.dateLabel,
        humanLabel: time.formatSlotRu(day.timezone, day.businessDate, slot.time)
      };
    }
  }
  return null;
}

/**
 * Валидация запрошенного слота: формат, попадание в игровое окно,
 * шаг сетки, отсутствие в прошлом.
 */
function validateRequestedSlot(data, businessDate, slotTime, options = {}) {
  const settings = settingsOf(data);
  const tz = settings.timezone || config.timezone;
  const hours = settings.hours || { shiftStart: '09:00', shiftEnd: '02:00' };
  const now = options.now || new Date();

  if (!time.isValidDate(businessDate)) return { ok: false, code: 'bad_date', message: 'Некорректная дата.' };
  if (!time.isValidTime(slotTime)) return { ok: false, code: 'bad_time', message: 'Некорректное время.' };
  if (!grid(settings).includes(slotTime)) {
    return { ok: false, code: 'off_grid', message: 'Этого времени нет в расписании — выберите слот из списка.' };
  }

  const duration = durationFor(data, options.questId);
  const window = time.businessWindow(tz, businessDate, hours.shiftStart, hours.shiftEnd);
  const start = time.slotStartInstant(tz, businessDate, slotTime, hours.shiftStart);
  const end = new Date(start.getTime() + duration * 60000);

  if (end.getTime() > window.end.getTime()) {
    return { ok: false, code: 'outside_shift', message: 'Игра не помещается в рабочие часы — выберите более раннее время.' };
  }
  if (start.getTime() < now.getTime()) {
    return { ok: false, code: 'in_past', message: 'Это время уже прошло. Выберите другой слот.' };
  }
  return { ok: true, start, end, duration, timezone: tz };
}

module.exports = {
  slotId,
  parseSlotId,
  grid,
  forDate,
  upcoming,
  nextOpenSlot,
  isSlotTaken,
  isSlotBlocked,
  validateRequestedSlot,
  isActiveBooking,
  questById,
  questsBookable
};
