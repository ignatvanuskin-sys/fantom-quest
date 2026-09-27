'use strict';

/**
 * REST API.
 *
 * Публичные маршруты:
 *   GET  /api/health         — состояние приложения, хранилища и уведомлений
 *   GET  /api/site           — настройки, локация, источники, режим стенда
 *   GET  /api/packages       — пакеты с реальными ценами
 *   GET  /api/availability   — свободные слоты на дату (?date=YYYY-MM-DD)
 *   GET  /api/calendar       — свободные места на несколько дней
 *   GET  /api/faq, /api/reviews
 *   POST /api/bookings       — создать заявку (идемпотентно)
 *   GET  /api/bookings/:ref  — статус заявки по номеру и телефону
 *
 * Админские маршруты (сессионная кука после входа по паролю,
 * либо Authorization: Bearer <ADMIN_TOKEN>):
 *   POST   /api/admin/login | /api/admin/logout
 *   GET    /api/admin/overview | bookings | customers | audit
 *   PATCH  /api/admin/bookings/:id | /api/admin/packages/:id | /api/admin/settings
 *   GET    /api/admin/slots   POST /api/admin/slots/block
 */

const crypto = require('crypto');
const config = require('../config');
const store = require('../store');
const audit = require('../lib/audit');
const ratelimit = require('../lib/ratelimit');
const session = require('../lib/session');
const time = require('../lib/time');
const availability = require('../services/availability');
const bookings = require('../services/bookings');
const notify = require('../notify');
const { cleanString, normalizePhone } = require('../lib/validate');
const { sendJson, parseBody, clientIp, HttpError } = require('../lib/http');

/* ── Доступ и защита ───────────────────────────────────────────────────── */

function isAuthorized(req) {
  if (config.adminLoginDisabled) return false;
  if (session.verify(session.readCookie(req)).valid) return true;

  const header = String(req.headers.authorization || '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return Boolean(bearer) && session.safeEqual(bearer, config.adminToken);
}

function requireAdmin(req) {
  if (!isAuthorized(req)) {
    throw new HttpError(401, 'unauthorized', 'Нужна авторизация администратора.');
  }
}

/**
 * Защита от CSRF: для изменяющих запросов проверяем Origin/Referer.
 * Сессионная кука стоит SameSite=Strict, но проверка источника закрывает
 * случаи, когда браузер её всё же отправит.
 */
function assertSameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin) return; // серверные вызовы без Origin (curl, тесты) не блокируем
  const allowed = [config.siteUrl, `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`];
  if (!allowed.some((base) => origin.startsWith(base))) {
    throw new HttpError(403, 'bad_origin', 'Запрос пришёл с чужого источника. Обновите страницу и попробуйте снова.');
  }
}

function publicQuest(data) {
  return data.quests[0];
}

/* ── Регистрация маршрутов ─────────────────────────────────────────────── */

