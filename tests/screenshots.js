'use strict';

/**
 * Скриншоты и замеры вёрстки через Chrome DevTools Protocol.
 *
 * Зачем свой скрипт, а не CLI-флаг --screenshot: Chrome на Windows не даёт
 * уменьшить окно ниже ~500 px, поэтому «мобильный» кадр через --window-size
 * получается обрезанным и врёт. Здесь ширина задаётся через
 * Emulation.setDeviceMetricsOverride — рендеринг честно идёт в 360/390/430 px.
 *
 * Запуск (сервер должен быть уже поднят на http://127.0.0.1:3000):
 *   node tests/screenshots.js
 *   node tests/screenshots.js --base=http://127.0.0.1:3000 --out=tests/artifacts
 *
 * Зависимостей нет: используется встроенный в Node 22 WebSocket и Chrome/Edge
 * из системы. Если браузер не найден — скрипт сообщит и завершится с кодом 2.
 */

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const BASE = arg('base', 'http://127.0.0.1:3000');
const OUT = path.resolve(arg('out', path.join(__dirname, 'artifacts')));
const PORT = Number(arg('port', '0')) || 9333 + Math.floor(Math.random() * 200);
// --viewport-only снимает только первый экран (читаемый предпросмотр),
// по умолчанию снимается страница целиком.
const VIEWPORT_ONLY = args.includes('--viewport-only');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const PAGES = [
  { name: 'home', url: '/', title: 'Главная' },
  { name: 'quest', url: '/quests', title: 'Квест' },
  { name: 'gallery', url: '/gallery', title: 'Галерея' },
  { name: 'prices', url: '/prices', title: 'Пакеты' },
  { name: 'booking', url: '/booking', title: 'Запись' },
  { name: 'reviews', url: '/reviews', title: 'Отзывы' },
  { name: 'faq', url: '/faq', title: 'FAQ' },
  { name: 'contacts', url: '/contacts', title: 'Контакты' },
  { name: 'privacy', url: '/privacy', title: 'Политика данных' },
  { name: 'admin', url: '/admin', title: 'Админка' }
];

/*
 * Мобильные ширины идут первыми и покрывают весь реальный парк телефонов:
 * 320 (старые iPhone SE), 360/375/390/430 (основная масса Android и iPhone).
 * Планшеты и десктоп — после них.
 */
const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568, mobile: true },
  { name: 'mobile-360', width: 360, height: 780, mobile: true },
  { name: 'mobile-375', width: 375, height: 812, mobile: true },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
  { name: 'mobile-430', width: 430, height: 880, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: false },
  { name: 'laptop-1024', width: 1024, height: 768, mobile: false },
  { name: 'desktop-1280', width: 1280, height: 800, mobile: false },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false }
];

/**
 * Скриншоты снимаются не для всех 66 комбинаций: полностраничные кадры весят
 * много, поэтому сохраняются базовые профили (mobile-390 и desktop-1440)
 * плюс несколько контрольных крайних ширин. Замеры переполнения выполняются
 * для всех комбинаций — это дешево.
 */
const SHOT_PAGES = ['home', 'quest', 'prices', 'booking', 'contacts', 'admin', 'faq', 'reviews', 'gallery'];
const SHOT_VIEWPORTS = ['mobile-390', 'desktop-1440'];
const EXTRA_SHOTS = [
  ['home', 'mobile-320'],
  ['home', 'mobile-375'],
  ['home', 'mobile-430'],
  ['home', 'tablet-768'],
  ['home', 'desktop-1920'],
  ['booking', 'mobile-320'],
  ['booking', 'mobile-430'],
  ['booking', 'desktop-1920'],
  ['quest', 'mobile-320'],
  ['prices', 'mobile-390'],
  ['privacy', 'desktop-1440']
];

function shouldCapture(pageName, viewportName) {
  if (SHOT_PAGES.includes(pageName) && SHOT_VIEWPORTS.includes(viewportName)) return true;
  return EXTRA_SHOTS.some(([p, v]) => p === pageName && v === viewportName);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      require('fs').accessSync(candidate);
      return candidate;
    } catch {
      /* пробуем следующий */
    }
  }
  return null;
}

