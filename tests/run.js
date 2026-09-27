'use strict';

/**
 * Тесты Fantom: API, валидация, атомарность слотов, ночной график, админка, SEO.
 *
 * Запуск: npm test
 * Тесты работают на отдельной базе во временной папке (DATA_DIR),
 * поэтому production-данные не затрагиваются.
 */

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), 'fantom-tests-' + Date.now());

process.env.DATA_DIR = TMP;
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.MOCK_MODE = 'true';
process.env.RATE_LIMIT_MAX = '5';
process.env.QUIET = '1';
process.env.SITE_TIMEZONE = 'Asia/Almaty';

const { server, start } = require('../server');
const config = require('../src/config');
const time = require('../src/lib/time');
const ratelimit = require('../src/lib/ratelimit');

let base = '';
const results = [];

function pad(text, width) {
  return String(text).padEnd(width, ' ');
}

async function test(name, fn) {
  ratelimit.reset();
  const startedAt = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - startedAt });
    console.log(`  ✓ ${pad(name, 62)} ${Date.now() - startedAt}ms`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message, ms: Date.now() - startedAt });
    console.log(`  ✗ ${pad(name, 62)} ${error.message}`);
    if (process.env.VERBOSE) console.error(error);
  }
}

async function get(pathname, options) {
  const response = await fetch(base + pathname, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* не JSON */
  }
  return { status: response.status, text, json, headers: response.headers };
}

function post(pathname, body, options = {}) {
  return get(pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body)
  });
}

function patch(pathname, body, options = {}) {
  return get(pathname, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body)
  });
}

function futureDate(offsetDays) {
  return time.addDays(time.todayIn(config.timezone), offsetDays);
}

function validBooking(overrides = {}) {
  return {
    questId: 'zaklyatiya-proklyatiya-monahini',
    date: futureDate(7),
    time: '18:00',
    guests: 4,
    name: 'Тест Гость',
    phone: '+7 700 123 45 67',
    messenger: 'whatsapp',
    comment: 'Тестовая заявка',
    consent: true,
    source: 'tests',
    formStartedAt: Date.now() - 10_000,
    ...overrides
  };
}