function register(router) {
  const publicLimit = (req, scope, options = {}) => {
    const result = ratelimit.check(`${scope}:${clientIp(req)}`, {
      windowMs: options.windowMs || config.rateLimit.windowMs,
      max: options.max || config.rateLimit.max * 6
    });
    if (!result.allowed) {
      throw new HttpError(429, 'rate_limited', 'Слишком много запросов. Попробуйте через минуту.', {
        retryAfterSec: result.retryAfterSec
      });
    }
  };

  /* ── Состояние ────────────────────────────────────────────────────────── */

  const health = async (req, res) => {
    const data = await store.read();
    const tz = data.settings.timezone;
    const today = time.todayIn(tz);
    const day = availability.forDate(data, today);
    const notifyChannels = [
      config.notifications.telegramBotToken && config.notifications.telegramChatId ? 'telegram' : null,
      config.notifications.webhookUrl ? 'webhook' : null,
      config.notifications.emailHttpEndpoint && config.notifications.emailTo ? 'email' : null
    ].filter(Boolean);

    sendJson(res, 200, {
      ok: true,
      version: config.version,
      platform: config.platform,
      timezone: tz,
      serverTime: new Date().toISOString(),
      app: { uptimeSec: Math.round(process.uptime()), node: process.version },
      storage: {
        driver: config.storeDriver,
        persistent: config.persistentStorage,
        demoMode: config.demoMode,
        // Секреты и пути наружу не отдаём.
        writesEnabled: config.persistentStorage && !config.demoMode
      },
      notifications: {
        mockMode: config.mockMode,
        channels: notifyChannels,
        ready: notifyChannels.length > 0 && !config.mockMode
      },
      schedule: {
        shiftStart: data.settings.hours.shiftStart,
        shiftEnd: data.settings.hours.shiftEnd,
        today,
        slotsTotal: day.slots.length,
        slotsOpen: day.openCount,
        bookingsTotal: data.bookings.length
      }
    });
  };

  router.get(/^\/api\/health$/, health);
  router.get(/^\/healthz$/, health);

  /* ── Публичные данные ─────────────────────────────────────────────────── */

  router.get(/^\/api\/site$/, async (req, res) => {
    publicLimit(req, 'site');
    const data = await store.read();
    sendJson(res, 200, {
      settings: data.settings,
      location: data.locations[0],
      quest: publicQuest(data),
      kinoLand: data.kinoLand,
      addons: data.addons,
      sources: data.settings.sources,
      storage: {
        driver: config.storeDriver,
        persistent: config.persistentStorage,
        demoMode: config.demoMode,
        reason: config.demoReason
      },
      serverTime: new Date().toISOString()
    });
  });

  router.get(/^\/api\/packages$/, async (req, res) => {
    publicLimit(req, 'packages');
    const data = await store.read();
    sendJson(res, 200, { packages: data.packages, addons: data.addons });
  });

  router.get(/^\/api\/availability$/, async (req, res, _params, query) => {
    publicLimit(req, 'availability');
    const data = await store.read();
    const tz = data.settings.timezone;
    const date = time.isValidDate(query.date) ? query.date : time.todayIn(tz);
    sendJson(res, 200, availability.forDate(data, date));
  });

  router.get(/^\/api\/calendar$/, async (req, res, _params, query) => {
    publicLimit(req, 'calendar');
    const data = await store.read();
    const days = Math.min(Math.max(Number(query.days) || 14, 1), config.booking.horizonDays);
    const from = time.isValidDate(query.from) ? query.from : undefined;
    sendJson(res, 200, {
      timezone: data.settings.timezone,
      days: availability.upcoming(data, { days, from }).map((day) => ({
        businessDate: day.businessDate,
        label: day.label,
        weekday: day.weekday,
        availableCount: day.availableCount,
        slots: day.slots.map((slot) => ({
          time: slot.time,
          crossesMidnight: slot.crossesMidnight,
          status: slot.status,
          available: slot.available
        }))
      }))
    });
  });

  router.get(/^\/api\/faq$/, async (req, res) => {
    publicLimit(req, 'faq');
    const data = await store.read();
    sendJson(res, 200, {
      published: data.faq.filter((item) => item.status === 'published'),
      needsConfirmation: data.faq.filter((item) => item.status !== 'published')
    });
  });

  router.get(/^\/api\/reviews$/, async (req, res) => {
    publicLimit(req, 'reviews');
    const data = await store.read();
    sendJson(res, 200, {
      rating: data.settings.rating,
      reviews: data.reviews,
      note: 'Публикуются только отзывы с подтверждённым источником. Schema.org Review выводится для них же.'
    });
  });

  /* ── Создание заявки ──────────────────────────────────────────────────── */

  router.post(/^\/api\/bookings$/, async (req, res) => {
    assertSameOrigin(req);

    const limit = ratelimit.check(`booking:${clientIp(req)}`, {
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max
    });
    if (!limit.allowed) {
      await audit.append('booking.rate_limited', { retryAfterSec: limit.retryAfterSec }, req);
      throw new HttpError(429, 'rate_limited', 'Слишком много заявок с одного адреса. Напишите в WhatsApp.', {
        retryAfterSec: limit.retryAfterSec
      });
    }

    const body = await parseBody(req);
    // Ключ идемпотентности приходит от клиента; если его нет — берём заголовок.
    const idempotencyKey =
      cleanString(body.idempotencyKey, 80) || cleanString(req.headers['idempotency-key'], 80) || null;

    try {
      const result = await bookings.create(body, {
        userAgent: req.headers['user-agent'],
        ip: clientIp(req),
        idempotencyKey,
        req
      });

      sendJson(res, result.duplicate ? 200 : 201, {
        ok: true,
        duplicate: Boolean(result.duplicate),
        booking: bookings.publicView(result.booking),
        demoMode: config.demoMode,
        notification: {
          mockMode: result.notification.mockMode,
          demoMode: config.demoMode,
          delivered: (result.notification.channels || []).filter((channel) => channel.ok).map((channel) => channel.channel),
          manualWhatsappLink: result.notification.manual ? result.notification.manual.whatsappLink : null
        },
        message: result.duplicate
          ? `Заявка ${result.booking.reference} уже принята — повторная отправка не создала новую.`
          : config.demoMode
            ? 'Демонстрационный стенд: заявка показана для примера, но не сохранена и не отправлена администратору. Для реальной брони напишите в WhatsApp.'
            : 'Заявка принята. Администратор свяжется по выбранному каналу и подтвердит время.'
      });
    } catch (error) {
      if (error instanceof bookings.BookingError) {
        await audit.append('booking.rejected', { code: error.code }, req);
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

  /* ── Админка ──────────────────────────────────────────────────────────── */

  router.post(/^\/api\/admin\/login$/, async (req, res) => {
    const limit = ratelimit.check(`admin-login:${clientIp(req)}`, { windowMs: 15 * 60 * 1000, max: 8 });
    if (!limit.allowed) {
      await audit.append('admin.login_blocked', {}, req);
      throw new HttpError(429, 'rate_limited', 'Слишком много попыток входа. Попробуйте позже.');
    }

    if (config.adminLoginDisabled) {
      throw new HttpError(
        503,
        'admin_not_configured',
        'Админка отключена: не заданы ADMIN_PASSWORD и собственный ADMIN_TOKEN. ' +
          'Стандартный токен-заглушка опубликован в репозитории и не может быть паролем.'
      );
    }

    const body = await parseBody(req);
    const password = cleanString(body.password, 200);
    const token = cleanString(body.token, 200);

    const okPassword = Boolean(config.adminPassword) && session.safeEqual(password, config.adminPassword);
    const okToken =
      Boolean(token) && !config.isDefaultAdminToken && session.safeEqual(token, config.adminToken);

    if (!okPassword && !okToken) {
      await audit.append('admin.login_failed', { ip: clientIp(req) }, req);
      throw new HttpError(401, 'unauthorized', 'Неверный пароль.');
    }

    await audit.append('admin.login', {}, req);
    sendJson(
      res,
      200,
      {
        ok: true,
        mockMode: config.mockMode,
        demoMode: config.demoMode,
        defaultCredentials: config.isDefaultAdminToken && !config.adminPassword
      },
      {
        'set-cookie': session.cookieHeader(session.issue(), { secure: config.siteUrl.startsWith('https') })
      }
    );
  });

  router.post(/^\/api\/admin\/logout$/, async (req, res) => {
    sendJson(res, 200, { ok: true }, { 'set-cookie': session.clearCookieHeader() });
  });

  router.get(/^\/api\/admin\/overview$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    const stats = await bookings.stats();
    sendJson(res, 200, {
      stats,
      mockMode: config.mockMode,
      demoMode: config.demoMode,
      storage: { driver: config.storeDriver, persistent: config.persistentStorage },
      defaultCredentials: config.isDefaultAdminToken && !config.adminPassword,
      timezone: data.settings.timezone,
      serverTime: new Date().toISOString(),
      todaySlots: availability.forDate(data, stats.todayDate),
      recentAudit: await audit.tail(20),
      notificationsReady: Boolean(
        !config.mockMode &&
          ((config.notifications.telegramBotToken && config.notifications.telegramChatId) ||
            config.notifications.webhookUrl ||
            (config.notifications.emailHttpEndpoint && config.notifications.emailTo))
      )
    });
  });

  router.get(/^\/api\/admin\/bookings$/, async (req, res, _params, query) => {
    requireAdmin(req);
    sendJson(res, 200, {
      bookings: await bookings.list(query),
      statuses: bookings.STATUS_LABELS
    });
  });

  router.patch(/^\/api\/admin\/bookings\/(?<id>[\w-]+)$/, async (req, res, params) => {
    requireAdmin(req);
    assertSameOrigin(req);
    const body = await parseBody(req);
    const updated = await bookings.setStatus(
      params.id,
      cleanString(body.status, 40),
      'admin',
      cleanString(body.note, 300)
    );
    sendJson(res, 200, { ok: true, booking: updated });
  });

  router.get(/^\/api\/admin\/packages$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    sendJson(res, 200, { packages: data.packages, addons: data.addons });
  });

  router.patch(/^\/api\/admin\/packages\/(?<id>[\w-]+)$/, async (req, res, params) => {
    requireAdmin(req);
    assertSameOrigin(req);
    const body = await parseBody(req);
    const updated = await store.transaction(async (data) => {
      const item = data.packages.find((pkg) => pkg.id === params.id);
      if (!item) throw new HttpError(404, 'not_found', 'Пакет не найден.');
      const allowed = ['name', 'tagline', 'priceLabel', 'priceFrom', 'priceNote', 'durationLabel', 'audienceLabel', 'includes', 'confirmed'];
      for (const key of allowed) {
        if (body[key] !== undefined) item[key] = body[key];
      }
      if (Array.isArray(body.includes)) item.includes = body.includes.map((line) => cleanString(line, 220)).filter(Boolean);
      item.updatedAt = new Date().toISOString();
      return item;
    });
    await audit.append('admin.package_updated', { packageId: params.id }, req);
    sendJson(res, 200, { ok: true, package: updated });
  });

  router.get(/^\/api\/admin\/slots$/, async (req, res, _params, query) => {
    requireAdmin(req);
    const data = await store.read();
    const date = time.isValidDate(query.date) ? query.date : time.todayIn(data.settings.timezone);
    sendJson(res, 200, availability.forDate(data, date));
  });

  router.post(/^\/api\/admin\/slots\/block$/, async (req, res) => {
    requireAdmin(req);
    assertSameOrigin(req);
    const body = await parseBody(req);
    const date = cleanString(body.date, 10);
    const slotTime = cleanString(body.time, 5);
    const blocked = body.blocked !== false;
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
          questId: null,
          bookingId: null,
          note: null,
          updatedAt: new Date().toISOString()
        };
        data.slots.push(item);
      }
      if (blocked && availability.isSlotTaken(data, date, slotTime)) {
        throw new HttpError(409, 'slot_taken', 'Слот занят активной заявкой — сначала отмените заявку.');
      }
      item.status = blocked ? 'blocked' : 'open';
      item.note = cleanString(body.note, 200) || null;
      item.updatedAt = new Date().toISOString();
      return item;
    });
    await audit.append(blocked ? 'admin.slot_blocked' : 'admin.slot_opened', { date, time: slotTime }, req);
    sendJson(res, 200, { ok: true, slot });
  });

  router.get(/^\/api\/admin\/customers$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    sendJson(res, 200, {
      customers: data.customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        messenger: customer.messenger,
        bookingsCount: customer.bookings.length,
        createdAt: customer.createdAt
      }))
    });
  });

  router.get(/^\/api\/admin\/settings$/, async (req, res) => {
    requireAdmin(req);
    const data = await store.read();
    sendJson(res, 200, { settings: data.settings, location: data.locations[0], content: data.content });
  });

  router.patch(/^\/api\/admin\/settings$/, async (req, res) => {
    requireAdmin(req);
    assertSameOrigin(req);
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
        for (const key of ['value', 'reviewsCount', 'ratingsCount', 'testimonialsCount', 'photosCount', 'photosWithReviewsCount']) {
          if (r[key] !== undefined) s.rating[key] = Number(r[key]);
        }
        s.rating.updatedAt = time.todayIn(s.timezone);
      }
      if (body.contacts) {
        for (const key of ['phone', 'phoneE164', 'whatsappE164', 'whatsappUrl', 'instagramUrl', 'instagramHandle']) {
          if (body.contacts[key] !== undefined) s[key] = cleanString(body.contacts[key], 200);
        }
      }
      if (body.resolveUnconfirmed) {
        const key = cleanString(body.resolveUnconfirmed, 60);
        s.unconfirmedFields = (s.unconfirmedFields || []).filter((field) => field.key !== key);
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

  router.post(/^\/api\/admin\/test-notification$/, async (req, res) => {
    requireAdmin(req);
    assertSameOrigin(req);
    const data = await store.read();
    const result = await notify.dispatchBooking({
      reference: 'TEST-000000',
      packageName: 'Проверка канала',
      questName: data.quests[0].name,
      businessDate: time.todayIn(data.settings.timezone),
      startTime: '18:00',
      endTime: '19:00',
      timezone: data.settings.timezone,
      guests: 2,
      name: 'Проверка',
      phone: data.settings.phone,
      messengerLabel: 'WhatsApp',
      comment: 'Тестовое уведомление из админки',
      consentAt: new Date().toISOString(),
      source: 'admin-test'
    });
    await audit.append('admin.test_notification', { mockMode: result.mockMode }, req);
    sendJson(res, 200, { ok: result.ok, mockMode: result.mockMode, channels: result.channels });
  });

  return router;
}

module.exports = { register, isAuthorized, requireAdmin };
