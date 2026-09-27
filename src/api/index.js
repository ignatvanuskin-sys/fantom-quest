'use strict';

/**
 * REST API.
 *
 * Публичные маршруты (без авторизации, с rate-limit):
 *   GET  /api/site            — настройки, факты, unconfirmed-поля
 *   GET  /api/quests          — каталог сценариев
 *   GET  /api/quests/:slug    — сценарий
 *   GET  /api/availability    — слоты на дату (?date=YYYY-MM-DD&questId=)
 *   GET  /api/calendar        — свободные места на N дней
 *   POST /api/bookings        — создать заявку
 *   GET  /api/bookings/:ref   — статус заявки по номеру + телефону
 *   GET  /api/reviews         — отзывы (только подтверждённые публикуются как отзывы)
 *   GET  /api/faq             — FAQ
 *
 * Админские маршруты (Authorization: Bearer <ADMIN_TOKEN> или cookie fm_admin):
 *   POST   /api/admin/login
 *   GET    /api/admin/overview
 *   GET    /api/admin/bookings          PATCH /api/admin/bookings/:id
 *   GET    /api/admin/quests            PATCH /api/admin/quests/:id
 *   GET    /api/admin/slots             POST  /api/admin/slots/block
 *   GET    /api/admin/faq               POST  /api/admin/faq   PATCH /api/admin/faq/:id  DELETE
 *   GET    /api/admin/reviews           POST  /api/admin/reviews  PATCH /api/admin/reviews/:id
 *   GET    /api/admin/settings          PATCH /api/admin/settings
 *   GET    /api/admin/audit
 */

const crypto = require('crypto');
const config = require('../config');
const store = require('../store');
const audit = require('../lib/audit');
const ratelimit = require('../lib/ratelimit');
const time = require('../lib/time');
const availability = require('../services/availability');
const bookings = require('../services/bookings');
const { cleanString, normalizePhone, isValidEmail } = require('../lib/validate');
const { sendJson, parseBody, clientIp, HttpError } = require('../lib/http');