function cdpClient(ws) {
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method && listeners.has(message.method)) {
      for (const fn of [...listeners.get(message.method)]) fn(message.params);
    }
  });

  return {
    send(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    },
    once(method, timeoutMs = 20000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Таймаут ожидания ${method}`)), timeoutMs);
        const list = listeners.get(method) || [];
        const handler = (params) => {
          clearTimeout(timer);
          const index = list.indexOf(handler);
          if (index >= 0) list.splice(index, 1);
          resolve(params);
        };
        list.push(handler);
        listeners.set(method, list);
      });
    }
  };
}

async function connect() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await response.json();
  const page = targets.find((t) => t.type === 'page') || targets[0];
  if (!page) throw new Error('Не найден target страницы');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket отклонён')), { once: true });
  });
  return { ws, client: cdpClient(ws) };
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const description = (details.exception && (details.exception.description || details.exception.value)) || '';
    throw new Error(
      `Ошибка выполнения в браузере: ${details.text || ''} ${description}`.trim() +
        ` | выражение: ${String(expression).replace(/\s+/g, ' ').slice(0, 140)}`
    );
  }
  return result.result.value;
}

async function measure(client) {
  return evaluate(
    client,
    `JSON.stringify({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      overflowing: [...document.querySelectorAll('body *')]
        .filter(function (el) {
          var r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
        })
        .slice(0, 6)
        .map(function (el) {
          return (el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ').filter(Boolean).join('.'))
            .slice(0, 90) + ' → ' + Math.round(el.getBoundingClientRect().right) + 'px';
        })
    })`
  ).then(JSON.parse);
}

async function capture(client, width, height, file) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: Math.min(height, 12000),
    deviceScaleFactor: 1,
    mobile: width < 700
  });
  await sleep(500);
  // JPEG вместо PNG: полностраничный кадр 390×12000 в PNG весит ~4 МБ,
  // в JPEG при качестве 82 — около 600 КБ, при том же читаемом результате.
  // Возвращаемся в начало страницы: после смены размеров вьюпорта браузер
  // сохраняет прежний скролл, и «первый экран» на самом деле снимался ниже.
  await evaluate(client, 'window.scrollTo(0, 0)');
  await sleep(350);

  const shot = await client.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 82,
    fromSurface: true,
    optimizeForSpeed: true
  });
  await fs.writeFile(file, Buffer.from(shot.data, 'base64'));
  return (await fs.stat(file)).size;
}

/**
 * Диагностика геометрии: --probe=/booking --probe-width=390
 * Список селекторов можно задать самому: --probe-selectors=".numbers b|h1"
 * (по умолчанию — узлы hero).
 */
async function probe(client) {
  const url = arg('probe', '/');
  const width = Number(arg('probe-width', '390'));
  const custom = arg('probe-selectors', '');
  const selectors = custom
    ? custom.split('|').map((item) => item.trim()).filter(Boolean).map((item) => JSON.stringify(item)).join(', ')
    : `'.stage-banner', '.hero-inner', 'h1', '.hero-title-brand', '.hero-title-brand .brand-mark', '.hero-title-line', '.hero-facts', '.hero-actions'`;
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });
  await client.send('Page.navigate', { url: BASE + url });
  await client.once('Page.loadEventFired').catch(() => null);
  await sleep(1200);
  // Со своим селектором сразу подводим экран к узлу: блоки появляются при
  // пересечении границы экрана, и без прокрутки замер покажет opacity: 0.
  if (custom) {
    await evaluate(
      client,
      `(function () {
        var el = document.querySelector(${JSON.stringify(custom.split('|')[0].trim())});
        if (el) el.scrollIntoView({ block: 'center' });
      })()`
    );
    await sleep(900);
  }
  const result = await evaluate(
    client,
    `JSON.stringify({
      scrollY: window.scrollY,
      viewport: [window.innerWidth, window.innerHeight],
      nodes: [${selectors}]
        .map(function (sel) {
          var el = document.querySelector(sel);
          if (!el) return { sel: sel, missing: true };
          var r = el.getBoundingClientRect();
          var cs = getComputedStyle(el);
          return {
            sel: sel,
            top: Math.round(r.top), bottom: Math.round(r.bottom),
            left: Math.round(r.left), right: Math.round(r.right),
            h: Math.round(r.height), w: Math.round(r.width),
            position: cs.position, zIndex: cs.zIndex,
            color: cs.color, opacity: cs.opacity,
            fill: cs.webkitTextFillColor || '—',
            bgImage: (cs.backgroundImage || 'none').slice(0, 46),
            scrollH: el.scrollHeight, clientH: el.clientHeight,
            lineBoxes: (function () {
              var range = document.createRange();
              range.selectNodeContents(el);
              return range.getClientRects().length;
            })(),
            text: (el.textContent || '').trim().slice(0, 70)
          };
        })
    })`
  );
  console.log(`\n  Геометрия ${url} @ ${width}px:`);
  for (const node of JSON.parse(result).nodes) {
    if (node.missing) {
      console.log(`   ${node.sel.padEnd(22)} — не найден`);
    } else {
      console.log(
        `   ${node.sel.padEnd(22)} top=${String(node.top).padStart(5)} bottom=${String(node.bottom).padStart(5)} ` +
          `h=${String(node.h).padStart(4)} w=${String(node.w).padStart(4)} pos=${node.position} ` +
          `lines=${node.lineBoxes} overflow=${node.scrollH - node.clientH}px ` +
          `color=${node.color} fill=${node.fill} opacity=${node.opacity}\n` +
          `     bg=${node.bgImage} text="${node.text}"`
      );
    }
  }
  console.log('');
}

async function run() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('Не найден Chrome/Edge. Укажите путь через переменную CHROME_PATH.');
    process.exit(2);
  }

  await fs.mkdir(OUT, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'fantom-chrome-'));

  console.log(`\nFantom — скриншоты и замеры вёрстки`);
  console.log(`  браузер: ${chrome}`);
  console.log(`  сайт:    ${BASE}`);
  console.log(`  вывод:   ${OUT}\n`);

  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  // Ждём поднятия отладочного порта.
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(250);
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* ещё не поднялся */
    }
  }
  if (!ready) {
    child.kill();
    console.error('Chrome не открыл отладочный порт. Проверьте установку браузера.');
    process.exit(2);
  }

  const { ws, client } = await connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  if (args.some((a) => a.startsWith('--probe'))) {
    await probe(client);
    ws.close();
    child.kill();
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
    process.exit(0);
  }

  const report = { base: BASE, generatedAt: new Date().toISOString(), pages: [], checks: {} };
  const rows = [];

  for (const viewport of VIEWPORTS) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile
    });

    for (const page of PAGES) {
      const loaded = client.once('Page.loadEventFired').catch(() => null);
      await client.send('Page.navigate', { url: BASE + page.url });
      await loaded;
      await sleep(1400); // даём отработать загрузке слотов и шрифтам
      // Прокручиваем страницу, чтобы отработали ленивые блоки, и возвращаемся.
      await evaluate(client, 'window.scrollTo(0, document.body.scrollHeight)');
      await sleep(350);
      await evaluate(client, 'window.scrollTo(0, 0)');
      await sleep(250);

      const metrics = await measure(client);
      const ok = metrics.scrollWidth <= metrics.innerWidth + 1;
      const wanted = shouldCapture(page.name, viewport.name);
      const fileName = wanted ? `${page.name}-${viewport.name}.jpg` : null;
      let size = 0;

      if (wanted) {
        const shotHeight = VIEWPORT_ONLY ? viewport.height : metrics.scrollHeight + 40;
        size = await capture(client, viewport.width, shotHeight, path.join(OUT, fileName));
        await client.send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: viewport.mobile
        });
        await sleep(200);
      }

      report.pages.push({ page: page.name, viewport: viewport.name, ...metrics, file: fileName, ok });
      rows.push({ viewport: viewport.name, page: page.name, ok, metrics, size, file: fileName });

      console.log(
        `  ${ok ? '✓' : '✗'} ${(page.name + ' @ ' + viewport.name).padEnd(30)} ` +
          `scrollWidth=${String(metrics.scrollWidth).padStart(4)} innerWidth=${String(metrics.innerWidth).padStart(4)} ` +
          (wanted ? `${(size / 1024).toFixed(0)} КБ` : 'замер без снимка')
      );
      if (!ok) {
        for (const item of metrics.overflowing) console.log(`     переполнение: ${item}`);
      }
    }
  }

  // ── Интерактивные проверки на мобильной ширине ────────────────────────
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });

  console.log('\n  — Интерактивные проверки (390 px) —');

  await client.send('Page.navigate', { url: BASE + '/' });
  await client.once('Page.loadEventFired').catch(() => null);
  await sleep(1200);

  const mockBanner = await evaluate(client, `!!document.querySelector('.stage-banner')`);
  const heroCta = await evaluate(
    client,
    `JSON.stringify([...document.querySelectorAll('.hero .btn')].map(function (b) { return b.textContent.trim(); }))`
  );
  const ctaLabels = JSON.parse(heroCta);
  const navHiddenBefore = await evaluate(
    client,
    `getComputedStyle(document.getElementById('site-nav')).display`
  );
  await evaluate(client, `document.querySelector('[data-nav-toggle]').click()`);
  await sleep(400);
  const navAfter = await evaluate(
    client,
    `JSON.stringify({
      display: getComputedStyle(document.getElementById('site-nav')).display,
      expanded: document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded'),
      links: document.getElementById('site-nav').querySelectorAll('a').length
    })`
  );
  const nav = JSON.parse(navAfter);
  await capture(client, 390, 1400, path.join(OUT, 'nav-open-mobile-390.jpg'));

  await client.send('Page.navigate', { url: BASE + '/booking' });
  await client.once('Page.loadEventFired').catch(() => null);
  await sleep(1600);

  /*
   * Мастер записи состоит из 5 шагов, и раньше проверка этого не знала: она
   * кликала «дальше» с первого шага без выбранной программы и получала
   * «шаг 2 не активен» — то есть фиксировала корректный отказ как поломку.
   * Теперь мастер проходится целиком, с проверками на каждом переходе.
   */
  const activeStep = () =>
    evaluate(
      client,
      `(function () {
        var el = document.querySelector('.wizard-step.is-active');
        return el ? el.getAttribute('data-step') : null;
      })()`
    );

  const clickNext = async (n) => {
    await evaluate(client, `document.querySelector('[data-next="${n}"]').click()`);
    await sleep(400);
  };

  const slotButtons = await evaluate(client, `document.querySelectorAll('.slot-btn').length`);
  const step1Active = await evaluate(
    client,
    `document.querySelector('[data-step="1"]').classList.contains('is-active')`
  );

  // Шаг 1 без выбранной программы вперёд не пускает — это защита от пустой заявки.
  await clickNext(2);
  const blockedWithoutPackage = (await activeStep()) === '1';

  // Шаг 1 → 2: выбираем программу.
  await evaluate(client, `document.querySelector('.package-option').click()`);
  await sleep(250);
  await clickNext(2);
  const step2Active = (await activeStep()) === '2';

  // Шаг 2 → 3: выбираем дату.
  await evaluate(client, `document.querySelector('.date-chip').click()`);
  await sleep(250);
  await clickNext(3);
  const step3Active = (await activeStep()) === '3';

  const slotLabels = await evaluate(
    client,
    `JSON.stringify([...document.querySelectorAll('.slot-btn')].slice(0, 20).map(function (b) { return b.textContent.trim(); }))`
  );

  // Шаг 3: выбираем время. Без него дальше тоже не пускает.
  await clickNext(4);
  const blockedWithoutSlot = (await activeStep()) === '3';
  await evaluate(client, `document.querySelector('.slot-btn').click()`);
  await sleep(400);

  // Сводка лежит вне <form>: ошибка в селекторе оставила бы её пустой.
  const summaryValues = JSON.parse(
    await evaluate(
      client,
      `JSON.stringify({
        quest: ((document.querySelector('.summary-card [data-summary-package]') || document.querySelector('[data-summary-package]')) || {}).textContent,
        date: ((document.querySelector('.summary-card [data-summary-date]') || document.querySelector('[data-summary-date]')) || {}).textContent,
        time: ((document.querySelector('.summary-card [data-summary-time]') || document.querySelector('[data-summary-time]')) || {}).textContent,
        guests: ((document.querySelector('.summary-card [data-summary-guests]') || document.querySelector('[data-summary-guests]')) || {}).textContent,
        hiddenTime: document.getElementById('time').value,
        selected: document.querySelectorAll('.slot-btn[aria-checked="true"]').length
      })`
    )
  );
  await capture(client, 390, 1700, path.join(OUT, 'booking-step3-mobile-390.jpg'));

  /*
   * Липкая сводка на мобильном прижата к низу экрана и легко перекрывает кнопку
   * перехода. Проверяем именно пересечение прямоугольников, а не «на глаз».
   */
  const stickyOverlap = JSON.parse(
    await evaluate(
      client,
      `(function () {
        var card = document.querySelector('.summary-card');
        if (!card) return JSON.stringify({ card: false });
        card.scrollIntoView({ block: 'end' });
        var cr = card.getBoundingClientRect();
        var buttons = Array.prototype.slice.call(
          document.querySelectorAll('.wizard-step.is-active .btn, .wizard-step.is-active button')
        ).filter(function (b) {
          var r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        var covered = buttons.filter(function (b) {
          var r = b.getBoundingClientRect();
          var vertical = r.bottom > cr.top + 1 && r.top < cr.bottom - 1;
          var horizontal = r.right > cr.left + 1 && r.left < cr.right - 1;
          return vertical && horizontal;
        });
        return JSON.stringify({
          card: true,
          cardTop: Math.round(cr.top),
          cardBottom: Math.round(cr.bottom),
          buttons: buttons.length,
          covered: covered.length,
          coveredText: covered.map(function (b) { return b.textContent.trim().slice(0, 26); })
        });
      })()`
    )
  );

  const summaryPresent = await evaluate(client, `!!document.querySelector('.summary-card')`);
  const noPayButton = await evaluate(
    client,
    `![...document.querySelectorAll('button, a')].some(function (el) { return /оплатить|оплата заказа/i.test(el.textContent); })`
  );

  /* ── Слой движения (effects.css / effects.js) ─────────────────────────
   *
   * Главный риск этого слоя — не «красиво или нет», а то, что блоки прячутся
   * до появления классом .is-in. Если наблюдатель не сработает, секции
   * останутся с opacity: 0 и сайт будет выглядеть пустым. Поэтому проверяем
   * именно это: сколько блоков осталось невидимыми после полного прохода
   * страницы, нет ли в разметке декоративных слоёв и что при
   * prefers-reduced-motion видно всё без исключений.
   */

  console.log('\n  — Слой движения (1280 px, мышь) —');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await client.send('Page.navigate', { url: BASE + '/' });
  await client.once('Page.loadEventFired').catch(() => null);
  await sleep(1500);

  const fxReady = await evaluate(client, `document.documentElement.classList.contains('fx-on')`);

  /*
   * Прокручиваем всю страницу мелкими шагами. Шаг обязан быть меньше
   * эффективной высоты экрана: наблюдатель появления использует rootMargin
   * -8% снизу, поэтому при крупном шаге между двумя позициями остаётся
   * полоса, которую блок ни разу не пересекает, — и проверка показывает
   * «не появился» там, где на самом деле всё в порядке.
   */
  for (let i = 1; i <= 24; i += 1) {
    await evaluate(client, `window.scrollTo(0, document.body.scrollHeight * ${(i / 24).toFixed(4)})`);
    await sleep(200);
  }
  await evaluate(client, 'window.scrollTo(0, 0)');
  await sleep(600);

  const fxHidden = JSON.parse(
    await evaluate(
      client,
      `(function () {
        var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-fx]'));
        var invisible = nodes.filter(function (el) {
          return Number(getComputedStyle(el).opacity) < 0.9;
        });
        return JSON.stringify({
          total: nodes.length,
          missing: invisible.length,
          sample: invisible.slice(0, 4).map(function (el) {
            return (el.className || el.tagName).toString().slice(0, 48);
          })
        });
      })()`
    )
  );

  /*
   * Декоративных слоёв на сайте больше нет: ни canvas, ни фонаря, ни магнита,
   * ни табло времени. Проверяем, что они действительно не вернулись ни в
   * разметку, ни в скрипты — иначе на первом экране снова появится движение,
   * которое конкурирует с текстом.
   */
  const decoration = JSON.parse(
    await evaluate(
      client,
      `(function () {
        return JSON.stringify({
          canvas: document.querySelectorAll('canvas').length,
          torch: document.querySelectorAll('.fx-torch').length,
          magnetic: document.querySelectorAll('[data-fx-magnetic]').length,
          osd: document.querySelectorAll('.fx-osd').length,
          sound: document.querySelectorAll('[data-sound-toggle]').length,
          contactBar: document.querySelectorAll('[data-contact-bar]').length
        });
      })()`
    )
  );

  // prefers-reduced-motion: движение обязано выключиться, а контент — остаться.
  await client.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  await client.send('Page.navigate', { url: BASE + '/' });
  await client.once('Page.loadEventFired').catch(() => null);
  await sleep(1400);
  const rmHidden = await evaluate(
    client,
    `[...document.querySelectorAll('[data-fx]')].filter(function (el) {
      return Number(getComputedStyle(el).opacity) < 0.9;
    }).length`
  );
  const rmFxOn = await evaluate(client, `document.documentElement.classList.contains('fx-on')`);
  await client.send('Emulation.setEmulatedMedia', { features: [] });

  report.checks = {
    techBannerVisible: mockBanner,
    fxReady,
    fxReveal: fxHidden,
    fxDecoration: decoration,
    fxReducedMotionHidden: rmHidden,
    fxReducedMotionActive: rmFxOn,
    heroCtaLabels: ctaLabels,
    navHiddenBefore,
    navOpen: nav,
    bookingSlotButtons: slotButtons,
    bookingStep1Active: step1Active,
    bookingBlockedWithoutPackage: blockedWithoutPackage,
    bookingStep2Active: step2Active,
    bookingStep3Active: step3Active,
    bookingBlockedWithoutSlot: blockedWithoutSlot,
    slotLabels: JSON.parse(slotLabels),
    bookingSummaryAfterSlotPick: summaryValues,
    stickySummaryPresent: summaryPresent,
    stickySummaryCoversButtons: stickyOverlap,
    noPaymentButton: noPayButton
  };

  console.log(`  технических плашек в интерфейсе:   ${mockBanner ? 'ЕСТЬ (проблема)' : 'нет'}`);
  console.log(`  CTA в hero:                        ${ctaLabels.join(' | ')}`);
  console.log(`  меню до клика:                     display=${navHiddenBefore}`);
  console.log(`  меню после клика:                  display=${nav.display}, aria-expanded=${nav.expanded}, ссылок=${nav.links}`);
  console.log(`  кнопок слотов в мастере:           ${slotButtons}`);
  console.log(`  шаг 1 активен на входе:            ${step1Active ? 'да' : 'нет'}`);
  console.log(`  без программы вперёд не пускает:   ${blockedWithoutPackage ? 'да' : 'НЕТ (дыра)'}`);
  console.log(`  шаг 2 после выбора программы:      ${step2Active ? 'да' : 'НЕТ (дыра)'}`);
  console.log(`  шаг 3 после выбора даты:           ${step3Active ? 'да' : 'НЕТ (дыра)'}`);
  console.log(`  без времени вперёд не пускает:     ${blockedWithoutSlot ? 'да' : 'НЕТ (дыра)'}`);
  console.log(`  sticky summary на месте:           ${summaryPresent ? 'да' : 'нет'}`);
  console.log(
    `  сводка не перекрывает кнопки:      ${
      !stickyOverlap.card
        ? 'сводка не найдена'
        : stickyOverlap.covered === 0
          ? `да (проверено кнопок: ${stickyOverlap.buttons})`
          : `НЕТ — перекрыто: ${stickyOverlap.coveredText.join(', ')}`
    }`
  );
  console.log(
    `  summary после выбора слота:        сценарий="${String(summaryValues.quest).trim()}", ` +
      `дата="${String(summaryValues.date).trim()}", время="${String(summaryValues.time).trim()}", ` +
      `состав="${String(summaryValues.guests).trim()}", hidden=${summaryValues.hiddenTime}, выбрано=${summaryValues.selected}`
  );
  console.log(`  кнопки «Оплатить» нет:             ${noPayButton ? 'да' : 'нет'}`);
  console.log(`  слой движения включился:           ${fxReady ? 'да' : 'НЕТ'}`);
  console.log(
    `  блоков не появилось после прокрутки: ${fxHidden.missing} из ${fxHidden.total}` +
      (fxHidden.missing ? ` → ${fxHidden.sample.join(', ')}` : '')
  );
  console.log(
    `  декоративных слоёв в разметке:     canvas=${decoration.canvas}, фонарь=${decoration.torch}, ` +
      `магнит=${decoration.magnetic}, табло=${decoration.osd}, звук=${decoration.sound}, панель=${decoration.contactBar}`
  );
  console.log(`  reduced-motion прячет блоки:       ${rmHidden === 0 ? 'нет, всё видно' : `ДА — ${rmHidden} шт.`}`);
  console.log(`  reduced-motion оставляет анимацию: ${rmFxOn ? 'ДА (проблема)' : 'нет'}`);

  // ── Сводка ───────────────────────────────────────────────────────────
  const bad = rows.filter((r) => !r.ok);
  console.log('\n' + '─'.repeat(74));
  console.log(`  Замеров: ${rows.length}   с горизонтальным переполнением: ${bad.length}`);
  if (bad.length) {
    console.log('  Проблемные:');
    for (const r of bad) {
      console.log(`   • ${r.page} @ ${r.viewport}: scrollWidth=${r.metrics.scrollWidth} > innerWidth=${r.metrics.innerWidth}`);
      for (const item of r.metrics.overflowing) console.log(`       ${item}`);
    }
  }
  console.log('─'.repeat(74) + '\n');

  await fs.writeFile(
    path.join(OUT, 'layout-report.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  const md = [
    '# Отчёт по вёрстке',
    '',
    `Сформирован: ${report.generatedAt}`,
    `Сайт: ${BASE}`,
    '',
    '## Переполнение по ширине',
    '',
    '| Ширина | Страница | scrollWidth | innerWidth | Гориз. скролл | Скриншот |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.viewport} | ${r.page} | ${r.metrics.scrollWidth} | ${r.metrics.innerWidth} | ${
          r.ok ? 'нет' : '**ДА**'
        } | ${r.file ? `[${r.file}](${r.file})` : '—'} |`
    ),
    '',
    '## Проверки поведения',
    '',
    `- Технических плашек в интерфейсе нет: ${mockBanner ? 'НЕТ — плашка найдена' : 'да'}`,
    `- CTA в hero: ${ctaLabels.join(' | ')}`,
    `- Меню закрыто до клика: ${navHiddenBefore}`,
    `- Меню после клика: display=${nav.display}, aria-expanded=${nav.expanded}, ссылок=${nav.links}`,
    `- Кнопок слотов в мастере: ${slotButtons}`,
    `- Шаг 1 активен на входе: ${step1Active ? 'да' : 'нет'}`,
    `- Без выбранной программы дальше не пускает: ${blockedWithoutPackage ? 'да' : '**НЕТ**'}`,
    `- Шаг 2 активируется после выбора программы: ${step2Active ? 'да' : '**НЕТ**'}`,
    `- Шаг 3 активируется после выбора даты: ${step3Active ? 'да' : '**НЕТ**'}`,
    `- Без выбранного времени дальше не пускает: ${blockedWithoutSlot ? 'да' : '**НЕТ**'}`,
    `- Сводка после выбора слота: сценарий «${String(summaryValues.quest).trim()}», ` +
      `дата «${String(summaryValues.date).trim()}», время «${String(summaryValues.time).trim()}», ` +
      `состав «${String(summaryValues.guests).trim()}», скрытое поле time=${summaryValues.hiddenTime}, ` +
      `выделено слотов=${summaryValues.selected}`,
    `- Sticky summary: ${summaryPresent ? 'да' : 'нет'}`,
    `- Sticky summary не перекрывает кнопки: ${
      !stickyOverlap.card
        ? 'сводка не найдена'
        : stickyOverlap.covered === 0
          ? `да (кнопок проверено: ${stickyOverlap.buttons})`
          : `**НЕТ** — перекрыто: ${stickyOverlap.coveredText.join(', ')}`
    }`,
    `- Кнопки «Оплатить» на странице нет: ${noPayButton ? 'да' : 'нет'}`,
    '',
    '## Слой движения',
    '',
    `- Скрипт эффектов включился: ${fxReady ? 'да' : '**НЕТ**'}`,
    `- Блоков с data-fx: ${fxHidden.total}, из них осталось невидимыми после полной прокрутки: ${
      fxHidden.missing === 0 ? '0 (норма)' : `**${fxHidden.missing}** → ${fxHidden.sample.join(', ')}`
    }`,
    `- Декоративных слоёв в разметке нет: canvas=${decoration.canvas}, фонарь=${decoration.torch}, магнит=${decoration.magnetic}, табло=${decoration.osd}, звук=${decoration.sound}, панель контактов=${decoration.contactBar}`,
    `- prefers-reduced-motion, невидимых блоков: ${rmHidden === 0 ? '0 (норма)' : `**${rmHidden}**`}`,
    `- prefers-reduced-motion, анимация не включается: ${rmFxOn ? '**включилась (проблема)**' : 'нет'}`,
    '',
    'Примеры слотов: ' + JSON.parse(slotLabels).join(', '),
    ''
  ].join('\n');
  await fs.writeFile(path.join(OUT, 'layout-report.md'), md, 'utf8');

  ws.close();
  child.kill();
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});

  process.exit(bad.length ? 1 : 0);
}

run().catch((error) => {
  console.error('Скрипт упал:', error.message);
  if (process.env.VERBOSE) console.error(error.stack);
  process.exit(1);
});