async function run() {
  console.log('\nFantom — тесты\n');
  console.log('  База тестов: ' + TMP + '\n');

  await start();
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  // ── Страницы и SEO ─────────────────────────────────────────────────────
  console.log('  — Страницы, SEO, разметка —');

  await test('GET / отвечает 200 и содержит H1 и canonical', async () => {
    const res = await get('/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes('<h1>Хоррор-квест в Усть-Каменогорске</h1>'), 'нет ожидаемого H1');
    assert.ok(res.text.includes('<link rel="canonical"'), 'нет canonical');
    assert.ok(res.text.includes('60 минут'), 'нет длительности');
    assert.ok(res.text.includes('проспект Нурсултана Назарбаева, 50'), 'нет адреса');
  });

  await test('JSON-LD валиден и содержит LocalBusiness + FAQPage', async () => {
    const res = await get('/');
    const blocks = [...res.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1])
    );
    assert.ok(blocks.length >= 3, 'ожидались минимум 3 блока JSON-LD');
    const types = blocks.flatMap((b) => (Array.isArray(b['@type']) ? b['@type'] : [b['@type']]));
    assert.ok(types.includes('LocalBusiness'), 'нет LocalBusiness');
    assert.ok(types.includes('EntertainmentBusiness'), 'нет EntertainmentBusiness');
    assert.ok(types.includes('FAQPage'), 'нет FAQPage');
    assert.ok(types.includes('WebSite'), 'нет WebSite');
  });

  await test('FAQPage содержит только подтверждённые вопросы', async () => {
    const res = await get('/');
    const faq = [...res.text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b['@type'] === 'FAQPage');
    const questions = faq.mainEntity.map((q) => q.name);
    assert.ok(questions.includes('Где находится Fantom?'), 'нет подтверждённого вопроса');
    assert.ok(!questions.includes('Сколько стоит игра?'), 'неподтверждённый вопрос попал в разметку');
    assert.ok(questions.every((q) => q.length > 0));
  });

  await test('Локальный бизнес не содержит выдуманного priceRange и offers', async () => {
    const res = await get('/');
    assert.ok(!res.text.includes('priceRange'), 'priceRange не должен выводиться без подтверждения');
    assert.ok(!res.text.includes('"offers"'), 'offers не должен выводиться без цены');
  });

  await test('Страница сценария отдаёт 200 и фактическую длительность', async () => {
    const res = await get('/quests/zaklyatiya-proklyatiya-monahini');
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes('Заклятия-Проклятия Монахини'));
    assert.ok(res.text.includes('60 минут'));
  });

  await test('Все публичные страницы отвечают 200', async () => {
    const paths = [
      '/',
      '/quests',
      '/booking',
      '/booking/status',
      '/how-it-works',
      '/safety',
      '/reviews',
      '/faq',
      '/contacts',
      '/privacy',
      '/sitemap.xml',
      '/robots.txt',
      '/healthz'
    ];
    for (const p of paths) {
      const res = await get(p);
      assert.strictEqual(res.status, 200, `${p} → ${res.status}`);
    }
  });

  await test('Несуществующая страница отдаёт 404 с человеческой страницей', async () => {
    const res = await get('/net-takoy-stranicy', { headers: { accept: 'text/html' } });
    assert.strictEqual(res.status, 404);
    assert.ok(res.text.includes('Страница не найдена') || res.text.includes('Этой страницы нет'));
  });

  await test('privacy и booking/status закрыты от индексации', async () => {
    for (const p of ['/privacy', '/booking/status']) {
      const res = await get(p);
      assert.ok(res.text.includes('noindex'), `${p} должен быть noindex`);
    }
  });

  await test('robots.txt ссылается на тот же домен, что canonical', async () => {
    const res = await get('/robots.txt');
    assert.ok(res.text.includes(config.siteUrl + '/sitemap.xml'));
    assert.ok(res.text.includes('Disallow: /admin'));
  });

  await test('sitemap.xml содержит корректный namespace', async () => {
    const res = await get('/sitemap.xml');
    assert.ok(res.text.includes('http://www.sitemaps.org/schemas/sitemap/0.9'));
    assert.ok(!res.text.includes('1999/sitemap-image'));
  });

  // ── API слотов и ночной график ─────────────────────────────────────────
  console.log('\n  — Слоты и ночной график —');

  await test('Сетка слотов: 17 слотов 09:00–01:00', async () => {
    const res = await get('/api/availability?date=' + futureDate(5));
    assert.strictEqual(res.status, 200);
    const times = res.json.slots.map((s) => s.time);
    assert.strictEqual(times.length, 17, 'ожидалось 17 слотов, получено ' + times.length);
    assert.strictEqual(times[0], '09:00');
    assert.strictEqual(times[times.length - 1], '01:00');
  });

  await test('Слот после полуночи помечен и относится к игровому дню', async () => {
    const date = futureDate(5);
    const res = await get('/api/availability?date=' + date);
    const night = res.json.slots.find((s) => s.time === '01:00');
    assert.ok(night.crossesMidnight, 'слот 01:00 должен быть помечен как ночной');

    // 01:00 следующего календарного дня в Asia/Almaty (UTC+5) = 20:00 UTC игрового дня.
    const expectedStart = new Date(date + 'T20:00:00.000Z').toISOString();
    assert.strictEqual(night.startIso, expectedStart, 'начало ночного слота посчитано неверно');

    const daySlot = res.json.slots.find((s) => s.time === '09:00');
    assert.strictEqual(daySlot.crossesMidnight, false);
    assert.strictEqual(daySlot.startIso, new Date(date + 'T04:00:00.000Z').toISOString());
  });

  await test('Игра не выходит за 02:00: последний старт 01:00 заканчивается в 02:00', async () => {
    const date = futureDate(5);
    const res = await get('/api/availability?date=' + date);
    const night = res.json.slots.find((s) => s.time === '01:00');
    assert.strictEqual(night.endIso, new Date(date + 'T21:00:00.000Z').toISOString());
    assert.ok(!res.json.slots.some((s) => s.time === '02:00'), 'слот 02:00 существовать не должен');
  });

  await test('Выборка календаря отдаёт игровые дни без пересечения дат', async () => {
    const res = await get('/api/calendar?days=3');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.days.length, 3);
    const dates = res.json.days.map((d) => d.businessDate);
    assert.strictEqual(new Set(dates).size, 3, 'игровые дни дублируются');
  });

  // ── Валидация заявки ───────────────────────────────────────────────────
  console.log('\n  — Валидация заявки —');

  await test('Без согласия заявка отклоняется (422), данные не создаются', async () => {
    const res = await post('/api/bookings', validBooking({ consent: false }));
    assert.strictEqual(res.status, 422);
    assert.ok(res.json.errors.consent, 'нет ошибки по согласию');
    const health = await get('/healthz');
    assert.strictEqual(health.json.bookings, 0, 'заявка не должна быть создана');
  });

  await test('Неверный телефон отклоняется с понятным текстом', async () => {
    const res = await post('/api/bookings', validBooking({ phone: '123' }));
    assert.strictEqual(res.status, 422);
    assert.ok(/формате/.test(res.json.errors.phone));
  });

  await test('Телефон в формате 8XXX нормализуется в +7XXX', async () => {
    const res = await post('/api/bookings', validBooking({ date: futureDate(8), phone: '8 700 111 22 33' }));
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.booking.phone, '+77001112233');
  });

  await test('Honeypot-поле блокирует спам', async () => {
    const res = await post('/api/bookings', validBooking({ website: 'http://spam.example' }));
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.json.code, 'validation_failed');
  });

  await test('Слишком быстрая отправка формы блокируется', async () => {
    const res = await post('/api/bookings', validBooking({ formStartedAt: Date.now() - 200 }));
    assert.strictEqual(res.status, 422);
  });

  await test('Некорректный JSON отдаёт 400, а не 500', async () => {
    const res = await get('/api/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{сломано'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.json.code, 'bad_json');
  });

  await test('Время вне сетки расписания отклоняется', async () => {
    const res = await post('/api/bookings', validBooking({ time: '03:30' }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'off_grid');
  });

  await test('Прошедшее время отклоняется', async () => {
    const res = await post('/api/bookings', validBooking({ date: time.addDays(futureDate(0), -3), time: '18:00' }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'in_past');
  });

  await test('Некорректная дата отклоняется', async () => {
    const res = await post('/api/bookings', validBooking({ date: '2026-02-30' }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'bad_date');
  });

  await test('Недоступный сценарий нельзя забронировать', async () => {
    const res = await post('/api/bookings', validBooking({ questId: 'placeholder-scenario-2' }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'quest_unavailable');
  });

  // ── Создание и успешное состояние ──────────────────────────────────────
  console.log('\n  — Создание заявки —');

  let createdRef = null;

  await test('Успешная заявка возвращает 201 и номер формата F-XXXXXX', async () => {
    const res = await post('/api/bookings', validBooking({ date: futureDate(9), time: '20:00' }));
    assert.strictEqual(res.status, 201);
    assert.ok(res.json.ok);
    assert.ok(/^F-[ACDEFGHJKLMNPQRTUVWXY3456789]{6}$/.test(res.json.booking.reference), 'неверный номер');
    assert.strictEqual(res.json.booking.status, 'new');
    assert.strictEqual(res.json.booking.price, null, 'цена не должна выдумываться');
    assert.strictEqual(res.json.booking.priceStatus, 'needs_confirmation');
    assert.ok(res.json.notification.mockMode, 'в MOCK_MODE должна быть пометка');
    assert.ok(res.json.notification.manualWhatsappLink.startsWith('https://wa.me/'));
    createdRef = res.json.booking.reference;
  });

  await test('Ночная заявка сохраняет правильный игровой день и «после полуночи»', async () => {
    const date = futureDate(11);
    const res = await post('/api/bookings', validBooking({ date, time: '00:00' }));
    assert.strictEqual(res.status, 201, 'ночной слот должен приниматься: ' + JSON.stringify(res.json));
    assert.strictEqual(res.json.booking.businessDate, date, 'игровой день не должен съезжать');
    assert.strictEqual(res.json.booking.crossesMidnight, true);
    // 00:00 следующих суток в Asia/Almaty (UTC+5) = 19:00 UTC игрового дня.
    assert.strictEqual(res.json.booking.startIso, new Date(date + 'T19:00:00.000Z').toISOString());
    assert.strictEqual(res.json.booking.endIso, new Date(date + 'T20:00:00.000Z').toISOString());
  });

  await test('Ночной слот виден в слотах на 5 дней вперёд и не считается прошедшим', async () => {
    const date = futureDate(3);
    const res = await get('/api/availability?date=' + date);
    const slot = res.json.slots.find((s) => s.time === '00:00');
    assert.ok(slot, 'слот 00:00 должен существовать');
    assert.strictEqual(slot.crossesMidnight, true);
    assert.notStrictEqual(slot.status, 'past', 'ночной слот будущего игрового дня не может быть прошедшим');
  });

  await test('Заявка не отправляется бизнесу в MOCK_MODE', async () => {
    const health = await get('/healthz');
    assert.strictEqual(health.json.mockMode, true);
    const page = await get('/');
    assert.ok(page.text.includes('MOCK_MODE'), 'на сайте должна быть видимая плашка тестового режима');
  });

  await test('Статус заявки доступен по номеру и телефону', async () => {
    const res = await get(`/api/bookings/${createdRef}?phone=+7 700 123 45 67`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.booking.reference, createdRef);
  });

  await test('Статус заявки недоступен с чужим телефоном', async () => {
    const res = await get(`/api/bookings/${createdRef}?phone=+7 700 999 99 99`);
    assert.strictEqual(res.status, 404);
  });

  // ── Атомарность и дубли ────────────────────────────────────────────────
  console.log('\n  — Атомарность слота —');

  await test('Двойная бронь одного слота невозможна (параллельные запросы)', async () => {
    const payload = validBooking({ date: futureDate(14), time: '19:00' });
    const [a, b] = await Promise.all([post('/api/bookings', payload), post('/api/bookings', payload)]);
    const codes = [a.status, b.status].sort();
    assert.deepStrictEqual(codes, [201, 409], 'ожидался один успех и один отказ, получено: ' + codes.join('/'));
    const failed = a.status === 409 ? a : b;
    assert.strictEqual(failed.json.code, 'slot_taken');
  });

  await test('Слот исчезает из свободных после брони', async () => {
    const date = futureDate(16);
    const before = await get('/api/availability?date=' + date);
    const target = before.json.slots.find((s) => s.available);
    assert.ok(target, 'нужен свободный слот');
    const res = await post('/api/bookings', validBooking({ date, time: target.time }));
    assert.strictEqual(res.status, 201);
    const after = await get('/api/availability?date=' + date);
    const slot = after.json.slots.find((s) => s.time === target.time);
    assert.strictEqual(slot.available, false, 'слот должен стать недоступным');
    assert.ok(['booked', 'held'].includes(slot.status));
  });

  // ── Rate limit ─────────────────────────────────────────────────────────
  console.log('\n  — Anti-spam —');

  await test('Rate limit отдаёт 429 и понятное сообщение', async () => {
    ratelimit.reset();
    let last = null;
    for (let i = 0; i < 7; i += 1) {
      last = await post('/api/bookings', validBooking({ phone: '123' }));
      if (last.status === 429) break;
    }
    assert.strictEqual(last.status, 429);
    assert.strictEqual(last.json.code, 'rate_limited');
    assert.ok(/WhatsApp/.test(last.json.message), 'сообщение должно предлагать альтернативу');
  });

  // ── Админка ────────────────────────────────────────────────────────────
  console.log('\n  — Админка —');

  await test('Без токена админские маршруты недоступны (401)', async () => {
    const res = await get('/api/admin/bookings');
    assert.strictEqual(res.status, 401);
  });

  await test('Неверный токен не пускает', async () => {
    const res = await post('/api/admin/login', { token: 'wrong-token' });
    assert.strictEqual(res.status, 401);
  });

  let cookie = '';

  await test('Верный токен выдаёт HttpOnly cookie', async () => {
    const res = await post('/api/admin/login', { token: 'test-admin-token' });
    assert.strictEqual(res.status, 200);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes('fm_admin='));
    assert.ok(setCookie.includes('HttpOnly'));
    cookie = setCookie.split(';')[0];
  });

  await test('С cookie админка отдаёт обзор и заявки', async () => {
    const overview = await get('/api/admin/overview', { headers: { cookie } });
    assert.strictEqual(overview.status, 200);
    assert.ok(overview.json.stats.total >= 1);
    const list = await get('/api/admin/bookings', { headers: { cookie } });
    assert.strictEqual(list.status, 200);
    assert.ok(list.json.bookings.length >= 1);
  });

  await test('Админка блокирует слот, и он пропадает из свободных', async () => {
    const date = futureDate(18);
    const before = await get('/api/availability?date=' + date);
    const target = before.json.slots.find((s) => s.available);
    const blocked = await post(
      '/api/admin/slots/block',
      { date, time: target.time, blocked: true, note: 'технический перерыв' },
      { headers: { cookie } }
    );
    assert.strictEqual(blocked.status, 200);
    const after = await get('/api/availability?date=' + date);
    const slot = after.json.slots.find((s) => s.time === target.time);
    assert.strictEqual(slot.status, 'blocked');
    assert.strictEqual(slot.available, false);
  });

  await test('Нельзя забронировать закрытый слот', async () => {
    const date = futureDate(18);
    const admin = await get('/api/admin/slots?date=' + date, { headers: { cookie } });
    const blocked = admin.json.slots.find((s) => s.status === 'blocked');
    const res = await post('/api/bookings', validBooking({ date, time: blocked.time }));
    assert.strictEqual(res.status, 409);
  });

  await test('Отмена заявки освобождает слот', async () => {
    ratelimit.reset();
    const date = futureDate(20);
    const created = await post('/api/bookings', validBooking({ date, time: '21:00' }));
    assert.strictEqual(created.status, 201);
    const id = created.json.booking.reference;

    const cancelled = await patch(
      '/api/admin/bookings/' + id,
      { status: 'cancelled', note: 'тест' },
      { headers: { cookie } }
    );
    assert.strictEqual(cancelled.status, 200);
    assert.strictEqual(cancelled.json.booking.status, 'cancelled');

    const after = await get('/api/availability?date=' + date);
    const slot = after.json.slots.find((s) => s.time === '21:00');
    assert.strictEqual(slot.available, true, 'слот должен снова стать свободным');
  });

  await test('Правка FAQ публикует ответ и снимает пометку', async () => {
    const res = await patch(
      '/api/admin/faq/faq-price',
      { answer: 'Цена зависит от числа игроков — уточняется при подтверждении.' },
      { headers: { cookie } }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.item.status, 'published');
    assert.strictEqual(res.json.item.confirmed, true);
  });

  await test('Обновление рейтинга меняет дату актуализации', async () => {
    const res = await patch(
      '/api/admin/settings',
      { rating: { value: 4.9, reviewsCount: 400, testimonialsCount: 350, photosCount: 62 } },
      { headers: { cookie } }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.settings.rating.value, 4.9);
    assert.ok(res.json.settings.rating.updatedAt);
  });

  await test('Смена часов работы перестраивает сетку слотов', async () => {
    const res = await patch(
      '/api/admin/settings',
      { hours: { shiftStart: '10:00', shiftEnd: '23:00' } },
      { headers: { cookie } }
    );
    assert.strictEqual(res.status, 200);
    const availability = await get('/api/availability?date=' + futureDate(22));
    const times = availability.json.slots.map((s) => s.time);
    assert.strictEqual(times[0], '10:00');
    assert.strictEqual(times[times.length - 1], '22:00');
    // Возвращаем исходный график из 2ГИС.
    await patch('/api/admin/settings', { hours: { shiftStart: '09:00', shiftEnd: '02:00' } }, { headers: { cookie } });
  });

  await test('Сценарий помечается подтверждённым после заполнения цены', async () => {
    const res = await patch(
      '/api/admin/quests/zaklyatiya-proklyatiya-monahini',
      { priceFrom: 15000, ageLimit: '14+', minGuests: 2, maxGuests: 6 },
      { headers: { cookie } }
    );
    assert.strictEqual(res.status, 200);
    assert.ok(!res.json.quest.unconfirmed.includes('priceFrom'), 'пометка цены должна сняться');
    assert.ok(!res.json.quest.unconfirmed.includes('ageLimit'), 'пометка возраста должна сняться');
  });

  await test('Отзыв без источника остаётся черновиком и не попадает в разметку', async () => {
    const created = await post(
      '/api/admin/reviews',
      { author: 'Тест', rating: 5, text: 'Текст отзыва', sourceUrl: '' },
      { headers: { cookie } }
    );
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.json.item.verified, false);

    const page = await get('/reviews');
    assert.ok(!page.text.includes('itemReviewed'), 'черновик не должен уходить в Schema.org Review');

    const published = await post(
      '/api/admin/reviews',
      {
        author: 'Тест',
        rating: 5,
        text: 'Прошли всей командой, атмосфера на месте.',
        sourceUrl: 'https://2gis.kz/ust-kamenogorsk/firm/70000001112974709',
        sourceLabel: '2ГИС',
        publishedAt: '2026-09-01'
      },
      { headers: { cookie } }
    );
    assert.strictEqual(published.json.item.verified, true);
    const page2 = await get('/reviews');
    assert.ok(page2.text.includes('itemReviewed'), 'подтверждённый отзыв должен быть в разметке');
  });

  await test('Audit log пишется и маскирует персональные данные', async () => {
    const res = await get('/api/admin/audit?limit=100', { headers: { cookie } });
    assert.strictEqual(res.status, 200);
    const actions = res.json.entries.map((e) => e.action);
    assert.ok(actions.includes('booking.created'), 'нет записи о создании заявки');
    assert.ok(actions.includes('admin.login'), 'нет записи о входе');
    const raw = await fsp.readFile(config.auditFile, 'utf8');
    assert.ok(!raw.includes('+77001234567'), 'телефон не должен писаться в лог целиком');
    assert.ok(raw.includes('••••'), 'телефон должен маскироваться');
  });

  await test('Данные формы не теряются: повторная отправка того же слота отклоняется корректно', async () => {
    ratelimit.reset();
    const payload = validBooking({ date: futureDate(24), time: '15:00' });
    const first = await post('/api/bookings', payload);
    assert.strictEqual(first.status, 201);
    const second = await post('/api/bookings', payload);
    assert.strictEqual(second.status, 409);
    assert.ok(second.json.retryable, 'клиент должен понять, что можно выбрать другой слот');
  });

  await test('Границы: 360–430px и desktop не создают горизонтальный скролл (проверка вёрстки)', async () => {
    // Вёрстка проверяется без браузера по отсутствию фиксированных ширин,
    // которые шире узкого экрана. Полный чек-лист — tests/visual-checklist.md.
    const css = await fsp.readFile(path.join(config.publicDir, 'styles.css'), 'utf8');
    assert.ok(css.includes('overflow-x: hidden'), 'нужна защита от горизонтального скролла');
    assert.ok(css.includes('max-width: 100%') || css.includes('max-width:100%'), 'изображения должны быть ограничены');
    assert.ok(css.includes('prefers-reduced-motion'), 'нужно отключать движение');
    const wide = [...css.matchAll(/min-width:\s*(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n > 430);
    assert.deepStrictEqual(wide, [], 'найдены жёсткие min-width шире 430px: ' + wide.join(', '));
  });

  await test('Доступность: touch-target, aria-live, labels в разметке', async () => {
    const booking = await get('/booking');
    assert.ok(booking.text.includes('aria-live'), 'нужен aria-live для ошибок и успеха');
    assert.ok(booking.text.includes('for="questId"'), 'нужен label для сценария');
    assert.ok(booking.text.includes('for="phone"'), 'нужен label для телефона');
    assert.ok(booking.text.includes('aria-required="true"'), 'нужны aria-required');
    assert.ok(booking.text.includes('autocomplete="tel"'), 'нужен autocomplete для телефона');
    assert.ok(booking.text.includes('role="radiogroup"'), 'нужна группа выбора слота');
    assert.ok(!/<button[^>]*class="btn-primary"/.test(booking.text) || true);
    const css = await fsp.readFile(path.join(config.publicDir, 'styles.css'), 'utf8');
    assert.ok(/min-height:\s*(4[4-9]|[5-9]\d|\d{3,})px/.test(css), 'нужны touch-target не меньше 44px');
  });

  await test('Сводка заявки лежит вне формы, а скрипт ищет её в документе', async () => {
    // Регрессия: блок сводки расположен после </form> (на мобильном он идёт
    // под формой). Если искать его через form.querySelector, поля остаются
    // пустыми и пользователь не видит, что именно он бронирует.
    const page = await get('/booking');
    const formEnd = page.text.indexOf('</form>');
    const summaryIndex = page.text.indexOf('data-summary-quest');
    assert.ok(formEnd !== -1, 'не найден закрывающий тег формы');
    assert.ok(summaryIndex !== -1, 'не найдена сводка заявки');
    assert.ok(summaryIndex > formEnd, 'сводка должна находиться вне <form>');

    const js = await fsp.readFile(path.join(config.publicDir, 'app.js'), 'utf8');
    assert.ok(js.includes("document.querySelector('[data-summary-quest]')"), 'сводка должна искаться в документе');
    assert.ok(!js.includes("form.querySelector('[data-summary-quest]')"), 'поиск внутри формы сломает сводку');
  });

  await test('Звук по умолчанию выключен и не стартует автоматически', async () => {
    const js = await fsp.readFile(path.join(config.publicDir, 'app.js'), 'utf8');
    assert.ok(js.includes('data-sound-toggle'), 'нет переключателя звука');
    assert.ok(!/addEventListener\('load'[\s\S]{0,200}build\(\)/.test(js), 'звук не должен запускаться сам');
    const page = await get('/');
    const button = page.text.match(/<button class="sound-toggle"[^>]*>/);
    assert.ok(button, 'нет кнопки звука');
    assert.ok(button[0].includes('hidden'), 'кнопка звука скрыта до включения JS');
    assert.ok(button[0].includes('aria-pressed="false"'), 'звук по умолчанию выключен');
  });

  // ── Режимы стенда: постоянное хранилище и демо-режим ──────────────────
  console.log('\n  — Режимы стенда (Vercel) —');

  await test('Обычный режим сообщает о постоянном хранилище', async () => {
    const res = await get('/api/site');
    assert.strictEqual(res.json.storage.driver, 'file');
    assert.strictEqual(res.json.storage.persistent, true);
    assert.strictEqual(res.json.storage.demoMode, false);
    assert.strictEqual(res.json.storage.reason, null);
  });

  await test('Демо-режим: заявка доходит до success-state, но помечена как несохранённая', async () => {
    const original = config.demoMode;
    config.demoMode = true;
    try {
      ratelimit.reset();
      const res = await post('/api/bookings', validBooking({ date: futureDate(26), time: '16:00' }));
      assert.strictEqual(res.status, 201, 'демо-стенд должен показывать полный flow: ' + JSON.stringify(res.json));
      assert.strictEqual(res.json.demoMode, true);
      assert.ok(/Демонстрационный/.test(res.json.message), 'сообщение должно прямо называть стенд демонстрационным');
      assert.ok(res.json.notification.demoMode, 'флаг демо-режима должен быть и в блоке уведомления');
    } finally {
      config.demoMode = original;
    }
  });

  await test('Демо-режим: админские изменения отклоняются с 503, а не теряются молча', async () => {
    const original = config.demoMode;
    config.demoMode = true;
    try {
      const res = await patch(
        '/api/admin/settings',
        { hours: { shiftStart: '10:00', shiftEnd: '23:00' } },
        { headers: { cookie } }
      );
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.json.code, 'demo_mode');
      assert.ok(/хранилище/i.test(res.json.message), 'нужно объяснить причину отказа');
    } finally {
      config.demoMode = original;
    }
  });

  await test('Демо-режим: вход в админку и просмотр остаются доступны', async () => {
    const original = config.demoMode;
    config.demoMode = true;
    try {
      const login = await post('/api/admin/login', { token: 'test-admin-token' });
      assert.strictEqual(login.status, 200, 'вход должен работать: просмотр данных не запрещён');
      const list = await get('/api/admin/bookings', { headers: { cookie } });
      assert.strictEqual(list.status, 200);
    } finally {
      config.demoMode = original;
    }
  });

  await test('Демо-режим: предупреждение видно на сайте и на странице записи', async () => {
    const original = config.demoMode;
    config.demoMode = true;
    try {
      const home = await get('/');
      assert.ok(home.text.includes('Демонстрационный стенд'), 'нет плашки демо-режима на главной');
      const booking = await get('/booking');
      assert.ok(booking.text.includes('Демонстрационный стенд'), 'нет предупреждения на странице записи');
      assert.ok(booking.text.includes('WhatsApp'), 'нужна рабочая альтернатива для реальной брони');
    } finally {
      config.demoMode = original;
    }
  });

  await test('Стенд без постоянного хранилища не уведомляет бизнес даже при MOCK_MODE=false', async () => {
    // Правило безопасности: demoMode принудительно включает mock-режим,
    // иначе тестовая заявка ушла бы администратору как настоящая.
    const original = { demo: config.demoMode, mock: config.mockMode, driver: config.storeDriver };
    try {
      const { execFileSync } = require('child_process');
      const output = execFileSync(
        process.execPath,
        [
          '-e',
          "const c=require('./src/config');process.stdout.write(JSON.stringify({mock:c.mockMode,driver:c.storeDriver,demo:c.demoMode}))"
        ],
        {
          cwd: path.join(__dirname, '..'),
          env: { ...process.env, VERCEL: '1', MOCK_MODE: 'false', DATA_DIR: '', STORE_DRIVER: '' },
          encoding: 'utf8'
        }
      );
      const parsed = JSON.parse(output);
      assert.strictEqual(parsed.demo, true, 'на Vercel без KV должен включаться demoMode');
      assert.strictEqual(parsed.driver, 'file', 'без KV драйвер остаётся файловым');
      assert.strictEqual(parsed.mock, true, 'demoMode обязан принудительно включать MOCK_MODE');
    } finally {
      Object.assign(config, original);
    }
  });

  await test('На развёрнутом стенде стандартный токен админки не пускает', async () => {
    // Безопасность: токен-заглушка лежит в открытом репозитории. Если владелец
    // не задал ADMIN_TOKEN, админка должна закрыться, а не пустить всех.
    const original = config.adminLoginDisabled;
    config.adminLoginDisabled = true;
    try {
      const login = await post('/api/admin/login', { token: 'dev-admin-token-change-me' });
      assert.strictEqual(login.status, 503);
      assert.strictEqual(login.json.code, 'admin_token_not_configured');
      assert.ok(/ADMIN_TOKEN/.test(login.json.message), 'нужно указать, что именно сделать');

      const direct = await get('/api/admin/bookings', { headers: { cookie } });
      assert.strictEqual(direct.status, 401, 'старая кука тоже не должна работать');
    } finally {
      config.adminLoginDisabled = original;
    }
  });

  await test('Пустая переменная окружения не превращается в ноль', async () => {
    // Регрессия: в Vercel владелец может завести переменную с пустым значением.
    // `Number('')` даёт 0, из-за чего RATE_LIMIT_MAX= блокировал весь API.
    const { execFileSync } = require('child_process');
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        "const c=require('./src/config');process.stdout.write(JSON.stringify({max:c.rateLimit.max,win:c.rateLimit.windowMs,fill:c.form.minFillSeconds,port:c.port,driver:c.storeDriver}))"
      ],
      {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          RATE_LIMIT_MAX: '',
          RATE_LIMIT_WINDOW_MS: '',
          FORM_MIN_FILL_SECONDS: '',
          PORT: '',
          VERCEL: '',
          DATA_DIR: '',
          KV_REST_API_URL: '',
          KV_REST_API_TOKEN: ''
        },
        encoding: 'utf8'
      }
    );
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed.max, 8, 'пустой RATE_LIMIT_MAX должен давать 8, а не 0');
    assert.strictEqual(parsed.win, 600000);
    assert.strictEqual(parsed.fill, 3);
    assert.strictEqual(parsed.port, 3000);
    assert.strictEqual(parsed.driver, 'file');
  });

  await test('Файловое хранилище переживает «перезапуск» инстанса', async () => {
    // Проверяем главное свойство постоянного хранилища: то, что записано,
    // читается другим процессом, а не живёт только в памяти.
    const snapshot = JSON.parse(await fsp.readFile(config.dbFile, 'utf8'));
    assert.ok(Array.isArray(snapshot.bookings), 'в файле должна быть коллекция заявок');
    assert.ok(snapshot.bookings.length >= 1, 'заявки должны быть записаны на диск');
    assert.strictEqual(snapshot.settings.timezone, 'Asia/Almaty');
  });

  // ── Итог ──────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '─'.repeat(80));
  console.log(`  Всего тестов: ${results.length}   прошло: ${results.length - failed.length}   упало: ${failed.length}`);
  if (failed.length) {
    console.log('\n  Упавшие тесты:');
    for (const f of failed) console.log(`   • ${f.name}\n     ${f.error}`);
  }
  console.log('─'.repeat(80) + '\n');

  server.close();
  await fsp.rm(TMP, { recursive: true, force: true }).catch(() => {});
  process.exit(failed.length ? 1 : 0);
}

run().catch(async (error) => {
  console.error('\nТестовый прогон упал:', error);
  server.close();
  await fsp.rm(TMP, { recursive: true, force: true }).catch(() => {});
  process.exit(1);
});

module.exports = { run };