// ── Авторизация админки ──────────────────────────────────────────────────────

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isAuthorized(req) {
  const header = String(req.headers.authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const cookie = String(req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('fm_admin='));
  const cookieToken = cookie ? decodeURIComponent(cookie.slice('fm_admin='.length)) : '';
  return (
    (bearer && timingSafeEqual(bearer, config.adminToken)) ||
    (cookieToken && timingSafeEqual(cookieToken, config.adminToken))
  );
}

function requireAdmin(req) {
  if (!isAuthorized(req)) {
    throw new HttpError(401, 'unauthorized', 'Нужна авторизация администратора.');
  }
}

// ── Публичная выдача данных ─────────────────────────────────────────────────

function publicQuest(quest) {
  return quest;
}

async function sitePayload() {
  const data = await store.read();
  const next = availability.nextOpenSlot(data);
  return {
    settings: data.settings,
    locations: data.locations,
    mockMode: config.mockMode,
    mockModeNotice: config.mockMode
      ? 'Тестовый режим: заявки не отправляются реальному бизнесу.'
      : null,
    nextOpenSlot: next,
    serverTime: new Date().toISOString(),
    unconfirmedFields: data.settings.unconfirmedFields || []
  };
}

async function questsPayload() {
  const data = await store.read();
  return { quests: data.quests.map(publicQuest) };
}

async function availabilityPayload(query) {
  const data = await store.read();
  const tz = data.settings.timezone || config.timezone;
  const date = time.isValidDate(query.date) ? query.date : time.todayIn(tz);
  const questId = query.questId || undefined;
  return availability.forDate(data, date, { questId });
}

async function calendarPayload(query) {
  const data = await store.read();
  const days = Math.min(Math.max(Number(query.days) || 14, 1), config.booking.horizonDays);
  const from = time.isValidDate(query.from) ? query.from : undefined;
  const daysList = availability.upcoming(data, { days, from, questId: query.questId });
  return {
    timezone: data.settings.timezone,
    days: daysList.map((day) => ({
      businessDate: day.businessDate,
      dateLabel: day.dateLabel,
      weekday: day.weekday,
      isPast: day.isPast,
      openCount: day.openCount,
      slots: day.slots.map((slot) => ({
        id: slot.id,
        time: slot.time,
        crossesMidnight: slot.crossesMidnight,
        status: slot.status,
        available: slot.available
      }))
    }))
  };
}

function reviewsPayload(data) {
  const published = (data.reviews || []).filter((r) => r.verified && r.status === 'published');
  const pending = (data.reviews || []).filter((r) => !r.verified || r.status !== 'published');
  return {
    rating: data.settings.rating,
    published,
    pendingCount: pending.length,
    note:
      'Публикуются только подтверждённые отзывы с источником и датой. ' +
      'Schema.org Review выводится только для подтверждённых — черновики не размечаются.'
  };
}

// ── Регистрация маршрутов ───────────────────────────────────────────────────

function register(router) {
  const publicLimit = (req, scope, options = {}) => {
    const key = `${scope}:${clientIp(req)}`;
    const result = ratelimit.check(key, {
      windowMs: options.windowMs || config.rateLimit.windowMs,
      max: options.max || config.rateLimit.max * 6
    });
    if (!result.allowed) {
      throw new HttpError(429, 'rate_limited', 'Слишком много запросов. Попробуйте через минуту.', {
        retryAfterSec: result.retryAfterSec
      });
    }
  };

  // --- Публичные ---

  router.get(/^\/api\/site$/, async (req, res) => {
    publicLimit(req, 'site');
    sendJson(res, 200, await sitePayload());
  });

  router.get(/^\/api\/quests$/, async (req, res) => {
    publicLimit(req, 'quests');
    sendJson(res, 200, await questsPayload());
  });

  router.get(/^\/api\/quests\/(?<slug>[a-z0-9-]+)$/, async (req, res, params) => {
    publicLimit(req, 'quest');
    const data = await store.read();
    const quest = data.quests.find((q) => q.slug === params.slug || q.id === params.slug);
    if (!quest) throw new HttpError(404, 'not_found', 'Сценарий не найден.');
    sendJson(res, 200, { quest, location: data.locations.find((l) => l.id === quest.locationId) || null });
  });

  router.get(/^\/api\/availability$/, async (req, res, _params, query) => {
    publicLimit(req, 'availability');
    sendJson(res, 200, await availabilityPayload(query));
  });

  router.get(/^\/api\/calendar$/, async (req, res, _params, query) => {
    publicLimit(req, 'calendar');
    sendJson(res, 200, await calendarPayload(query));
  });

  router.get(/^\/api\/faq$/, async (req, res) => {
    publicLimit(req, 'faq');
    const data = await store.read();
    sendJson(res, 200, {
      published: data.faq.filter((f) => f.status === 'published').sort((a, b) => a.order - b.order),
      needsConfirmation: data.faq
        .filter((f) => f.status !== 'published')
        .sort((a, b) => a.order - b.order)
    });
  });

  router.get(/^\/api\/reviews$/, async (req, res) => {
    publicLimit(req, 'reviews');
    sendJson(res, 200, reviewsPayload(await store.read()));
  });

  router.post(/^\/api\/bookings$/, async (req, res) => {
    const key = `booking:${clientIp(req)}`;
    const limit = ratelimit.check(key, { windowMs: config.rateLimit.windowMs, max: config.rateLimit.max });
    if (!limit.allowed) {
      await audit.append('booking.rate_limited', { retryAfterSec: limit.retryAfterSec }, req);
      throw new HttpError(429, 'rate_limited', 'Слишком много заявок с одного адреса. Напишите в WhatsApp.', {
        retryAfterSec: limit.retryAfterSec
      });
    }

    const body = await parseBody(req);
    try {
      const result = await bookings.create(body, {
        userAgent: req.headers['user-agent'],
        ip: clientIp(req)
      });
      sendJson(res, 201, {
        ok: true,
        booking: bookings.publicView(result.booking),
        notification: {
          mockMode: result.notification.mockMode,
          delivered: result.notification.channels.filter((c) => c.ok).map((c) => c.channel),
          manualWhatsappLink: result.notification.manual.whatsappLink
        },
        message:
          'Заявка принята. Администратор свяжется по выбранному каналу. ' +
          'Слот закреплён за вами, пока заявка активна.'
      });
    } catch (error) {
      if (error instanceof bookings.BookingError) {
        await audit.append('booking.rejected', { code: error.code, phone: body.phone, name: body.name }, req);
        sendJson(res, error.status, {
          ok: false,
          code: error.code,
          message: error.message,
          errors: error.extra.errors || null,
          retryable: Boolean(error.extra.retryable)
        });
        return;
      }
      throw error;
    }
  });

  // Статус заявки: номер + телефон (без авторизации, но с проверкой пары).
  router.get(/^\/api\/bookings\/(?<ref>[A-Za-z0-9-]+)$/, async (req, res, params, query) => {
    publicLimit(req, 'booking-status', { max: 20 });
    const phone = normalizePhone(query.phone || '');
    if (!phone.ok) throw new HttpError(400, 'bad_phone', 'Укажите телефон, на который оформлялась заявка.');
    const booking = await bookings.get(params.ref);
    if (!booking || booking.phone !== phone.value) {
      throw new HttpError(404, 'not_found', 'Заявка не найдена. Проверьте номер и телефон.');
    }
    sendJson(res, 200, { ok: true, booking: bookings.publicView(booking) });
  });

  // --- Админка ---

  router.post(/^\/api\/admin\/login$/, async (req, res) => {
    const limit = ratelimit.check(`admin-login:${clientIp(req)}`, { windowMs: 15 * 60 * 1000, max: 10 });
    if (!limit.allowed) throw new HttpError(429, 'rate_limited', 'Слишком много попыток входа.');
    const body = await parseBody(req);
    const token = cleanString(body.token, 200);
    if (!token || !timingSafeEqual(token, config.adminToken)) {
      await audit.append('admin.login_failed', {}, req);
      throw new HttpError(401, 'unauthorized', 'Неверный токен администратора.');
    }
    await audit.append('admin.login', {}, req);
    sendJson(
      res,
      200,
      { ok: true, mockMode: config.mockMode, defaultToken: config.isDefaultAdminToken },
      {
        'set-cookie': `fm_admin=${encodeURIComponent(config.adminToken)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${
          config.siteUrl.startsWith('https') ? '; Secure' : ''
        }`
      }
    );
  });

  router.post(/^\/api\/admin\/logout$/, async (req, res) => {
    sendJson(res, 200, { ok: true }, { 'set-cookie': 'fm_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
  });

  router.get(/^\/api\/admin\/overview$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    const stats = await bookings.stats();
    const today = availability.forDate(data, stats.todayDate);
    sendJson(res, 200, {
      stats,
      mockMode: config.mockMode,
      defaultAdminToken: config.isDefaultAdminToken,
      timezone: data.settings.timezone,
      serverTime: new Date().toISOString(),
      todaySlots: today,
      recentAudit: await audit.tail(20)
    });
  });

  router.get(/^\/api\/admin\/bookings$/, async (req, res, _params, query) => {
    requireAdmin(req);
    const items = await bookings.list(query);
    sendJson(res, 200, { bookings: items, statuses: bookings.STATUS_LABELS });
  });

  router.patch(/^\/api\/admin\/bookings\/(?<id>[\w-]+)$/, async (req, res, params) => {
    requireAdmin(req);
    const body = await parseBody(req);
    const status = cleanString(body.status, 40);
    const note = cleanString(body.note, 300);
    const updated = await bookings.setStatus(params.id, status, 'admin', note);
    sendJson(res, 200, { ok: true, booking: updated });
  });

  router.get(/^\/api\/admin\/quests$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    sendJson(res, 200, { quests: data.quests });
  });

  router.patch(/^\/api\/admin\/quests\/(?<id>[\w-]+)$/, async (req, res, params) => {
    requireAdmin(req);
    const body = await parseBody(req);
    const updated = await store.transaction(async (data) => {
      const quest = data.quests.find((q) => q.id === params.id || q.slug === params.id);
      if (!quest) throw new HttpError(404, 'not_found', 'Сценарий не найден.');
      const allowed = [
        'name',
        'genre',
        'shortDescription',
        'longDescription',
        'durationMinutes',
        'intensity',
        'ageLimit',
        'minGuests',
        'maxGuests',
        'priceFrom',
        'priceNote',
        'contactLevel',
        'stopWord',
        'suitedFor',
        'active',
        'bookingEnabled',
        'heroImage',
        'gallery'
      ];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          quest[key] = body[key];
          if (key.endsWith('Confirmed') === false) quest[`${key}Confirmed`] = true;
        }
      }
      if (Array.isArray(body.confirmedFields)) {
        for (const field of body.confirmedFields) quest[`${field}Confirmed`] = true;
      }
      quest.updatedAt = new Date().toISOString();
      // Автоматически снимаем пометку «нужно подтвердить» с заполненных полей.
      quest.unconfirmed = (quest.unconfirmed || []).filter((field) => {
        const value = quest[field];
        return value === null || value === undefined || value === '';
      });
      return quest;
    });
    await audit.append('admin.quest_updated', { questId: params.id }, req);
    sendJson(res, 200, { ok: true, quest: updated });
  });

  router.get(/^\/api\/admin\/slots$/, async (req, res, _params, query) => {
    requireAdmin(req);
    const data = await store.read();
    const tz = data.settings.timezone;
    const date = time.isValidDate(query.date) ? query.date : time.todayIn(tz);
    sendJson(res, 200, availability.forDate(data, date, { questId: query.questId }));
  });

  router.post(/^\/api\/admin\/slots\/block$/, async (req, res) => {
    requireAdmin(req);
    const body = await parseBody(req);
    const date = cleanString(body.date, 10);
    const slotTime = cleanString(body.time, 5);
    const blocked = body.blocked !== false;
    const note = cleanString(body.note, 200);
    if (!time.isValidDate(date) || !time.isValidTime(slotTime)) {
      throw new HttpError(422, 'bad_input', 'Нужны date (YYYY-MM-DD) и time (HH:MM).');
    }
    const slot = await store.transaction(async (data) => {
      const id = availability.slotId(date, slotTime);
      let item = data.slots.find((s) => s.id === id);
      if (!item) {
        item = {
          id,
          businessDate: date,
          time: slotTime,
          startIso: time.slotStartInstant(data.settings.timezone, date, slotTime).toISOString(),
          endIso: null,
          capacity: 1,
          booked: 0,
          status: 'open',
          questId: body.questId || null,
          bookingId: null,
          note: null,
          updatedAt: new Date().toISOString()
        };
        data.slots.push(item);
      }
      const hasBooking = availability.isSlotTaken(data, date, slotTime);
      if (blocked && hasBooking) {
        throw new HttpError(409, 'slot_taken', 'Слот занят активной заявкой — сначала отмените заявку.');
      }
      item.status = blocked ? 'blocked' : 'open';
      item.note = note || null;
      item.updatedAt = new Date().toISOString();
      return item;
    });
    await audit.append(blocked ? 'admin.slot_blocked' : 'admin.slot_opened', { date, time: slotTime }, req);
    sendJson(res, 200, { ok: true, slot });
  });

  router.get(/^\/api\/admin\/faq$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    sendJson(res, 200, { faq: data.faq.sort((a, b) => a.order - b.order) });
  });

  router.post(/^\/api\/admin\/faq$/, async (req, res) => {
    requireAdmin(req);
    const body = await parseBody(req);
    const created = await store.transaction(async (data) => {
      const item = {
        id: `faq_${crypto.randomBytes(5).toString('hex')}`,
        question: cleanString(body.question, 200),
        answer: cleanString(body.answer, 1200) || null,
        status: cleanString(body.answer, 10) ? 'published' : 'needs_confirmation',
        confirmed: Boolean(cleanString(body.answer, 1200)),
        placeholder: cleanString(body.placeholder, 400) || null,
        source: null,
        order: Number(body.order) || (data.faq.length + 1) * 10
      };
      if (!item.question) throw new HttpError(422, 'bad_input', 'Нужен текст вопроса.');
      data.faq.push(item);
      return item;
    });
    await audit.append('admin.faq_created', { id: created.id }, req);
    sendJson(res, 201, { ok: true, item: created });
  });

  router.patch(/^\/api\/admin\/faq\/(?<id>[\w-]+)$/, async (req, res, params) => {
    requireAdmin(req);
    const body = await parseBody(req);
    const updated = await store.transaction(async (data) => {
      const item = data.faq.find((f) => f.id === params.id);
      if (!item) throw new HttpError(404, 'not_found', 'Вопрос не найден.');
      if (body.question !== undefined) item.question = cleanString(body.question, 200);
      if (body.answer !== undefined) {
        item.answer = cleanString(body.answer, 1200) || null;
        item.confirmed = Boolean(item.answer);
        item.status = item.answer ? 'published' : 'needs_confirmation';
      }
      if (body.placeholder !== undefined) item.placeholder = cleanString(body.placeholder, 400) || null;
      if (body.order !== undefined) item.order = Number(body.order) || item.order;
      item.updatedAt = new Date().toISOString();
      return item;
    });
    await audit.append('admin.faq_updated', { id: params.id }, req);
    sendJson(res, 200, { ok: true, item: updated });
  });

  router.delete(/^\/api\/admin\/faq\/(?<id>[\w-]+)$/, async (req, res, params) => {
    requireAdmin(req);
    await store.transaction(async (data) => {
      const index = data.faq.findIndex((f) => f.id === params.id);
      if (index === -1) throw new HttpError(404, 'not_found', 'Вопрос не найден.');
      data.faq.splice(index, 1);
    });
    await audit.append('admin.faq_deleted', { id: params.id }, req);
    sendJson(res, 200, { ok: true });
  });

  router.get(/^\/api\/admin\/reviews$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    sendJson(res, 200, { reviews: data.reviews });
  });

  router.post(/^\/api\/admin\/reviews$/, async (req, res) => {
    requireAdmin(req);
    const body = await parseBody(req);
    const text = cleanString(body.text, 1200);
    const author = cleanString(body.author, 80);
    if (!text) throw new HttpError(422, 'bad_input', 'Нужна фактическая цитата отзыва без изменения смысла.');
    const created = await store.transaction(async (data) => {
      const item = {
        id: `rev_${crypto.randomBytes(5).toString('hex')}`,
        author: author || null,
        rating: Number(body.rating) || null,
        text,
        publishedAt: cleanString(body.publishedAt, 10) || null,
        sourceLabel: cleanString(body.sourceLabel, 40) || null,
        sourceUrl: cleanString(body.sourceUrl, 300) || null,
        verified: Boolean(cleanString(body.sourceUrl, 300)),
        status: cleanString(body.sourceUrl, 300) ? 'published' : 'needs_confirmation',
        placeholder: null,
        order: data.reviews.length + 1
      };
      data.reviews.push(item);
      return item;
    });
    await audit.append('admin.review_created', { id: created.id, verified: created.verified }, req);
    sendJson(res, 201, { ok: true, item: created });
  });

  router.patch(/^\/api\/admin\/reviews\/(?<id>[\w-]+)$/, async (req, res, params) => {
    requireAdmin(req);
    const body = await parseBody(req);
    const updated = await store.transaction(async (data) => {
      const item = data.reviews.find((r) => r.id === params.id);
      if (!item) throw new HttpError(404, 'not_found', 'Отзыв не найден.');
      for (const key of ['author', 'text', 'sourceLabel', 'sourceUrl', 'publishedAt', 'placeholder']) {
        if (body[key] !== undefined) item[key] = cleanString(body[key], 1200) || null;
      }
      if (body.rating !== undefined) item.rating = Number(body.rating) || null;
      if (body.verified !== undefined) item.verified = Boolean(body.verified);
      item.status = item.text && item.verified ? 'published' : 'needs_confirmation';
      item.updatedAt = new Date().toISOString();
      return item;
    });
    await audit.append('admin.review_updated', { id: params.id, verified: updated.verified }, req);
    sendJson(res, 200, { ok: true, item: updated });
  });

  router.get(/^\/api\/admin\/settings$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    sendJson(res, 200, { settings: data.settings, locations: data.locations });
  });

  router.patch(/^\/api\/admin\/settings$/, async (req, res) => {
    requireAdmin(req);
    const body = await parseBody(req);
    const updated = await store.transaction(async (data) => {
      const s = data.settings;
      if (body.hours) {
        if (body.hours.shiftStart) s.hours.shiftStart = cleanString(body.hours.shiftStart, 5);
        if (body.hours.shiftEnd) s.hours.shiftEnd = cleanString(body.hours.shiftEnd, 5);
        s.hours.label = `Ежедневно ${s.hours.shiftStart}–${s.hours.shiftEnd}`;
        s.hours.confirmed = true;
      }
      if (body.rating) {
        const r = body.rating;
        if (r.value !== undefined) s.rating.value = Number(r.value);
        if (r.reviewsCount !== undefined) s.rating.reviewsCount = Number(r.reviewsCount);
        if (r.testimonialsCount !== undefined) s.rating.testimonialsCount = Number(r.testimonialsCount);
        if (r.photosCount !== undefined) s.rating.photosCount = Number(r.photosCount);
        s.rating.updatedAt = time.todayIn(s.timezone);
      }
      if (body.notificationChannel) {
        s.notificationChannel.label = cleanString(body.notificationChannel.label, 200);
        s.notificationChannel.confirmed = Boolean(body.notificationChannel.confirmed);
      }
      if (body.contacts) {
        for (const key of ['phone', 'phoneE164', 'whatsappE164', 'whatsappUrl', 'instagramUrl', 'telegramUrl']) {
          if (body.contacts[key] !== undefined) s[key] = cleanString(body.contacts[key], 200);
        }
      }
      if (body.seo) {
        for (const key of ['defaultTitle', 'defaultDescription']) {
          if (body.seo[key] !== undefined) s.seo[key] = cleanString(body.seo[key], 300);
        }
      }
      if (body.resolveUnconfirmed) {
        const key = cleanString(body.resolveUnconfirmed, 60);
        s.unconfirmedFields = (s.unconfirmedFields || []).filter((f) => f.key !== key);
      }
      s.updatedAt = new Date().toISOString();
      return s;
    });
    await audit.append('admin.settings_updated', { keys: Object.keys(body) }, req);
    sendJson(res, 200, { ok: true, settings: updated });
  });

  router.get(/^\/api\/admin\/audit$/, async (req, res, _params, query) => {
    requireAdmin(req);
    sendJson(res, 200, { entries: await audit.tail(Math.min(Number(query.limit) || 100, 500)) });
  });

  router.get(/^\/api\/admin\/customers$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    // Минимум персональных данных: без выгрузки лишних полей.
    sendJson(res, 200, {
      customers: data.customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        messenger: c.messenger,
        bookingsCount: c.bookings.length,
        createdAt: c.createdAt
      }))
    });
  });

  return router;
}

module.exports = { register, isAuthorized, requireAdmin };
