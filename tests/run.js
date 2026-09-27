'use strict';

/**
 * Тесты FANTOM: страницы, разметка, слоты и ночной график, валидация,
 * атомарность, идемпотентность, безопасность и админка.
 *
 * Запуск: npm test
 * Тесты работают на отдельной базе (DATA_DIR во временной папке),
 * поэтому реальные данные не затрагиваются.
 */

const assert = require('assert');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = path.join(os.tmpdir(), 'fantom-tests-' + Date.now());

process.env.DATA_DIR = TMP;
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';
process.env.ADMIN_PASSWORD = 'test-password-strong';
process.env.ADMIN_TOKEN = '';
process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
process.env.MOCK_MODE = 'true';
process.env.RATE_LIMIT_MAX = '5';
process.env.QUIET = '1';
process.env.SITE_TIMEZONE = 'Asia/Almaty';
process.env.VERCEL = '';

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
    results.push({ name, ok: true });
    console.log(`  ✓ ${pad(name, 66)} ${Date.now() - startedAt}ms`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`  ✗ ${pad(name, 66)} ${error.message}`);
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

const postJson = (pathname, body, options = {}) =>
  get(pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body)
  });

const patchJson = (pathname, body, options = {}) =>
  get(pathname, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body)
  });

const futureDate = (offsetDays) => time.addDays(time.todayIn(config.timezone), offsetDays);

function validBooking(overrides = {}) {
  return {
    packageId: 'paket-horror',
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

const ldBlocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));

