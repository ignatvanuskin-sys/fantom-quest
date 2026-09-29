'use strict';

/**
 * Бронирование.
 *
 * Ключевые гарантии:
 *  - атомарное резервирование: проверка занятости и вставка происходят
 *    внутри одной транзакции под мьютексом — double booking невозможен;
 *  - человекочитаемый номер заявки (F-XXXXXX) отдельно от внутреннего id;
 *  - audit log на каждое изменение статуса;
 *  - минимум персональных данных: имя, телефон, комментарий, согласие.
 */

const crypto = require('crypto');
const config = require('../config');
const store = require('../store');
const audit = require('../lib/audit');
const time = require('../lib/time');
const availability = require('./availability');
const { validateBooking, MESSENGER_LABELS } = require('../lib/validate');
const notify = require('../notify');

const STATUSES = [
  'new',
  'pending_confirmation',
  'confirmed',
  'moved',
  'cancelled',
  'completed',
  'no_show'
];

const STATUS_LABELS = {
  new: 'Новая',
  pending_confirmation: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  moved: 'Перенесена',
  cancelled: 'Отменена',
  completed: 'Завершена',
  no_show: 'Не пришли'
};

class BookingError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

function newReference() {
  const alphabet = 'ACDEFGHJKLMNPQRTUVWXY3456789';
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return `F-${out}`;
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Создание заявки. Валидация → атомарная проверка слота → запись → уведомление.
 */
async function create(payload, context = {}) {
  const validation = validateBooking(payload);
  if (!validation.ok) {
    throw new BookingError('validation_failed', 'Проверьте поля формы.', 422, {
      errors: validation.errors,
      spam: Boolean(validation.spam)
    });
  }
  const input = validation.value;
  const idempotencyKey = context.idempotencyKey || null;

  // Идемпотентность: повторный клик по «Забронировать» не должен создавать
  // вторую заявку. Ищем такую же по ключу за окно дедупликации.
  if (idempotencyKey) {
    const existing = (await store.read()).bookings.find(
      (booking) =>
        booking.idempotencyKey === idempotencyKey &&
        Date.now() - Date.parse(booking.createdAt) < config.idempotencyWindowMs
    );
    if (existing) {
      await audit.append('booking.duplicate_submit', { reference: existing.reference }, context.req || null);
      return {
        booking: existing,
        duplicate: true,
        notification: { mockMode: config.mockMode, demoMode: config.demoMode, channels: [], manual: { whatsappLink: null } }
      };
    }
  }

  const result = await store.transaction(async (data) => {
    const pkg = (data.packages || []).find((item) => item.id === input.packageId);
    if (!pkg) {
      throw new BookingError('package_not_found', 'Такого пакета нет. Выберите пакет из списка.', 409);
    }
    if (!pkg.confirmed) {
      throw new BookingError(
        'package_unavailable',
        'Этот пакет ещё не подтверждён владельцем, поэтому онлайн-запись по нему закрыта. Напишите в WhatsApp.',
        409
      );
    }
    const quest = availability.questById(data, pkg.questId || (data.quests[0] || {}).id);

    const slotCheck = availability.validateRequestedSlot(data, input.date, input.time, {
      questId: quest.id,
      now: context.now || new Date()
    });
    if (!slotCheck.ok) {
      throw new BookingError(slotCheck.code, slotCheck.message, 409, { retryable: true });
    }

    // Слот, закрытый администратором, не продаётся даже если форма его показала.
    if (availability.isSlotBlocked(data, input.date, input.time)) {
      throw new BookingError('slot_blocked', 'Это время закрыто администратором. Выберите другой слот.', 409, {
        retryable: true
      });
    }

    // Критическая секция: слот мог быть занят параллельной заявкой.
    if (availability.isSlotTaken(data, input.date, input.time)) {
      throw new BookingError('slot_taken', 'Это время только что заняли. Выберите другой слот.', 409, {
        retryable: true
      });
    }

    const tz = data.settings.timezone || 'Asia/Almaty';
    const nowIso = new Date().toISOString();
    const booking = {
      id: newId('bk'),
      reference: newReference(),
      packageId: pkg.id,
      packageName: pkg.name,
      packageDuration: pkg.durationLabel || null,
      packagePriceLabel: pkg.priceLabel || null,
      questId: quest.id,
      questName: quest.name,
      locationId: quest.locationId || (data.locations[0] || {}).id,
      date: input.date,
      businessDate: input.date,
      startTime: input.time,
      endTime: time.utcToZoned(tz, slotCheck.end).time,
      crossesMidnight: slotCheck.crossesMidnight,
      startIso: slotCheck.start.toISOString(),
      endIso: slotCheck.end.toISOString(),
      timezone: tz,
      durationMinutes: slotCheck.duration,
      guests: input.guests,
      name: input.name,
      phone: input.phone,
      messenger: input.messenger,
      messengerLabel: MESSENGER_LABELS[input.messenger],
      messengerNick: input.messengerNick || '',
      comment: input.comment || '',
      price: null,
      priceStatus: 'needs_confirmation',
      source: input.source || 'website',
      userAgent: context.userAgent ? String(context.userAgent).slice(0, 180) : null,
      consentAt: nowIso,
      idempotencyKey,
      status: 'new',
      createdAt: nowIso,
      updatedAt: nowIso,
      history: [{ at: nowIso, status: 'new', by: 'system' }]
    };

    data.bookings.push(booking);
    upsertSlot(data, booking, 'booked');
    upsertCustomer(data, booking);

    return booking;
  });

  if (result.duplicate) return result;

  // Уведомление вне транзакции: сеть не должна держать мьютекс хранилища.
  let notification;
  try {
    notification = await notify.dispatchBooking(result);
  } catch (error) {
    notification = { ok: false, channels: [], error: error.message };
    await audit.append('booking.notify_failed', { reference: result.reference, error: error.message });
  }

  await audit.append('booking.created', {
    reference: result.reference,
    packageId: result.packageId,
    questId: result.questId,
    businessDate: result.businessDate,
    startTime: result.startTime,
    guests: result.guests,
    phone: result.phone,
    name: result.name,
    mockMode: notification && notification.mockMode ? true : false
  });

  return { booking: result, notification };
}

/** Материализация/обновление сущности AvailabilitySlot. */
function upsertSlot(data, booking, status) {
  const id = availability.slotId(booking.businessDate, booking.startTime);
  let slot = data.slots.find((s) => s.id === id);
  if (!slot) {
    slot = {
      id,
      businessDate: booking.businessDate,
      time: booking.startTime,
      startIso: booking.startIso,
      endIso: booking.endIso,
      capacity: 1,
      booked: 0,
      status: 'open',
      questId: booking.questId,
      bookingId: null,
      note: null,
      updatedAt: new Date().toISOString()
    };
    data.slots.push(slot);
  }
  slot.status = status;
  slot.booked = status === 'booked' || status === 'held' ? 1 : 0;
  slot.bookingId = status === 'open' || status === 'blocked' ? null : booking.id;
  slot.updatedAt = new Date().toISOString();
  return slot;
}

function upsertCustomer(data, booking) {
  let customer = data.customers.find((c) => c.phone === booking.phone);
  const nowIso = new Date().toISOString();
  if (!customer) {
    customer = {
      id: newId('cu'),
      name: booking.name,
      phone: booking.phone,
      messenger: booking.messenger,
      bookings: [booking.id],
      createdAt: nowIso,
      updatedAt: nowIso,
      consent: { policyVersion: '1.0', givenAt: booking.consentAt, source: booking.source }
    };
    data.customers.push(customer);
  } else {
    customer.name = booking.name || customer.name;
    customer.messenger = booking.messenger || customer.messenger;
    if (!customer.bookings.includes(booking.id)) customer.bookings.push(booking.id);
    customer.updatedAt = nowIso;
  }
  return customer;
}

/** Смена статуса заявки администратором. Освобождает слот при отмене. */
async function setStatus(id, status, actor = 'admin', note = '') {
  if (!STATUSES.includes(status)) {
    throw new BookingError('bad_status', `Неизвестный статус: ${status}`, 422);
  }
  const updated = await store.transaction(async (data) => {
    const booking = data.bookings.find((b) => b.id === id || b.reference === id);
    if (!booking) throw new BookingError('not_found', 'Заявка не найдена.', 404);

    const previous = booking.status;
    if (previous === status && !note) return booking;

    booking.status = status;
    booking.updatedAt = new Date().toISOString();
    booking.history.push({ at: booking.updatedAt, status, by: actor, from: previous, note: note || undefined });

    const releasesSlot = status === 'cancelled' || status === 'no_show' || status === 'completed';
    const slot = upsertSlot(
      data,
      booking,
      releasesSlot ? 'open' : status === 'pending_confirmation' ? 'held' : 'booked'
    );
    if (releasesSlot) {
      slot.bookingId = null;
      slot.booked = 0;
    }
    return booking;
  });

  await audit.append('booking.status_changed', { reference: updated.reference, status, by: actor });
  return updated;
}

async function list(filters = {}) {
  const data = await store.read();
  let items = [...(data.bookings || [])];
  if (filters.status) items = items.filter((b) => b.status === filters.status);
  if (filters.from) items = items.filter((b) => b.businessDate >= filters.from);
  if (filters.to) items = items.filter((b) => b.businessDate <= filters.to);
  if (filters.q) {
    const q = String(filters.q).toLowerCase();
    items = items.filter(
      (b) =>
        b.reference.toLowerCase().includes(q) ||
        String(b.name).toLowerCase().includes(q) ||
        String(b.phone).includes(q)
    );
  }
  items.sort((a, b) => (a.startIso < b.startIso ? 1 : -1));
  return items;
}

async function get(id) {
  const data = await store.read();
  return data.bookings.find((b) => b.id === id || b.reference === id) || null;
}

/** Публичный вид заявки для success-state (без внутренних полей). */
function publicView(booking) {
  return {
    reference: booking.reference,
    packageId: booking.packageId,
    packageName: booking.packageName,
    packageDuration: booking.packageDuration,
    packagePriceLabel: booking.packagePriceLabel,
    questName: booking.questName,
    date: booking.businessDate,
    businessDate: booking.businessDate,
    dateLabel: time.formatDateRu(booking.businessDate),
    startTime: booking.startTime,
    endTime: booking.endTime,
    startIso: booking.startIso,
    endIso: booking.endIso,
    // Признак ночного слота сохранён при создании заявки. Запасной вариант
    // нужен для записей, сделанных до появления поля: смена часов работы
    // не должна ломать подтверждение уже принятых заявок.
    crossesMidnight:
      typeof booking.crossesMidnight === 'boolean'
        ? booking.crossesMidnight
        : time.minuteOfDay(booking.startTime) < time.minuteOfDay('09:00'),
    guests: booking.guests,
    name: booking.name,
    phone: booking.phone,
    messenger: booking.messenger,
    messengerLabel: booking.messengerLabel,
    messengerNick: booking.messengerNick || '',
    timezone: booking.timezone,
    durationMinutes: booking.durationMinutes,
    price: booking.price,
    priceStatus: booking.priceStatus,
    status: booking.status,
    statusLabel: STATUS_LABELS[booking.status],
    createdAt: booking.createdAt
  };
}

/** Статистика для админки. */
async function stats() {
  const data = await store.read();
  const now = new Date();
  const tz = data.settings.timezone || 'Asia/Almaty';
  const today = time.todayIn(tz, now);
  const byStatus = {};
  for (const status of STATUSES) byStatus[status] = 0;
  for (const booking of data.bookings) byStatus[booking.status] = (byStatus[booking.status] || 0) + 1;
  return {
    total: data.bookings.length,
    byStatus,
    today: data.bookings.filter((b) => b.businessDate === today).length,
    upcoming: data.bookings.filter((b) => availability.isActiveBooking(b) && b.startIso >= now.toISOString()).length,
    customers: data.customers.length,
    todayDate: today
  };
}

module.exports = {
  create,
  setStatus,
  list,
  get,
  publicView,
  stats,
  STATUSES,
  STATUS_LABELS,
  BookingError,
  upsertSlot
};
