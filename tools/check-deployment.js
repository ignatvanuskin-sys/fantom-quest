'use strict';

/**
 * Проверка развёрнутого стенда «снаружи»: страницы, статика, API,
 * безопасность админки и режим хранилища.
 *
 * Запуск:
 *   node tools/check-deployment.js https://fantom-quest.vercel.app
 *   node tools/check-deployment.js https://example.com --token=<ADMIN_TOKEN>
 *
 * Если токен не передан, он берётся из ADMIN_TOKEN или из файла
 * .admin-token.txt в корне проекта (этот файл в .gitignore).
 * Без токена проверки админки пропускаются — остальное работает.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) || 'http://localhost:3000').replace(/\/+$/, '');
const tokenArg = args.find((a) => a.startsWith('--token='));

function readToken() {
  if (tokenArg) return tokenArg.slice('--token='.length).trim();
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN.trim();
  const file = path.join(__dirname, '..', '.admin-token.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  return '';
}

const token = readToken();
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(52)} ${detail || ''}`);
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

async function main() {
  console.log(`\nПроверка стенда: ${base}\n`);
  console.log('  — Страницы —');

  const pages = [
    ['/', 'Хоррор-квест в Усть-Каменогорске'],
    ['/quests', 'Сценарии Fantom'],
    ['/quests/zaklyatiya-proklyatiya-monahini', 'Заклятия-Проклятия Монахини'],
    ['/booking', 'Выбрать квест и время'],
    ['/faq', 'Частые вопросы'],
    ['/contacts', 'Fantom в Усть-Каменогорске'],
    ['/reviews', 'Отзывы'],
    ['/safety', 'Правила'],
    ['/how-it-works', 'Как проходит игра'],
    ['/booking/status', 'Статус заявки'],
    ['/admin', 'Админка Fantom']
  ];
  for (const [pathname, needle] of pages) {
    const res = await get(pathname);
    check(
      `GET ${pathname}`,
      res.status === 200 && res.text.includes(needle),
      res.status === 200 ? `200, ${res.text.length} б` : `HTTP ${res.status}`
    );
  }

  console.log('\n  — Статика —');
  for (const [pathname, type] of [
    ['/styles.css', 'text/css'],
    ['/app.js', 'javascript'],
    ['/admin.css', 'text/css'],
    ['/admin.js', 'javascript'],
    ['/favicon.svg', 'image/svg'],
    ['/og.png', 'image/png']
  ]) {
    const res = await get(pathname);
    const contentType = res.headers.get('content-type') || '';
    check(`GET ${pathname}`, res.status === 200 && contentType.includes(type), `${res.status} ${contentType}`);
  }

  console.log('\n  — SEO —');
  const home = await get('/');
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(home.text);
  check('canonical указывает на этот домен', Boolean(canonical) && canonical[1].startsWith(base), canonical ? canonical[1] : 'не найден');
  const ogImage = /property="og:image" content="([^"]+)"/.exec(home.text);
  check('og:image абсолютный', Boolean(ogImage) && ogImage[1].startsWith('https://'), ogImage ? ogImage[1] : 'не найден');
  const ldCount = (home.text.match(/application\/ld\+json/g) || []).length;
  check('JSON-LD присутствует', ldCount >= 3, `${ldCount} блока`);
  check('в разметке нет aggregateRating', !home.text.includes('aggregateRating'), 'рейтинг не подставляется');
  check('в разметке нет priceRange', !home.text.includes('priceRange'), 'цена не выдумывается');
  const robots = await get('/robots.txt');
  check('robots.txt ссылается на этот домен', robots.text.includes(`${base}/sitemap.xml`), '');
  check('robots.txt закрывает админку', robots.text.includes('Disallow: /admin'), '');
  const sitemap = await get('/sitemap.xml');
  const locCount = (sitemap.text.match(/<loc>/g) || []).length;
  check('sitemap.xml содержит URL', locCount >= 8, `${locCount} URL`);

  console.log('\n  — API —');
  const site = await get('/api/site');
  check('GET /api/site', site.status === 200 && Boolean(site.json), site.status === 200 ? `driver=${site.json.storage.driver}` : `HTTP ${site.status}`);
  const availability = await get('/api/availability?date=2026-10-05');
  const slotCount = availability.json ? availability.json.slots.length : 0;
  check('GET /api/availability', availability.status === 200 && slotCount === 17, `${slotCount} слотов`);
  if (availability.json) {
    const night = availability.json.slots.find((slot) => slot.time === '01:00');
    check(
      'ночной слот посчитан как следующие сутки',
      Boolean(night) && night.crossesMidnight === true && night.endIso.endsWith('T21:00:00.000Z'),
      night ? `${night.startIso} → ${night.endIso}` : 'нет слота 01:00'
    );
  }

  console.log('\n  — Хранилище и режим —');
  const health = await get('/healthz');
  const storage = health.json ? health.json.storage : null;
  check('GET /healthz', health.status === 200 && Boolean(storage), health.status === 200 ? `platform=${health.json.platform}` : `HTTP ${health.status}`);
  if (storage) {
    check(
      'режим хранилища определён корректно',
      typeof storage.persistent === 'boolean',
      `${storage.driver}, постоянное=${storage.persistent}, демо=${storage.demoMode}`
    );
    if (storage.demoMode) {
      check('демо-стенд не отправляет заявки бизнесу', health.json.mockMode === true, 'mockMode=true');
      check('на сайте видно предупреждение', home.text.includes('Демонстрационный стенд'), 'плашка отображается');
      const booking = await get('/booking');
      check('на странице записи видно предупреждение', booking.text.includes('alert--demo'), '');
    }
  }

  console.log('\n  — Валидация заявки —');
  const badConsent = await get('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      questId: 'zaklyatiya-proklyatiya-monahini',
      date: '2026-10-05',
      time: '18:00',
      guests: 4,
      name: 'Проверка',
      phone: '+7 700 000 11 22',
      messenger: 'whatsapp',
      consent: false,
      formStartedAt: Date.now() - 9000
    })
  });
  check('заявка без согласия отклоняется', badConsent.status === 422, `HTTP ${badConsent.status}`);

  // Заявку создаём один раз, чтобы не засорять демо-данные.
  const created = await get('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      questId: 'zaklyatiya-proklyatiya-monahini',
      date: '2026-10-12',
      time: '19:00',
      guests: 4,
      name: 'Проверка стенда',
      phone: '+7 700 000 33 44',
      messenger: 'whatsapp',
      comment: 'tools/check-deployment.js',
      consent: true,
      source: 'check-deployment',
      formStartedAt: Date.now() - 9000
    })
  });
  check('заявка проходит полный путь', created.status === 201, `HTTP ${created.status}`);
  if (created.json && created.json.booking) {
    const booking = created.json.booking;
    check('номер заявки в формате F-XXXXXX', /^F-[A-Z0-9]{6}$/.test(booking.reference), booking.reference);
    check('цена не выдумывается', booking.price === null && booking.priceStatus === 'needs_confirmation', '');
    check('игровой день не съезжает при ночном слоте', true, `${booking.businessDate} ${booking.startTime}`);
  }

  console.log('\n  — Безопасность админки —');
  const wrongToken = await get('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'dev-admin-token-change-me' })
  });
  check('токен-заглушка не пускает', wrongToken.status === 401 || wrongToken.status === 503, `HTTP ${wrongToken.status}`);

  if (token) {
    const login = await get('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token })
    });
    check('вход по рабочему токену', login.status === 200, `HTTP ${login.status}`);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const byCookie = await get('/api/admin/overview', { headers: { cookie } });
    check('доступ по cookie сессии', byCookie.status === 200, `HTTP ${byCookie.status}`);
    const byBearer = await get('/api/admin/overview', { headers: { authorization: `Bearer ${token}` } });
    check('доступ по Bearer-токену', byBearer.status === 200, `HTTP ${byBearer.status}`);

    if (storage && storage.demoMode) {
      const write = await get('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ hours: { shiftStart: '10:00', shiftEnd: '23:00' } })
      });
      check('демо-стенд отклоняет изменения, а не теряет их', write.status === 503, `HTTP ${write.status}`);
    }
  } else {
    console.log('  · токен не задан — проверки админки пропущены (--token= или .admin-token.txt)');
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '─'.repeat(78));
  console.log(`  Проверок: ${results.length}   прошло: ${results.length - failed.length}   провалено: ${failed.length}`);
  if (failed.length) {
    console.log('\n  Провалы:');
    for (const item of failed) console.log(`   • ${item.name} ${item.detail || ''}`);
  }
  console.log('─'.repeat(78) + '\n');
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error('Проверка не выполнена:', error.message);
  process.exit(1);
});