async function run() {
  console.log('\nFANTOM — тесты\n');
  console.log('  Тестовая база: ' + TMP + '\n');

  await start();
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  /* ── Страницы ─────────────────────────────────────────────────────────── */

  console.log('  — Страницы и разметка —');

  const PAGES = [
    ['/', 'Испытай свой страх'],
    ['/quests', 'Кто ждёт внутри'],
    ['/prices', 'Пакеты FANTOM'],
    ['/gallery', 'Кадры, снятые внутри'],
    ['/booking', 'Ваша бронь'],
    ['/reviews', 'Что говорят после игры'],
    ['/faq', 'Частые вопросы'],
    ['/contacts', 'Подвал на Назарбаева, 50'],
    ['/privacy', 'Обработка персональных данных'],
    ['/booking/status', 'Статус заявки'],
    ['/admin', 'Панель заявок']
  ];

  await test('Все публичные страницы отвечают 200 и содержат свой H1/заголовок', async () => {
    for (const [pathname, needle] of PAGES) {
      const res = await get(pathname);
      assert.strictEqual(res.status, 200, `${pathname} → ${res.status}`);
      assert.ok(res.text.includes(needle), `${pathname}: не найден текст «${needle}»`);
    }
  });

  await test('Главная: canonical, OG-картинка, реальные факты', async () => {
    const res = await get('/');
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(res.text);
    assert.ok(canonical && canonical[1].startsWith(config.siteUrl), 'canonical должен указывать на свой домен');
    const og = /property="og:image" content="([^"]+)"/.exec(res.text);
    assert.ok(og && /^https?:\/\/.+\.jpg$/.test(og[1]), 'og:image должен быть абсолютным jpg: ' + (og ? og[1] : 'нет'));
    assert.ok(res.text.includes('og:image:width'), 'нужны размеры OG-картинки для превью');
    assert.ok(res.text.includes('проспект Нурсултана Назарбаева, 50'), 'нет адреса');
    assert.ok(res.text.includes('от 17 500'), 'нет минимальной цены');
    assert.ok(res.text.includes('60 минут'), 'нет длительности');
  });

  await test('JSON-LD: LocalBusiness, Service, OfferCatalog, FAQPage', async () => {
    const blocks = ldBlocks((await get('/')).text);
    const types = blocks.flatMap((block) => (Array.isArray(block['@type']) ? block['@type'] : [block['@type']]));
    assert.ok(types.includes('LocalBusiness'), 'нет LocalBusiness');
    assert.ok(types.includes('EntertainmentBusiness'), 'нет EntertainmentBusiness');
    assert.ok(types.includes('Service'), 'нет Service');
    assert.ok(types.includes('OfferCatalog'), 'нет OfferCatalog');
    assert.ok(types.includes('FAQPage'), 'нет FAQPage');
    assert.ok(types.includes('WebSite'), 'нет WebSite');
  });

  await test('В разметке нет aggregateRating: рейтинг собран 2ГИС, а не сайтом', async () => {
    const home = await get('/');
    assert.ok(!home.text.includes('aggregateRating'), 'aggregateRating не должен выводиться по умолчанию');
  });

  await test('FAQPage содержит только вопросы с подтверждённым ответом', async () => {
    const faq = ldBlocks((await get('/')).text).find((block) => block['@type'] === 'FAQPage');
    const questions = faq.mainEntity.map((item) => item.name);
    assert.ok(questions.includes('Сколько длится квест?'), 'нет подтверждённого вопроса');
    assert.ok(!questions.includes('Нужна ли предоплата?'), 'неподтверждённый вопрос попал в разметку');
  });

  await test('Цены и режимы игры взяты из реальных источников', async () => {
    const prices = await get('/prices');
    for (const amount of ['30 000', '36 500', '50 000', '17 500']) {
      assert.ok(prices.text.includes(amount), `нет цены ${amount}`);
    }
    const quests = await get('/quests');
    for (const mode of ['Детский — без спецэффектов', 'Средний — с контактом', 'Хард 18+']) {
      assert.ok(quests.text.includes(mode), `нет режима «${mode}»`);
    }
    for (const character of ['Монахиня', 'Клоун Эдди', 'Самара']) {
      assert.ok(quests.text.includes(character), `нет персонажа «${character}»`);
    }
  });

  await test('На сайте опубликованы реальные отзывы с источником', async () => {
    const res = await get('/reviews');
    assert.ok(res.text.includes('Назерке Амангельдиева'), 'нет реального автора отзыва');
    assert.ok(res.text.includes('было очень страшно'), 'нет текста отзыва');
    assert.ok(res.text.includes('Ответ FANTOM'), 'нет ответа организации');
  });

  await test('privacy и booking/status закрыты от индексации, /admin закрыт в robots', async () => {
    for (const pathname of ['/privacy', '/booking/status']) {
      assert.ok((await get(pathname)).text.includes('noindex'), `${pathname} должен быть noindex`);
    }
    const robots = await get('/robots.txt');
    assert.ok(robots.text.includes('Disallow: /admin'));
    assert.ok(robots.text.includes(`${config.siteUrl}/sitemap.xml`));
  });

  await test('sitemap.xml содержит корректный namespace и все разделы', async () => {
    const res = await get('/sitemap.xml');
    assert.ok(res.text.includes('http://www.sitemaps.org/schemas/sitemap/0.9'));
    for (const pathname of ['/prices', '/gallery', '/quests', '/booking']) {
      assert.ok(res.text.includes(config.siteUrl + pathname), `нет ${pathname} в sitemap`);
    }
  });

  await test('Несуществующая страница отдаёт человеческую 404', async () => {
    const res = await get('/net-takoy-stranicy', { headers: { accept: 'text/html' } });
    assert.strictEqual(res.status, 404);
    assert.ok(res.text.includes('Здесь темно и пусто'));
  });

  /* ── Слоты и ночной график ────────────────────────────────────────────── */

  console.log('\n  — Слоты и ночной график —');

  await test('Сетка слотов: 17 слотов от 09:00 до 01:00', async () => {
    const res = await get('/api/availability?date=' + futureDate(5));
    const times = res.json.slots.map((slot) => slot.time);
    assert.strictEqual(times.length, 17, 'ожидалось 17 слотов');
    assert.strictEqual(times[0], '09:00');
    assert.strictEqual(times[times.length - 1], '01:00');
  });

  await test('Ночной слот относится к предыдущему игровому дню (UTC+5)', async () => {
    const date = futureDate(5);
    const res = await get('/api/availability?date=' + date);
    const night = res.json.slots.find((slot) => slot.time === '01:00');
    assert.ok(night.crossesMidnight, '01:00 должен быть помечен как ночной');
    assert.strictEqual(night.startIso, new Date(date + 'T20:00:00.000Z').toISOString());
    assert.strictEqual(night.endIso, new Date(date + 'T21:00:00.000Z').toISOString());
    const day = res.json.slots.find((slot) => slot.time === '09:00');
    assert.strictEqual(day.startIso, new Date(date + 'T04:00:00.000Z').toISOString());
  });

  await test('Час игры не выходит за 02:00 — слота 02:00 не существует', async () => {
    const res = await get('/api/availability?date=' + futureDate(5));
    assert.ok(!res.json.slots.some((slot) => slot.time === '02:00'));
  });

  await test('Календарь отдаёт игровые дни без дублей', async () => {
    const res = await get('/api/calendar?days=4');
    const dates = res.json.days.map((day) => day.businessDate);
    assert.strictEqual(dates.length, 4);
    assert.strictEqual(new Set(dates).size, 4);
    assert.ok(res.json.days[0].label.length > 5, 'нужна человеческая подпись дня');
  });

  /* ── Валидация ────────────────────────────────────────────────────────── */

  console.log('\n  — Валидация заявки —');

  await test('Без согласия заявка отклоняется и не создаётся', async () => {
    const res = await postJson('/api/bookings', validBooking({ consent: false }));
    assert.strictEqual(res.status, 422);
    assert.ok(res.json.errors.consent);
    const health = await get('/api/health');
    assert.strictEqual(health.json.schedule.bookingsTotal, 0);
  });

  await test('Неверный телефон отклоняется с понятным текстом', async () => {
    const res = await postJson('/api/bookings', validBooking({ phone: '123' }));
    assert.strictEqual(res.status, 422);
    assert.ok(/формате/.test(res.json.errors.phone));
  });

  await test('Телефон 8XXX нормализуется в +7XXX', async () => {
    const res = await postJson('/api/bookings', validBooking({ date: futureDate(8), phone: '8 700 111 22 33' }));
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.json.booking.phone, '+77001112233');
  });

  await test('Honeypot блокирует ботов', async () => {
    const res = await postJson('/api/bookings', validBooking({ website: 'http://spam.example' }));
    assert.strictEqual(res.status, 422);
  });

  await test('Слишком быстрая отправка формы блокируется', async () => {
    const res = await postJson('/api/bookings', validBooking({ formStartedAt: Date.now() - 200 }));
    assert.strictEqual(res.status, 422);
  });

  await test('Битый JSON даёт 400, а не 500', async () => {
    const res = await get('/api/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{сломано'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.json.code, 'bad_json');
  });

  await test('Время вне сетки расписания отклоняется', async () => {
    const res = await postJson('/api/bookings', validBooking({ time: '03:30' }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'off_grid');
  });

  await test('Прошедшее время отклоняется', async () => {
    const res = await postJson('/api/bookings', validBooking({ date: time.addDays(futureDate(0), -3) }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'in_past');
  });

  await test('Некорректная дата отклоняется', async () => {
    const res = await postJson('/api/bookings', validBooking({ date: '2026-02-30' }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'bad_date');
  });

  await test('Несуществующий пакет отклоняется', async () => {
    const res = await postJson('/api/bookings', validBooking({ packageId: 'net-takogo-paketa' }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'package_not_found');
  });

  await test('Неподтверждённый пакет (Level 3) нельзя забронировать', async () => {
    const res = await postJson('/api/bookings', validBooking({ packageId: 'level-3' }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'package_unavailable');
  });

  /* ── Создание заявки и идемпотентность ────────────────────────────────── */

  console.log('\n  — Создание заявки —');

  let createdRef = null;

  await test('Заявка создаётся, номер формата F-XXXXXX, пакет и цена из прайса', async () => {
    const res = await postJson('/api/bookings', validBooking({ date: futureDate(9), time: '20:00' }));
    assert.strictEqual(res.status, 201, JSON.stringify(res.json));
    assert.ok(/^F-[ACDEFGHJKLMNPQRTUVWXY3456789]{6}$/.test(res.json.booking.reference));
    assert.strictEqual(res.json.booking.packageName, 'Пакет Хоррор');
    assert.ok(res.json.booking.packagePriceLabel.includes('17 500'));
    assert.strictEqual(res.json.booking.status, 'new');
    assert.strictEqual(res.json.demoMode, false);
    createdRef = res.json.booking.reference;
  });

  await test('Повторная отправка с тем же ключом не создаёт вторую заявку', async () => {
    const key = 'idem-' + Date.now();
    const payload = validBooking({ date: futureDate(10), time: '21:00', idempotencyKey: key });
    const first = await postJson('/api/bookings', payload);
    assert.strictEqual(first.status, 201);
    const second = await postJson('/api/bookings', payload);
    assert.strictEqual(second.status, 200, 'повтор должен вернуть уже созданную заявку');
    assert.strictEqual(second.json.duplicate, true);
    assert.strictEqual(second.json.booking.reference, first.json.booking.reference);
  });

  await test('Ночная заявка сохраняет игровой день', async () => {
    const date = futureDate(11);
    const res = await postJson('/api/bookings', validBooking({ date, time: '00:00' }));
    assert.strictEqual(res.status, 201, JSON.stringify(res.json));
    assert.strictEqual(res.json.booking.businessDate, date);
    assert.strictEqual(res.json.booking.crossesMidnight, true);
    assert.strictEqual(res.json.booking.endIso, new Date(date + 'T20:00:00.000Z').toISOString());
  });

  await test('Статус заявки доступен по номеру и телефону, но не с чужим', async () => {
    const ok = await get(`/api/bookings/${createdRef}?phone=+7 700 123 45 67`);
    assert.strictEqual(ok.status, 200);
    const foreign = await get(`/api/bookings/${createdRef}?phone=+7 700 999 99 99`);
    assert.strictEqual(foreign.status, 404);
  });

  /* ── Атомарность ──────────────────────────────────────────────────────── */

  console.log('\n  — Атомарность —');

  await test('Двойная бронь одного слота невозможна (параллельные запросы)', async () => {
    const payload = validBooking({ date: futureDate(14), time: '19:00' });
    const [a, b] = await Promise.all([postJson('/api/bookings', payload), postJson('/api/bookings', payload)]);
    const codes = [a.status, b.status].sort();
    assert.deepStrictEqual(codes, [201, 409], 'ожидался один успех и один отказ: ' + codes.join('/'));
  });

  await test('Слот исчезает из свободных после брони и возвращается после отмены', async () => {
    const date = futureDate(16);
    const before = await get('/api/availability?date=' + date);
    const target = before.json.slots.find((slot) => slot.available);
    const created = await postJson('/api/bookings', validBooking({ date, time: target.time }));
    assert.strictEqual(created.status, 201);

    const after = await get('/api/availability?date=' + date);
    assert.strictEqual(after.json.slots.find((slot) => slot.time === target.time).available, false);
  });

  await test('Rate limit защищает форму от ботов', async () => {
    ratelimit.reset();
    let last = null;
    for (let i = 0; i < 8; i += 1) {
      last = await postJson('/api/bookings', validBooking({ phone: '123' }));
      if (last.status === 429) break;
    }
    assert.strictEqual(last.status, 429);
    assert.ok(/WhatsApp/.test(last.json.message));
  });

  /* ── Безопасность ─────────────────────────────────────────────────────── */

  console.log('\n  — Безопасность —');

  await test('Запрос с чужого Origin отклоняется (CSRF)', async () => {
    const res = await postJson(
      '/api/bookings',
      validBooking({ date: futureDate(20) }),
      { headers: { origin: 'https://evil.example' } }
    );
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.code, 'bad_origin');
  });

  await test('Админские маршруты без сессии недоступны', async () => {
    assert.strictEqual((await get('/api/admin/bookings')).status, 401);
    assert.strictEqual((await get('/api/admin/overview')).status, 401);
  });

  await test('Неверный пароль не пускает, вход ограничен по частоте', async () => {
    ratelimit.reset();
    const res = await postJson('/api/admin/login', { password: 'wrong-password' });
    assert.strictEqual(res.status, 401);
  });

  let cookie = '';

  await test('Верный пароль выдаёт HttpOnly-сессию', async () => {
    const res = await postJson('/api/admin/login', { password: 'test-password-strong' });
    assert.strictEqual(res.status, 200);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes('fantom_session='), 'нет куки сессии');
    assert.ok(setCookie.includes('HttpOnly'), 'кука должна быть HttpOnly');
    assert.ok(setCookie.includes('SameSite=Strict'), 'кука должна быть SameSite=Strict');
    cookie = setCookie.split(';')[0];
  });

  await test('Подделанная кука сессии не проходит', async () => {
    const forged = cookie.replace(/.$/, cookie.endsWith('A') ? 'B' : 'A');
    assert.strictEqual((await get('/api/admin/bookings', { headers: { cookie: forged } })).status, 401);
  });

  await test('Со своей сессией админка отдаёт обзор и заявки', async () => {
    const overview = await get('/api/admin/overview', { headers: { cookie } });
    assert.strictEqual(overview.status, 200);
    assert.ok(overview.json.stats.total >= 1);
    const list = await get('/api/admin/bookings', { headers: { cookie } });
    assert.ok(list.json.bookings.length >= 1);
    assert.ok(list.json.statuses.confirmed, 'нужны человеческие названия статусов');
  });

  await test('Health-check отдаёт состояние без секретов', async () => {
    const res = await get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.ok(res.json.storage && res.json.notifications && res.json.schedule);
    const raw = JSON.stringify(res.json);
    for (const secret of ['ADMIN_PASSWORD', 'test-password-strong', config.adminToken]) {
      if (secret) assert.ok(!raw.includes(secret), 'в health не должно быть секретов');
    }
  });

  /* ── Админские операции ───────────────────────────────────────────────── */

  console.log('\n  — Операции админки —');

  await test('Смена статуса заявки освобождает слот при отмене', async () => {
    ratelimit.reset();
    const date = futureDate(22);
    const created = await postJson('/api/bookings', validBooking({ date, time: '21:00' }));
    assert.strictEqual(created.status, 201);

    const cancelled = await patchJson(
      '/api/admin/bookings/' + created.json.booking.reference,
      { status: 'cancelled', note: 'тест' },
      { headers: { cookie } }
    );
    assert.strictEqual(cancelled.status, 200);
    assert.strictEqual(cancelled.json.booking.status, 'cancelled');

    const after = await get('/api/availability?date=' + date);
    assert.strictEqual(after.json.slots.find((slot) => slot.time === '21:00').available, true);
  });

  await test('Админ закрывает слот, и он пропадает из свободных', async () => {
    const date = futureDate(24);
    const before = await get('/api/availability?date=' + date);
    const target = before.json.slots.find((slot) => slot.available);
    const blocked = await postJson(
      '/api/admin/slots/block',
      { date, time: target.time, blocked: true, note: 'техперерыв' },
      { headers: { cookie } }
    );
    assert.strictEqual(blocked.status, 200);
    const after = await get('/api/availability?date=' + date);
    const slot = after.json.slots.find((item) => item.time === target.time);
    assert.strictEqual(slot.status, 'blocked');
    assert.strictEqual(slot.available, false);
  });

  await test('Закрытый слот нельзя забронировать даже через API', async () => {
    const date = futureDate(24);
    const admin = await get('/api/admin/slots?date=' + date, { headers: { cookie } });
    const blocked = admin.json.slots.find((slot) => slot.status === 'blocked');
    const res = await postJson('/api/bookings', validBooking({ date, time: blocked.time }));
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.json.code, 'slot_blocked');
  });

  await test('Правка цены пакета меняет её на сайте', async () => {
    const res = await patchJson(
      '/api/admin/packages/level-mini',
      { priceFrom: 31000, priceLabel: '31 000 ₸' },
      { headers: { cookie } }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.package.priceFrom, 31000);
    const site = await get('/prices');
    assert.ok(site.text.includes('31 000 ₸'), 'новая цена должна появиться на сайте');
  });

  await test('Снятие подтверждения убирает пакет из формы записи', async () => {
    await patchJson('/api/admin/packages/level-2', { confirmed: false }, { headers: { cookie } });
    const booking = await get('/booking');
    assert.ok(!booking.text.includes('data-package="level-2"'), 'неподтверждённый пакет не должен предлагаться');
    await patchJson('/api/admin/packages/level-2', { confirmed: true }, { headers: { cookie } });
  });

  await test('Смена часов работы перестраивает сетку слотов', async () => {
    const res = await patchJson(
      '/api/admin/settings',
      { hours: { shiftStart: '10:00', shiftEnd: '23:00' } },
      { headers: { cookie } }
    );
    assert.strictEqual(res.status, 200);
    const availability = await get('/api/availability?date=' + futureDate(26));
    const times = availability.json.slots.map((slot) => slot.time);
    assert.strictEqual(times[0], '10:00');
    assert.strictEqual(times[times.length - 1], '22:00');
    await patchJson('/api/admin/settings', { hours: { shiftStart: '09:00', shiftEnd: '02:00' } }, { headers: { cookie } });
  });

  await test('Обновление рейтинга меняет дату актуализации', async () => {
    const res = await patchJson(
      '/api/admin/settings',
      { rating: { value: 4.9, reviewsCount: 350, ratingsCount: 400, photosCount: 63 } },
      { headers: { cookie } }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.settings.rating.value, 4.9);
    assert.ok(res.json.settings.rating.updatedAt);
  });

  await test('Audit log пишется и маскирует персональные данные', async () => {
    const res = await get('/api/admin/audit?limit=100', { headers: { cookie } });
    const actions = res.json.entries.map((entry) => entry.action);
    assert.ok(actions.includes('booking.created'));
    assert.ok(actions.includes('admin.login'));
    assert.ok(actions.includes('booking.duplicate_submit'), 'повторная отправка должна попадать в журнал');
    const raw = await fsp.readFile(config.auditFile, 'utf8');
    assert.ok(!raw.includes('+77001234567'), 'телефон не должен писаться целиком');
    assert.ok(raw.includes('••••'), 'телефон должен маскироваться');
  });

  /* ── Режимы стенда ────────────────────────────────────────────────────── */

  console.log('\n  — Режимы стенда —');

  await test('Технические детали стенда не попадают в ответ пользователю', async () => {
    const original = config.demoMode;
    config.demoMode = true;
    try {
      ratelimit.reset();
      const res = await postJson('/api/bookings', validBooking({ date: futureDate(28), time: '16:00' }));
      assert.strictEqual(res.status, 201);
      const message = String(res.json.message).toLowerCase();
      for (const word of ['демо', 'demo', 'mock', 'хранилищ', 'не сохран', 'не отправ', 'режим стенда']) {
        assert.ok(!message.includes(word), `в ответе пользователю найдено «${word}»: ${res.json.message}`);
      }
      assert.ok(/Администратор свяжется/.test(res.json.message), 'ответ должен описывать обычный сценарий');
    } finally {
      config.demoMode = original;
    }
  });

  await test('Демо-режим: изменения из админки отклоняются с объяснением', async () => {
    const original = config.demoMode;
    config.demoMode = true;
    try {
      const res = await patchJson('/api/admin/settings', { hours: { shiftStart: '10:00' } }, { headers: { cookie } });
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.json.code, 'demo_mode');
      assert.ok(/хранилище/i.test(res.json.message));
    } finally {
      config.demoMode = original;
    }
  });

  await test('Публичный интерфейс не сообщает о техническом режиме стенда', async () => {
    // Требование брифа: посетитель не должен знать, какая база используется,
    // подключено ли хранилище, работает ли mock и настроены ли уведомления.
    const forbidden = [
      'Демонстрацион',
      'MOCK_MODE',
      'demoMode',
      'демо-режим',
      'Демо-режим',
      'не сохраняется',
      'не дойдёт',
      'не отправляются',
      'Development mode',
      'Test booking',
      'storage disabled'
    ];
    const paths = ['/', '/quests', '/prices', '/gallery', '/booking', '/reviews', '/faq', '/contacts', '/booking/status'];

    // Проверяем в обоих режимах: демо и обычном.
    const original = config.demoMode;
    try {
      for (const demo of [true, false]) {
        config.demoMode = demo;
        for (const pathname of paths) {
          const res = await get(pathname);
          for (const word of forbidden) {
            assert.ok(!res.text.includes(word), `${pathname} (demo=${demo}): в интерфейсе найдено «${word}»`);
          }
        }
      }
    } finally {
      config.demoMode = original;
    }
  });

  await test('На развёрнутом стенде стандартный токен не пускает', async () => {
    const original = config.adminLoginDisabled;
    config.adminLoginDisabled = true;
    try {
      const login = await postJson('/api/admin/login', { token: 'dev-admin-token-change-me' });
      assert.strictEqual(login.status, 503);
      assert.ok(/ADMIN_PASSWORD/.test(login.json.message));
      assert.strictEqual((await get('/api/admin/bookings', { headers: { cookie } })).status, 401);
    } finally {
      config.adminLoginDisabled = original;
    }
  });

  await test('Пустая переменная окружения не превращается в ноль', async () => {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        "const c=require('./src/config');process.stdout.write(JSON.stringify({max:c.rateLimit.max,win:c.rateLimit.windowMs,fill:c.form.minFillSeconds,port:c.port,driver:c.storeDriver,mock:c.mockMode}))"
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
    assert.strictEqual(parsed.max, 8);
    assert.strictEqual(parsed.win, 600000);
    assert.strictEqual(parsed.fill, 3);
    assert.strictEqual(parsed.port, 3000);
    assert.strictEqual(parsed.driver, 'file');
  });

  await test('Стенд без постоянного хранилища не уведомляет бизнес', async () => {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        "const c=require('./src/config');process.stdout.write(JSON.stringify({mock:c.mockMode,demo:c.demoMode,mockEnv:process.env.MOCK_MODE}))"
      ],
      {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, VERCEL: '1', MOCK_MODE: 'false', DATA_DIR: '', STORE_DRIVER: '' },
        encoding: 'utf8'
      }
    );
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed.demo, true);
    assert.strictEqual(parsed.mock, true, 'demoMode обязан принудительно включать MOCK_MODE');
  });

  /* ── Интерфейс и доступность ──────────────────────────────────────────── */

  console.log('\n  — Интерфейс —');

  /**
   * Убирает @media-блоки, чтобы проверять только базовые (mobile-first) правила.
   * Медиа-запросы по определению используют min-width и не создают переполнения.
   */
  function withoutMediaQueries(css) {
    let out = '';
    let index = 0;
    while (index < css.length) {
      const start = css.indexOf('@media', index);
      if (start === -1) {
        out += css.slice(index);
        break;
      }
      out += css.slice(index, start);
      let cursor = css.indexOf('{', start);
      if (cursor === -1) break;
      let depth = 0;
      while (cursor < css.length) {
        if (css[cursor] === '{') depth += 1;
        else if (css[cursor] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
        cursor += 1;
      }
      index = cursor + 1;
    }
    return out;
  }

  await test('Вёрстка: базовые стили без жёстких ширин > 430px, motion отключается', async () => {
    const css = await fsp.readFile(path.join(config.publicDir, 'styles.css'), 'utf8');
    assert.ok(css.includes('prefers-reduced-motion'), 'нужно отключать движение');
    assert.ok(css.includes('[hidden]'), 'нужно правило для атрибута hidden');
    const base = withoutMediaQueries(css);
    const wide = [...base.matchAll(/min-width:\s*(\d+)px/g)]
      .map((match) => Number(match[1]))
      .filter((n) => n > 430);
    assert.deepStrictEqual(wide, [], 'жёсткие min-width > 430px в базовых стилях: ' + wide.join(', '));
    const fixed = [...base.matchAll(/[^-]width:\s*(\d{4,})px/g)].map((match) => Number(match[1])).filter((n) => n > 430);
    assert.deepStrictEqual(fixed, [], 'фиксированные ширины в базовых стилях: ' + fixed.join(', '));
  });

  await test('Вёрстка: у каждой страницы ровно один H1', async () => {
    const paths = [
      '/',
      '/quests',
      '/prices',
      '/gallery',
      '/reviews',
      '/faq',
      '/contacts',
      '/privacy',
      '/booking',
      '/booking/status'
    ];
    for (const path of paths) {
      const res = await get(path);
      const count = (res.text.match(/<h1[\s>]/g) || []).length;
      assert.strictEqual(count, 1, `${path}: найдено H1 в разметке — ${count}`);
    }
  });

  await test('Русский язык: числа согласованы с существительными', async () => {
    const { plural } = require('../src/views/sections');

    assert.strictEqual(plural(1, 'отзыв', 'отзыва', 'отзывов'), 'отзыв');
    assert.strictEqual(plural(3, 'отзыв', 'отзыва', 'отзывов'), 'отзыва');
    assert.strictEqual(plural(5, 'отзыв', 'отзыва', 'отзывов'), 'отзывов');
    assert.strictEqual(plural(11, 'отзыв', 'отзыва', 'отзывов'), 'отзывов');
    assert.strictEqual(plural(21, 'отзыв', 'отзыва', 'отзывов'), 'отзыв');
    assert.strictEqual(plural(343, 'отзыв', 'отзыва', 'отзывов'), 'отзыва');
    assert.strictEqual(plural(0, 'отзыв', 'отзыва', 'отзывов'), 'отзывов');

    const home = await get('/');
    for (const wrong of ['5 уровня страха', '5 режима страха', 'и ещё 1 пункта', '2 человек включено']) {
      assert.ok(!home.text.includes(wrong), `число не согласовано: «${wrong}»`);
    }
    assert.ok(home.text.includes('уровней страха'), 'нужна форма «уровней страха»');
  });

  await test('Запись: число гостей по умолчанию берётся из программы', async () => {
    const horror = await get('/booking?package=paket-horror');
    const horrorGuests = horror.text.match(/id="guests" value="(\d+)"/);
    assert.ok(horrorGuests, 'нет поля guests');
    assert.strictEqual(horrorGuests[1], '2', 'в «Пакет Хоррор» включено 2 человека');
    assert.ok(horror.text.includes('data-package-guests="2"'), 'программа должна сообщать, сколько человек включено');
    assert.ok(horror.text.includes('data-summary-note'), 'в сводке нужна строка с прайс-листом');

    const mini = await get('/booking?package=level-mini');
    const miniGuests = mini.text.match(/id="guests" value="(\d+)"/);
    assert.strictEqual(miniGuests[1], '6', 'в Level mini включено 6 человек');
  });

  await test('Занятость: «всего свободно» одинаково на всех страницах', async () => {
    const found = [];
    for (const pathname of ['/', '/quests']) {
      const page = await get(pathname);
      const match = /Всего свободно (\d+) (?:слот|слота|слотов)/.exec(page.text);
      assert.ok(match, `${pathname}: нет строки «Всего свободно»`);
      found.push({ pathname, total: Number(match[1]) });
    }
    // Страницы рендерятся из одного контекста, поэтому и горизонт, и подсчёт
    // обязаны совпадать. Раньше главная считала 30 дней, а страница квеста 14,
    // и блок показывал «501» против «229» в один момент времени.
    for (const item of found) {
      assert.strictEqual(
        item.total,
        found[0].total,
        `${item.pathname}: ${item.total} свободных слотов, а ${found[0].pathname}: ${found[0].total}`
      );
    }
    assert.ok(found[0].total > 0, 'свободных слотов не найдено вовсе');
  });

  await test('Ссылки на админку нет в публичной части сайта', async () => {
    for (const pathname of ['/', '/quests', '/prices', '/booking', '/faq', '/contacts']) {
      const page = await get(pathname);
      assert.ok(
        !page.text.includes('href="/admin"'),
        `${pathname}: в разметке осталась ссылка на /admin`
      );
    }
  });

  await test('Кадр hero: адаптивные размеры, предзагрузка только на главной', async () => {
    const home = await get('/');
    assert.ok(
      /<img[^>]*nun-hood-900\.webp[^>]*srcset="[^"]*nun-hood-1440\.webp 1440w/.test(home.text),
      'у кадра hero нет srcset с двумя размерами'
    );
    const preload = /<link rel="preload" as="image"[^>]*>/.exec(home.text);
    assert.ok(preload, 'на главной нет предзагрузки кадра hero');
    assert.ok(preload[0].includes('imagesrcset'), 'предзагрузка не адаптивная');
    assert.ok(
      preload[0].includes('nun-hood-1440.webp'),
      'предзагрузка описывает не тот же набор файлов, что и img — файл скачается дважды'
    );

    // На внутренних страницах кадра hero нет, значит и предзагружать нечего.
    const inner = await get('/gallery');
    assert.ok(!inner.text.includes('as="image"'), 'на внутренней странице лишняя предзагрузка картинки');
  });

  await test('Витрина слотов не выдаёт себя за полный список', async () => {
    const home = await get('/');
    if (!home.text.includes('slot-board')) return;
    assert.ok(/Показаны ближайшие \d+/.test(home.text), 'нужно число показанных сеансов');
    assert.ok(
      home.text.includes('полный список открывается в форме записи'),
      'нужно прямо сказать, что витрина неполная'
    );
  });

  await test('Канал связи: ник в Telegram спрашивают и нормализуют', async () => {
    ratelimit.reset();
    const date = futureDate(18);
    const availability = await get('/api/availability?date=' + date);
    const open = availability.json.slots.filter((slot) => slot.available);
    assert.ok(open.length >= 3, 'для проверки нужно три свободных слота, свободно: ' + open.length);

    // Telegram без ника — отказ с объяснением, а не молчаливая отправка
    const missing = await postJson(
      '/api/bookings',
      validBooking({ date, time: open[0].time, messenger: 'telegram', messengerNick: '' })
    );
    assert.strictEqual(missing.status, 422, 'ожидался 422, получен ' + missing.status);
    assert.ok(missing.json.errors.messengerNick, 'нет объяснения про ник: ' + JSON.stringify(missing.json.errors));

    // Ник без «собачки» приводится к одному виду
    const created = await postJson(
      '/api/bookings',
      validBooking({ date, time: open[1].time, messenger: 'telegram', messengerNick: 'Fantom_Uka' })
    );
    assert.strictEqual(created.status, 201, 'ожидался 201, получен ' + created.status);
    assert.strictEqual(created.json.booking.messengerNick, '@Fantom_Uka');

    // Мусор вместо ника отклоняется
    const bad = await postJson(
      '/api/bookings',
      validBooking({ date, time: open[2].time, messenger: 'telegram', messengerNick: 'плохой ник' })
    );
    assert.strictEqual(bad.status, 422, 'некорректный ник должен отклоняться');
  });

  await test('Канал связи: для WhatsApp ник не спрашивают и не хранят', async () => {
    ratelimit.reset();
    const date = futureDate(19);
    const availability = await get('/api/availability?date=' + date);
    const open = availability.json.slots.filter((slot) => slot.available);
    assert.ok(open.length >= 1, 'нужен свободный слот');
    const created = await postJson(
      '/api/bookings',
      validBooking({ date, time: open[0].time, messenger: 'whatsapp', messengerNick: '@Fantom_Uka' })
    );
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.json.booking.messengerNick, '', 'ник не должен сохраняться для WhatsApp');
  });

  await test('Форма записи: labels, aria, touch-target, honeypot', async () => {
    const page = await get('/booking');
    for (const needle of ['aria-label="Программа"', 'for="phone"', 'for="name"', 'aria-live', 'role="radiogroup"', 'autocomplete="tel"', 'aria-required']) {
      assert.ok(page.text.includes(needle), `нет ${needle}`);
    }
    assert.ok(page.text.includes('hp-field'), 'нужно honeypot-поле');
    const css = await fsp.readFile(path.join(config.publicDir, 'styles.css'), 'utf8');
    assert.ok(/min-height:\s*(4[4-9]|[5-9]\d)px/.test(css), 'нужны touch-target не меньше 44px');
  });

  await test('Звук выключен по умолчанию и не стартует сам', async () => {
    const page = await get('/');
    const button = page.text.match(/<button class="sound-control"[^>]*>/);
    assert.ok(button, 'нет кнопки звука');
    assert.ok(button[0].includes('hidden'), 'кнопка звука скрыта до включения JS');
    assert.ok(button[0].includes('aria-pressed="false"'), 'звук по умолчанию выключен');
    const js = await fsp.readFile(path.join(config.publicDir, 'app.js'), 'utf8');
    assert.ok(!/addEventListener\('load'[\s\S]{0,200}build\(\)/.test(js), 'звук не должен запускаться сам');
  });

  await test('Аналитика не отправляет персональные данные', async () => {
    const js = await fsp.readFile(path.join(config.publicDir, 'app.js'), 'utf8');
    assert.ok(js.includes('PII_KEYS'), 'нужен фильтр персональных данных');
    for (const key of ['name', 'phone', 'comment']) {
      assert.ok(new RegExp(`PII_KEYS = \\[[^\\]]*'${key}'`).test(js), `${key} должен быть в списке PII`);
    }
    const events = [
      'page_view',
      'quest_view',
      'quest_selected',
      'date_selected',
      'time_selected',
      'booking_started',
      'booking_submitted',
      'booking_success',
      'booking_error',
      'phone_clicked',
      'whatsapp_clicked',
      'instagram_clicked',
      'route_clicked'
    ];
    for (const event of events) {
      assert.ok(js.includes(`'${event}'`), `нет события аналитики: ${event}`);
    }
  });

  await test('Изображения оптимизированы и лежат в ожидаемых папках', async () => {
    const dirs = ['quests', 'gallery', 'branding', 'og', 'prices'];
    for (const dir of dirs) {
      const files = await fsp.readdir(path.join(config.publicDir, 'images', dir));
      assert.ok(files.length > 0, `папка images/${dir} пуста`);
    }
    const og = await fsp.stat(path.join(config.publicDir, 'images', 'og', 'og-fantom.jpg'));
    assert.ok(og.size > 20000 && og.size < 400000, 'OG-картинка должна быть разумного веса');
  });

  await test('Хранилище переживает перезапуск инстанса (файл на диске)', async () => {
    const snapshot = JSON.parse(await fsp.readFile(config.dbFile, 'utf8'));
    assert.ok(snapshot.bookings.length >= 1, 'заявки должны быть записаны на диск');
    assert.ok(Array.isArray(snapshot.packages) && snapshot.packages.length >= 5, 'пакеты должны быть в базе');
    assert.strictEqual(snapshot.settings.timezone, 'Asia/Almaty');
  });

  /* ── Итог ─────────────────────────────────────────────────────────────── */

  const failed = results.filter((item) => !item.ok);
  console.log('\n' + '─'.repeat(82));
  console.log(`  Тестов: ${results.length}   прошло: ${results.length - failed.length}   упало: ${failed.length}`);
  if (failed.length) {
    console.log('\n  Упавшие:');
    for (const item of failed) console.log(`   • ${item.name}\n     ${item.error}`);
  }
  console.log('─'.repeat(82) + '\n');

  server.close();
  await fsp.rm(TMP, { recursive: true, force: true }).catch(() => {});
  process.exit(failed.length ? 1 : 0);
}

run().catch(async (error) => {
  console.error('\nПрогон упал:', error);
  server.close();
  await fsp.rm(TMP, { recursive: true, force: true }).catch(() => {});
  process.exit(1);
});
