'use strict';

/* Служебная проверка живого стенда. Удаляется после использования. */

const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'https://fantom-quest.vercel.app';
const credFile = path.join(__dirname, '.admin-credentials.txt');
const password = fs.existsSync(credFile)
  ? ((/ADMIN_PASSWORD=(.+)/.exec(fs.readFileSync(credFile, 'utf8')) || [])[1] || '').trim()
  : '';

  const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(52)} ${detail || ''}`);
}

/* Заметка для оператора: не влияет на итог проверки. */
function note(text) {
  console.log(`      · ${text}`);
}

async function get(pathname, options) {
  const response = await fetch(BASE + pathname, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* не JSON */
  }
  return { status: response.status, text, json, headers: response.headers };
}

(async () => {
  console.log(`\nПроверка стенда: ${BASE}\n`);

  console.log('  — Страницы —');
  const pages = [
    ['/', 'Испытай свой страх'],
    ['/quests', 'Монахиня'],
    ['/prices', 'Пакет Хоррор'],
    ['/gallery', 'Кадры, снятые внутри'],
    ['/booking', 'Ваша бронь'],
    ['/reviews', 'Назерке'],
    ['/faq', 'Сколько длится квест'],
    ['/contacts', 'Назарбаева'],
    ['/privacy', 'Обработка персональных данных'],
    ['/booking/status', 'Статус заявки'],
    ['/admin', 'Панель заявок']
  ];
  for (const [pathname, needle] of pages) {
    const res = await get(pathname);
    check(`GET ${pathname}`, res.status === 200 && res.text.includes(needle), res.status === 200 ? `${res.text.length} б` : `HTTP ${res.status}`);
  }

  console.log('\n  — Статика (реальные фото) —');
  const images = [
    '/images/quests/nun-hood-1440.webp',
    '/images/quests/nun-face-1440.webp',
    '/images/gallery/logo-wall-1000.webp',
    '/images/gallery/entrance-street-1000.webp',
    '/images/prices/paket-horror.webp',
    '/images/og/og-fantom.jpg',
    '/styles.css',
    '/app.js',
    '/admin.js'
  ];
  for (const pathname of images) {
    const res = await get(pathname);
    check(`GET ${pathname}`, res.status === 200, res.status === 200 ? `${Math.round(res.text.length / 1024)} КБ` : `HTTP ${res.status}`);
  }

  console.log('\n  — API —');
  const health = await get('/api/health');
  const healthOk = health.status === 200 && Boolean(health.json);
  check('GET /api/health', healthOk, healthOk ? `platform=${health.json.platform}` : `HTTP ${health.status}`);
  if (healthOk) {
    console.log(
      `      хранилище: ${health.json.storage.driver}, постоянное=${health.json.storage.persistent}, ` +
        `демо=${health.json.storage.demoMode}, слотов сегодня=${health.json.schedule.slotsOpen}`
    );
  }
  const healthz = await get('/healthz');
  check('GET /healthz (алиас)', healthz.status === 200, `HTTP ${healthz.status}`);

  const packages = await get('/api/packages');
  check('GET /api/packages', packages.status === 200 && packages.json.packages.length >= 5, `${packages.json ? packages.json.packages.length : 0} пакетов`);

  const availability = await get('/api/availability');
  check('GET /api/availability', availability.status === 200 && availability.json.slots.length === 17, `${availability.json ? availability.json.slots.length : 0} слотов`);

  // Техническое состояние стенда — диагностика для оператора, а не для посетителя.
  // В публичном интерфейсе ни режим, ни хранилище, ни уведомления не упоминаются.
  console.log('\n  — Публичный интерфейс не раскрывает технику —');
  const forbidden = [
    'Демонстрационный стенд',
    'Демо-режим',
    'MOCK_MODE',
    'mock',
    'storage',
    'хранилищ',
    'заявка не сохранится',
    'не дойдёт до администратора',
    'уведомления не отправляются'
  ];
  const home = await get('/');
  for (const pathname of ['/', '/booking', '/quests', '/prices', '/gallery']) {
    const page = pathname === '/' ? home : await get(pathname);
    const hit = forbidden.find((needle) => page.text.includes(needle));
    check(`${pathname}: без технических подробностей`, page.status === 200 && !hit, hit ? `найден текст «${hit}»` : '');
  }

  // Готовность к приёму реальных заявок — это состояние эксплуатации, а не
  // корректность кода. Стенд без Redis честно сообщает об этом здесь и в /healthz;
  // провалом проверки это не считается, иначе «зелёный» прогон требует чужой инфраструктуры.
  if (healthOk) {
    const { storage, notifications } = health.json;
    console.log('\n  — Готовность к приёму заявок (для оператора) —');
    if (storage.persistent) note(`постоянное хранилище подключено (${storage.driver})`);
    else note(`постоянного хранилища нет (${storage.driver}): заявки живут внутри одного инстанса`);
    if (notifications.mockMode) note('уведомления выключены (MOCK_MODE): бизнесу ничего не уходит');
    else note(`уведомления включены: ${notifications.provider || 'канал настроен'}`);
  }

  console.log('\n  — Идемпотентность и валидация —');
  // Дата и время уникальны для каждого запуска: на демо-стенде состояние живёт
  // внутри прогретого инстанса, поэтому повторная проверка иначе получит 409.
  const grid = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00', '21:00', '22:00'];
  const stamp = Date.now();
  const payload = {
    packageId: 'paket-horror',
    date: '2026-11-' + String(1 + (stamp % 27)).padStart(2, '0'),
    time: grid[stamp % grid.length],
    guests: 4,
    name: 'Проверка стенда',
    phone: '+7 700 000 11 22',
    messenger: 'whatsapp',
    consent: true,
    source: 'check',
    idempotencyKey: 'deploy-check-' + Date.now(),
    formStartedAt: Date.now() - 9000
  };
  const first = await get('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  check('заявка создаётся', first.status === 201, `HTTP ${first.status}`);
  if (first.json && first.json.booking) {
    console.log(`      ${first.json.booking.reference} · ${first.json.booking.packageName} · ${first.json.booking.packagePriceLabel}`);
  }
  const second = await get('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  check('повторная отправка не создаёт дубль', second.status === 200 && second.json.duplicate === true, `HTTP ${second.status}`);

  const noConsent = await get('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, consent: false, idempotencyKey: 'x' + Date.now() })
  });
  check('без согласия отклоняется', noConsent.status === 422, `HTTP ${noConsent.status}`);

  const badOrigin = await get('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ ...payload, idempotencyKey: 'y' + Date.now() })
  });
  check('чужой Origin отклоняется (CSRF)', badOrigin.status === 403, `HTTP ${badOrigin.status}`);

  console.log('\n  — Админка —');
  const anon = await get('/api/admin/bookings');
  check('без сессии доступа нет', anon.status === 401, `HTTP ${anon.status}`);

  if (!password) {
    console.log('      · пароль не найден — вход не проверялся');
  } else {
    const login = await get('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password })
    });
    check('вход по паролю', login.status === 200, `HTTP ${login.status}`);
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const overview = await get('/api/admin/overview', { headers: { cookie } });
    check('обзор по сессии', overview.status === 200, overview.status === 200 ? `заявок ${overview.json.stats.total}` : `HTTP ${overview.status}`);
    const list = await get('/api/admin/bookings', { headers: { cookie } });
    check('список заявок', list.status === 200 && list.json.bookings.length >= 1, `${list.json ? list.json.bookings.length : 0}`);

    const wrong = await get('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'definitely-wrong' })
    });
    check('неверный пароль не пускает', wrong.status === 401 || wrong.status === 429, `HTTP ${wrong.status}`);
  }

  console.log('\n  — SEO —');
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(home.text);
  check('canonical на свой домен', Boolean(canonical) && canonical[1].startsWith(BASE), canonical ? canonical[1] : 'нет');
  const og = /property="og:image" content="([^"]+)"/.exec(home.text);
  check('og:image абсолютный', Boolean(og) && og[1].startsWith('https://'), og ? og[1] : 'нет');
  const ld = (home.text.match(/application\/ld\+json/g) || []).length;
  check('JSON-LD присутствует', ld >= 5, `${ld} блоков`);
  check('нет aggregateRating (рейтинг не наш)', !home.text.includes('aggregateRating'), '');

  /*
   * Согласованность страниц. Эти проверки появились после второго аудита: на
   * живом сайте нашлись ссылка на админку в общем футере, разные итоги
   * занятости на главной и на странице квеста и предзагрузка картинки,
   * которая скачивала два файла вместо одного. Всё это видно только снаружи.
   */
  console.log('\n  — Согласованность страниц —');

  const quests = await get('/quests');
  const faq = await get('/faq');

  check(
    'на витрине нет ссылки на админку',
    !home.text.includes('href="/admin"') && !quests.text.includes('href="/admin"'),
    home.text.includes('href="/admin"') ? 'ссылка найдена' : ''
  );

  const ownTotals = ['/', '/quests'].map((pathname, index) => {
    const page = index === 0 ? home : quests;
    const match = /Всего свободно (\d+)/.exec(page.text);
    return { pathname, total: match ? Number(match[1]) : null };
  });
  check(
    'занятость считается одинаково',
    ownTotals[0].total !== null &&
      ownTotals[0].total === ownTotals[1].total &&
      ownTotals[0].total > 0,
    ownTotals.map((item) => `${item.pathname}: ${item.total}`).join(', ')
  );

  const preload = /<link rel="preload" as="image"[^>]*>/.exec(home.text);
  check(
    'кадр hero предзагружается один раз и адаптивно',
    Boolean(preload && preload[0].includes('imagesrcset') && preload[0].includes('nun-hood-1440.webp')),
    preload ? preload[0].slice(0, 70) + '…' : 'нет предзагрузки'
  );
  check('на внутренних страницах нет предзагрузки кадра hero', !quests.text.includes('as="image"'), '');

  check(
    'название локации не обсуждается в публичном FAQ',
    !faq.text.includes('Как называется локация'),
    faq.text.includes('Как называется локация') ? 'вопрос опубликован' : ''
  );

  const failed = results.filter((item) => !item.ok);
  console.log('\n' + '─'.repeat(78));
  console.log(`  Проверок: ${results.length}   прошло: ${results.length - failed.length}   провалено: ${failed.length}`);
  if (failed.length) {
    console.log('\n  Провалы:');
    for (const item of failed) console.log('   • ' + item.name);
  }

  /*
   * Итоговый вердикт: код корректен и приём заявок — разные вещи.
   * «Зелёные» проверки означают, что сайт работает; принимать реальные брони
   * он сможет только с постоянным хранилищем и включёнными уведомлениями.
   * Оператору нужен один однозначный ответ, а не список галочек.
   */
  if (healthOk) {
    const { storage, notifications } = health.json;
    const reasons = [];
    if (!storage.persistent) reasons.push('нет постоянного хранилища — заявки исчезнут при следующем деплое');
    if (notifications.mockMode) reasons.push('уведомления выключены — бизнес не узнает о заявке');

    console.log('');
    if (reasons.length === 0) {
      console.log('  ГОТОВ К ПРИЁМУ ЗАЯВОК: код, хранилище и уведомления в порядке.');
    } else {
      console.log('  ДЕМО-СТЕНД, НЕ ГОТОВ К ПРИЁМУ ЗАЯВОК:');
      for (const reason of reasons) console.log('   • ' + reason);
      console.log('  Что сделать: PRODUCTION.md, раздел «Осталось включить».');
    }
  }
  console.log('─'.repeat(78) + '\n');
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error('Проверка не выполнена:', error.message);
  process.exit(1);
});
