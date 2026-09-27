'use strict';

/**
 * Интерактивная проверка сайта в реальном браузере.
 *
 * Отличие от tests/screenshots.js: там замеряется геометрия статичных страниц,
 * здесь браузер реально нажимает, печатает и отправляет — как посетитель.
 * Скрипт отвечает на вопросы, которые нельзя проверить по коду: приходят ли
 * ошибки в консоль, ломаются ли ссылки, перекрыт ли кнопка чем-нибудь, что
 * происходит при двойном клике и при отказе API.
 *
 * Скрипт самодостаточен: поднимает свой сервер на временной базе (реальные
 * заявки не трогаются), запускает системный Chrome через CDP и убирает за собой.
 * Внешний интернет не нужен.
 *
 * Запуск: npm run qa:browser
 */

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
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

const ROUTES = ['/', '/quests', '/prices', '/gallery', '/reviews', '/faq', '/contacts', '/privacy', '/booking', '/booking/status'];
const VIEWPORTS = [
  { name: '375', width: 375, height: 812, mobile: true },
  { name: '1440', width: 1440, height: 900, mobile: false }
];

const MOBILE_WIDTHS = [320, 360, 375, 390, 430];

/* Сколько минут отводится на весь прогон до принудительной остановки. */
const WATCHDOG_MINUTES = Number(process.env.QA_WATCHDOG_MINUTES || 4.5);

/*
 * Наборы проверок. Длинная сессия с браузером живёт на пределе: за десять
 * минут обхода Chrome начинает падать, и прогон обрывается без объяснений.
 * Поэтому проверки разделены на два независимых набора, и каждый запускается
 * отдельно: core — обход, запись и крайние случаи, ui — правила интерфейса,
 * цена и загрузка.
 *
 *   node tests/browser-qa.js --blocks=core
 *   node tests/browser-qa.js --blocks=ui
 */
const BLOCKS = new Set(
  (process.argv.find((item) => item.startsWith('--blocks=')) || '--blocks=core,ui')
    .split('=')[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);
const wants = (block) => BLOCKS.has(block);

// Текст, которого посетитель видеть не должен. Те же слова, что проверяет
// внешний чекер: если они попали в публичный HTML, стенд раскрывает технику.
const FORBIDDEN = [
  'MOCK_MODE',
  'demoMode',
  'демо-режим',
  'Демонстрационный стенд',
  'Демо-режим',
  'storage',
  'хранилищ',
  'заявка не сохранится',
  'не дойдёт до администратора',
  'уведомления не отправляются',
  'mock',
  'null',
  'undefined',
  'NaN'
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── Процессы и порты ───────────────────────────────────────────────────── */

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      fs.accessSync(candidate);
      return candidate;
    } catch {
      /* следующий */
    }
  }
  return null;
}

function freePort() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/* ── Минимальный клиент CDP ─────────────────────────────────────────────── */

function cdp(ws) {
  const pending = new Map();
  const subscribers = new Map();
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
    if (message.method && subscribers.has(message.method)) {
      for (const fn of subscribers.get(message.method)) fn(message.params);
    }
  });

  return {
    /*
     * У каждого вызова есть таймаут. Без него смерть браузера превращает
     * проверку в вечное ожидание ответа, который уже не придёт: скрипт висит
     * до внешнего лимита, и непонятно, что именно сломалось.
     */
    send(method, params, timeoutMs = 20000) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome не ответил на ${method} за ${timeoutMs} мс`));
        }, timeoutMs);
        pending.set(id, {
          resolve(value) {
            clearTimeout(timer);
            resolve(value);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          }
        });
        try {
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(new Error(`Канал к Chrome закрыт: ${error.message}`));
        }
      });
    },
    on(method, fn) {
      const list = subscribers.get(method) || [];
      list.push(fn);
      subscribers.set(method, list);
    }
  };
}

async function launchChrome(port, profile) {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome или Edge не найден');
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
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(250);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return child;
    } catch {
      /* ждём */
    }
  }
  throw new Error('Отладочный порт Chrome не поднялся');
}

async function connect(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await response.json();
  const page = targets.find((t) => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket отклонён')), { once: true });
  });
  return cdp(ws);
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const description = (details.exception && (details.exception.description || details.exception.value)) || '';
    throw new Error(`${details.text || ''} ${description}`.trim());
  }
  return result.result.value;
}

async function viewport(client, width, height, mobile) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile
  });
  await sleep(140);
}

async function navigate(client, url) {
  await client.send('Page.navigate', { url });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(120);
    try {
      const state = await evaluate(client, 'document.readyState');
      if (state === 'complete') return;
    } catch {
      /* страница ещё меняется */
    }
  }
  throw new Error('Страница не догрузилась: ' + url);
}

async function scrollThrough(client) {
  await evaluate(
    client,
    // Внутренний предохранитель: обещание обязано завершиться, даже если
    // браузер решит притормозить таймеры. Иначе проверка встаёт навсегда.
    `new Promise(function (resolve) {
      var steps = 6;
      var done = 0;
      var guard = setTimeout(function () { window.scrollTo(0, 0); resolve(true); }, 2500);
      function tick() {
        done += 1;
        window.scrollTo(0, document.body.scrollHeight * (done / steps));
        if (done >= steps) {
          clearTimeout(guard);
          window.scrollTo(0, 0);
          resolve(true);
          return;
        }
        setTimeout(tick, 90);
      }
      tick();
    })`,
    true
  );
  await sleep(400);
}

/* Снимок текущего кадра: нужен там, где проверка глазами важнее числа —
   например чтобы посмотреть, как выглядит появившееся поле ника. */
async function shot(client, name) {
  const dir = path.join(ROOT, 'tests', 'artifacts', 'qa');
  fs.mkdirSync(dir, { recursive: true });
  const { data } = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  fs.writeFileSync(path.join(dir, name + '.jpg'), Buffer.from(data, 'base64'));
  return path.join('tests/artifacts/qa', name + '.jpg');
}

const click = (client, selector) =>
  evaluate(
    client,
    `(function () {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'нет элемента: ' + ${JSON.stringify(selector)};
      el.scrollIntoView({ block: 'center' });
      el.click();
      return 'ok';
    })()`
  );

const fill = (client, selector, value) =>
  evaluate(
    client,
    `(function () {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'нет поля: ' + ${JSON.stringify(selector)};
      el.focus();
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()`
  );

/* Ошибки шага «контакты» живут не в общем боксе, а рядом с самим полем
   (.field-error + aria-invalid). Общий бокс ловит только отказы шага. */
const fieldText = (client) =>
  evaluate(
    client,
    `Array.prototype.slice.call(document.querySelectorAll('.field-error'))
      .map(function (el) { return (el.textContent || '').trim(); })
      .filter(Boolean).join(' | ')`
  );

const text = (client, selector) =>
  evaluate(
    client,
    `(function () {
      var el = document.querySelector(${JSON.stringify(selector)});
      return el ? (el.textContent || '').trim() : null;
    })()`
  );

async function waitFor(client, expression, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let value = null;
    try {
      value = await evaluate(client, expression);
    } catch {
      /* страница перерисовывается */
    }
    if (value) return value;
    if (Date.now() > deadline) return null;
    await sleep(140);
  }
}

/* ── Отчёт ──────────────────────────────────────────────────────────────── */

const results = [];
const report = { lines: [], last: 'старт' };

function record(area, name, ok, detail) {
  results.push({ area, name, ok, detail: detail || '' });
  const line = `${ok ? '✓' : '✗'} [${area}] ${name}${detail ? ' — ' + detail : ''}`;
  report.lines.push(line);
  report.last = `[${area}] ${name}`;
  console.log('  ' + line);
  writeReport();
}

/*
 * Отчёт пишется в файл, а не только в вывод. Вывод перенаправленного процесса
 * буферизуется, и по нему нельзя понять, где проверка встала. Файл отчёта
 * дописывается на каждом шаге, поэтому после зависания видно последнюю
 * выполненную проверку.
 */
function writeReport(suffix) {
  try {
    const dir = path.join(ROOT, 'tests', 'artifacts', 'qa');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'report.txt'),
      report.lines.join('\n') + '\n' + (suffix ? '\n' + suffix + '\n' : ''),
      'utf8'
    );
  } catch {
    /* отчёт — вспомогательный, падать из-за него нельзя */
  }
}

/* ── Сценарий ───────────────────────────────────────────────────────────── */

async function run() {
  console.log('\nFANTOM — проверка в браузере\n');

  /*
   * Сторож. Проверка общается с браузером, а браузер может закрыться посреди
   * работы: без сторожа скрипт ждёт ответа, которого не будет, и висит до
   * внешнего лимита — молча, без единой подсказки, что сломалось. Сторож
   * останавливает прогон и сообщает, на какой проверке он встал.
   */
  const watchdog = setTimeout(() => {
    writeReport(`ПРОВЕРКА ОСТАНОВЛЕНА СТОРОЖЕМ: не завершилась за ${WATCHDOG_MINUTES} мин.`);
    console.error(`\nПроверка остановлена: превышен лимит времени. Последняя выполненная проверка — ${report.last}\n`);
    process.exit(1);
  }, WATCHDOG_MINUTES * 60 * 1000);

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantom-qa-'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fantom-chrome-'));
  const appPort = await freePort();
  const cdpPort = await freePort();
  const BASE = `http://127.0.0.1:${appPort}`;

  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      SITE_URL: BASE,
      SITE_TIMEZONE: 'Asia/Almaty',
      DATA_DIR: dataDir,
      MOCK_MODE: 'true',
      ADMIN_PASSWORD: 'qa-password',
      ADMIN_TOKEN: '',
      ADMIN_SESSION_SECRET: 'qa-session-secret',
      QUIET: '1',
      VERCEL: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const serverLog = [];
  server.stdout.on('data', (c) => serverLog.push(String(c)));
  server.stderr.on('data', (c) => serverLog.push(String(c)));

  let chrome = null;
  let client = null;

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(BASE + '/api/health');
        if (response.ok) break;
      } catch {
        /* поднимается */
      }
      await sleep(200);
    }

    chrome = await launchChrome(cdpPort, profile);
    client = await connect(cdpPort);

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Log.enable');
    await client.send('Network.enable');

    /*
     * Наблюдатели метрик ставятся позже — прямо перед замером загрузки.
     * Наблюдатель, включённый с buffered: true на каждом документе обхода,
     * заставляет браузер держать его живым на всех десяти страницах, и это
     * ровно тот лишний груз, из-за которого отзывчивость на первом же шаге
     * проверки падала до нуля.
     */
    const installPerfObservers = () =>
      client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          window.__perf = { lcp: 0, cls: 0, worstShift: 0, sources: [] };
          try {
            new PerformanceObserver(function (list) {
              var entries = list.getEntries();
              var last = entries[entries.length - 1];
              if (last) window.__perf.lcp = Math.round(last.startTime);
            }).observe({ type: 'largest-contentful-paint', buffered: true });
          } catch (error) {}
          try {
            new PerformanceObserver(function (list) {
              list.getEntries().forEach(function (entry) {
                if (entry.hadRecentInput) return;
                window.__perf.cls += entry.value;
                if (entry.value > window.__perf.worstShift) {
                  window.__perf.worstShift = entry.value;
                  window.__perf.sources = (entry.sources || []).slice(0, 3).map(function (source) {
                    var node = source.node;
                    return node ? (node.tagName || '').toLowerCase() + '.' +
                      String(node.className || '').split(' ').filter(Boolean).join('.') : '?';
                  });
                }
              });
            }).observe({ type: 'layout-shift', buffered: true });
          } catch (error) {}
        `
      });

    const consoleIssues = [];
    const failedRequests = [];
    const badResponses = [];
    const posts = [];

    client.on('Runtime.consoleAPICalled', (params) => {
      if (params.type !== 'error' && params.type !== 'warning') return;
      const body = (params.args || []).map((a) => a.value || a.description || '').join(' ').trim();
      consoleIssues.push(`${params.type}: ${body.slice(0, 160)}`);
    });
    client.on('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails || {};
      consoleIssues.push(`exception: ${(details.text || '')} ${details.exception ? details.exception.description || '' : ''}`.slice(0, 200));
    });
    client.on('Log.entryAdded', (params) => {
      const entry = params.entry || {};
      if (entry.level !== 'error' && entry.level !== 'warning') return;
      consoleIssues.push(`log/${entry.level}: ${String(entry.text || '').slice(0, 160)}`);
    });
    // Запросы, которые проверка блокирует намеренно (отказ сети на шаге
    // отправки), в обрывы не записываем: это часть сценария, а не дефект.
    let blockingApi = false;
    client.on('Network.loadingFailed', (params) => {
      if (params.canceled || blockingApi || params.blockedReason) return;
      failedRequests.push(`${params.type || '?'} ${params.errorText || ''}`);
    });
    client.on('Network.responseReceived', (params) => {
      const response = params.response || {};
      if (response.status >= 400) {
        badResponses.push(`${response.status} ${String(response.url).replace(BASE, '')}`);
      }
    });
    // Считаем именно созданные заявки: 201 — новая, 200 — идемпотентный повтор.
    // Так проверка «тройной клик не создал три заявки» смотрит на результат,
    // а не на число запросов, и не зависит от того, гасит ли кнопка повтор.
    const created = [];
    client.on('Network.requestWillBeSent', (params) => {
      const request = params.request || {};
      if (request.method === 'POST' && String(request.url).includes('/api/bookings')) {
        posts.push(params.requestId || request.url);
      }
    });
    client.on('Network.responseReceived', (params) => {
      const response = params.response || {};
      if (response.status === 201 && String(response.url).includes('/api/bookings')) {
        created.push(params.requestId);
      }
    });

    /* ── 1. Обход всех страниц на двух ширинах ─────────────────────────── */

    if (wants('core')) {
    console.log('  — Обход страниц (375 и 1440) —');

    const routeReport = [];
    for (const vp of VIEWPORTS) {
      for (const route of ROUTES) {
        await viewport(client, vp.width, vp.height, vp.mobile);
        await navigate(client, BASE + route);
        await scrollThrough(client);

        const info = JSON.parse(
          await evaluate(
            client,
            `(function () {
              var html = document.documentElement;
              var overflow = html.scrollWidth - window.innerWidth;
              var offenders = [];
              if (overflow > 1) {
                Array.prototype.slice.call(document.querySelectorAll('body *')).forEach(function (el) {
                  if (offenders.length > 3) return;
                  var r = el.getBoundingClientRect();
                  if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
                    offenders.push(el.tagName.toLowerCase() + '.' +
                      String(el.className || '').split(' ').filter(Boolean).join('.') +
                      '(' + Math.round(r.left) + '..' + Math.round(r.right) + ')');
                  }
                });
              }
              var brokenImages = [];
              Array.prototype.slice.call(document.images).forEach(function (img) {
                var src = img.getAttribute('src');
                // Пустой src — не сломанный кадр: так объявлена картинка лайтбокса,
                // её заполняет скрипт при открытии. Проверяем только то, что грузилось.
                if (!src) return;
                if (img.complete && img.naturalWidth === 0) brokenImages.push(src);
              });
              var imagesNoAlt = Array.prototype.slice.call(document.images)
                .filter(function (img) { return img.getAttribute('alt') === null; }).length;

              var ids = {};
              var duplicateIds = [];
              Array.prototype.slice.call(document.querySelectorAll('[id]')).forEach(function (el) {
                if (ids[el.id]) duplicateIds.push(el.id); else ids[el.id] = true;
              });

              return JSON.stringify({
                overflow: overflow,
                offenders: offenders,
                title: document.title,
                h1: document.querySelectorAll('h1').length,
                lang: document.documentElement.getAttribute('lang'),
                brokenImages: brokenImages,
                imagesNoAlt: imagesNoAlt,
                duplicateIds: duplicateIds,
                bodyText: document.body.innerText
              });
            })()`
          )
        );

        routeReport.push({ route, vp: vp.name, info });

        if (info.overflow > 1) {
          record('вёрстка', `${route} @${vp.name}: нет горизонтальной прокрутки`, false, `лишних ${info.overflow}px → ${info.offenders.join(', ')}`);
        }
        if (info.brokenImages.length) {
          record('изображения', `${route} @${vp.name}: все кадры загрузились`, false, info.brokenImages.slice(0, 3).join(', '));
        }
        if (info.duplicateIds.length) {
          record('разметка', `${route} @${vp.name}: нет дублей id`, false, info.duplicateIds.slice(0, 4).join(', '));
        }
        if (info.h1 !== 1) {
          record('разметка', `${route} @${vp.name}: ровно один H1`, false, `найдено ${info.h1}`);
        }
        if (info.imagesNoAlt) {
          record('доступность', `${route} @${vp.name}: у всех img есть alt`, false, `без alt: ${info.imagesNoAlt}`);
        }
        for (const needle of FORBIDDEN) {
          if (info.bodyText.includes(needle)) {
            record('контент', `${route} @${vp.name}: нет технического текста «${needle}»`, false, '');
          }
        }

        /*
         * Повторяющиеся предложения внутри одной страницы. Такой повтор
         * читается как небрежность: два одинаковых абзаца подряд появляются,
         * когда лид страницы и лид секции совпадают дословно. Проверяем один
         * раз на ширину, иначе каждая находка сообщается дважды.
         */
        if (vp.name === '375') {
          const repeats = JSON.parse(
            await evaluate(
              client,
              `(function () {
                var text = document.body.innerText.replace(/\\s+/g, ' ');
                var parts = text.split(/(?:\\. |! |\\? |\\u2026 )/).map(function (s) { return s.trim(); })
                  .filter(function (s) { return s.length > 60; });
                var seen = {};
                var dup = [];
                parts.forEach(function (sentence) {
                  if (seen[sentence]) {
                    if (dup.indexOf(sentence) === -1) dup.push(sentence);
                  } else {
                    seen[sentence] = true;
                  }
                });
                return JSON.stringify(dup);
              })()`
            )
          );
          if (repeats.length) {
            record('контент', `${route}: нет повторяющихся предложений`, false,
              repeats.slice(0, 2).map((s) => s.slice(0, 68) + '…').join(' | '));
          }
        }
      }
    }

    const overflowFails = routeReport.filter((r) => r.info.overflow > 1).length;
    if (!overflowFails) record('вёрстка', `Горизонтальной прокрутки нет на ${routeReport.length} комбинациях`, true, '');

    // Контент проверяется «на провал»: строка ниже показывает, что проверка
    // действительно прошла, а не была пропущена.
    if (!results.some((item) => item.area === 'контент' && !item.ok)) {
      record('контент', `Страницы без технических подробностей и повторов текста (${ROUTES.length})`, true, '');
    }

    /* ── 2. Мелкие экраны 320–430 ──────────────────────────────────────── */

    console.log('\n  — Мелкие экраны —');
    for (const width of MOBILE_WIDTHS) {
      await viewport(client, width, 780, true);
      for (const route of ['/', '/quests', '/prices', '/booking', '/contacts']) {
        await navigate(client, BASE + route);
        const overflow = await evaluate(client, 'document.documentElement.scrollWidth - window.innerWidth');
        if (overflow > 1) {
          record('вёрстка', `${route} @${width}px: без переполнения`, false, `лишних ${overflow}px`);
        }
      }
    }
    record('вёрстка', 'Ширины 320–430: переполнения нет', true, '');

    /* ── 3. Цели нажатия ───────────────────────────────────────────────── */

    console.log('\n  — Цели нажатия и перекрытия —');
    await viewport(client, 375, 812, true);
    await navigate(client, BASE + '/booking');
    await scrollThrough(client);

    /*
     * Размер целей нажатия.
     *
     * Порог разный по стандарту: элементы управления (кнопки, ссылки-кнопки,
     * поля, крошки, навигация) обязаны быть не меньше 44 px — это рекомендация
     * Apple/Google и уровень AAA WCAG. Ссылка внутри обычного текста попадает
     * под явное исключение WCAG 2.5.8: ей достаточно 24 px, раздувать её нельзя,
     * иначе строки текста начнут перекрывать друг друга по зонам нажатия.
     */
    const taps = JSON.parse(
      await evaluate(
        client,
        `(function () {
          var nodes = Array.prototype.slice.call(
            document.querySelectorAll('a[href], button, input, select, summary, [role="radio"], [role="button"]')
          ).filter(function (el) {
            var cs = getComputedStyle(el);
            var r = el.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
          });

          function path(el) {
            var own = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
              (el.className ? '.' + String(el.className).split(' ').filter(Boolean).slice(0, 2).join('.') : '');
            var parent = el.parentElement;
            var up = parent
              ? ' < ' + parent.tagName.toLowerCase() +
                (parent.className ? '.' + String(parent.className).split(' ').filter(Boolean).slice(0, 2).join('.') : '')
              : '';
            return own + up;
          }

          var controls = [];
          var inline = [];
          nodes.forEach(function (el) {
            var r = el.getBoundingClientRect();
            var parent = el.parentElement;
            var ownText = (el.textContent || '').trim().length;
            var parentText = parent ? (parent.textContent || '').trim().length : 0;
            var isInlineLink = el.tagName === 'A' && parentText > ownText + 12;
            var label = path(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height);
            if (isInlineLink) {
              if (r.height < 24) inline.push(label);
            } else if (r.height < 44 || r.width < 24) {
              controls.push(label);
            }
          });
          return JSON.stringify({ total: nodes.length, controls: controls, inline: inline });
        })()`
      )
    );

    record('нажатия', `Элементы управления ≥ 44px (проверено ${taps.total})`, taps.controls.length === 0,
      taps.controls.length ? `мелких ${taps.controls.length}: ${taps.controls.join('; ')}` : '');
    record('нажатия', 'Ссылки внутри текста ≥ 24px', taps.inline.length === 0,
      taps.inline.length ? `мелких ${taps.inline.length}: ${taps.inline.slice(0, 4).join('; ')}` : '');

    /*
     * Перекрытие. Проверять его можно только для элемента, реально попавшего
     * в кадр: у прокрученного за экран элемента точка отсчёта попадает в
     * случайное место, и проверка начинает «находить» липкую шапку поверх
     * футера. Поэтому каждый элемент сначала прокручивается в центр экрана,
     * и только потом смотрим, что лежит в его центральной точке.
     */
    /*
     * Перекрытие проверяется в положении, когда элемент стоит в середине
     * экрана. Так проверка отвечает на нужный вопрос: «может ли посетитель
     * вообще дотянуться до этого элемента?». Если смотреть на случайную
     * позицию прокрутки, липкая нижняя панель «перекрывает» то, что через
     * мгновение окажется выше неё, и проверка сообщает о несуществующей
     * проблеме. Если элемент закрыт и после центрирования — это настоящий
     * баг: до него нельзя добраться никакой прокруткой.
     */
    const INTERACTIVE = 'a[href], button, input, select, summary, [role="radio"], [role="button"]';
    const candidates = JSON.parse(
      await evaluate(
        client,
        `(function () {
          var keep = [];
          Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(INTERACTIVE)})).forEach(function (el, index) {
            var cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            // Намеренно скрытое (skip-link до фокуса) проверять нельзя:
            // его точка нажатия появляется только при переходе с клавиатуры.
            if (cs.clipPath !== 'none' || cs.clip !== 'auto') return;
            if (Number(cs.opacity) === 0) return;
            var r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return;
            keep.push(index);
          });
          return JSON.stringify(keep);
        })()`
      )
    );

    const covered = [];
    for (const index of candidates) {
      await evaluate(
        client,
        `document.querySelectorAll(${JSON.stringify(INTERACTIVE)})[${index}].scrollIntoView({ block: 'center' })`
      );
      await sleep(130);
      const hit = await evaluate(
        client,
        `(function () {
          var el = document.querySelectorAll(${JSON.stringify(INTERACTIVE)})[${index}];
          var r = el.getBoundingClientRect();
          if (r.top < -1 || r.bottom > window.innerHeight + 1) return '';
          var top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (top && top !== el && !el.contains(top) && !top.contains(el)) {
            return (el.tagName.toLowerCase() + ' ' +
              (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ')).slice(0, 40) +
              ' → сверху ' + top.tagName.toLowerCase() + '.' +
              String(top.className || '').split(' ').filter(Boolean).join('.');
          }
          return '';
        })()`
      );
      if (hit) covered.push(hit);
    }

    const uniqueCovered = [...new Set(covered)];
    record('нажатия', `Интерактивные элементы ничем не перекрыты (проверено ${candidates.length})`,
      uniqueCovered.length === 0, uniqueCovered.slice(0, 6).join('; '));

    }

    /* ── 4. Запись на мобильном, как пользователь ──────────────────────── */

    console.log('\n  — Запись целиком (375px) —');
    await viewport(client, 375, 812, true);
    await navigate(client, BASE + '/booking');

    const steps = [
      { selector: '.package-option[data-package]', label: 'шаг 1: программа' },
      { selector: '[data-date]', label: 'шаг 2: дата' }
    ];
    let flowOk = true;
    for (const step of steps) {
      const clicked = await click(client, step.selector);
      if (clicked !== 'ok') {
        record('запись', `${step.label} выбрана`, false, clicked);
        flowOk = false;
        break;
      }
      await sleep(320);
      const nextIndex = step.label.includes('1') ? 2 : 3;
      const advanced = await click(client, `[data-next="${nextIndex}"]`);
      await sleep(420);
      if (advanced !== 'ok') {
        record('запись', `переход после шага ${nextIndex - 1}`, false, String(advanced));
        flowOk = false;
        break;
      }
    }

    if (flowOk) {
      const slotReady = await waitFor(client, `Boolean(document.querySelector('.slot-btn[data-slot]'))`, 8000);
      if (!slotReady) {
        record('запись', 'свободные слоты загрузились', false, 'за 8 секунд не появилось ни одной кнопки времени');
        flowOk = false;
      }
    }

    if (flowOk) {
      record('запись', 'шаги 1–3 пройдены, слоты загрузились', true, '');
      await click(client, '.slot-btn[data-slot]');
      await sleep(300);
      // Шаг 4 — «Гости и контакты»: число игроков и данные для связи на одном экране.
      await click(client, '[data-next="4"]');
      await sleep(320);

      await click(client, '[data-guests-plus]');
      await sleep(200);
      const guests = await text(client, '[data-summary-guests]');

      await fill(client, '#name', 'Проверка Браузер');
      await fill(client, '#phone', '+7 700 555 44 33');
      await sleep(200);
      const consentOk = await click(client, '#consent');
      await sleep(200);
      await click(client, '[data-next="5"]');
      await sleep(360);

      const summary = JSON.parse(
        await evaluate(
          client,
          `JSON.stringify({
            package: (document.querySelector('[data-summary-package]') || {}).textContent,
            date: (document.querySelector('[data-summary-date]') || {}).textContent,
            time: (document.querySelector('[data-summary-time]') || {}).textContent,
            guests: (document.querySelector('[data-summary-guests]') || {}).textContent
          })`
        )
      );

      const filled = summary.package && summary.package !== '—' && summary.time && summary.time !== '—' && summary.date !== '—';
      record('запись', 'сводка заполнена перед отправкой', Boolean(filled), JSON.stringify(summary));

      // Ждём минимальное время заполнения: сервер отклоняет слишком быстрые
      // отправки как ботовые, и это правильное поведение, которое проверка
      // обязана учитывать.
      await sleep(3200);
      const before = posts.length;
      await click(client, '[data-submit]');
      const ref = await waitFor(client, `(function () {
        var el = document.querySelector('[data-success-ref]');
        var box = document.querySelector('[data-success]');
        if (!box || box.hasAttribute('hidden')) return null;
        return el && el.textContent.trim() !== '—' ? el.textContent.trim() : null;
      })()`, 10000);

      if (!ref) {
        record('запись', 'заявка принята, экран успеха показан', false, `консоль: ${consoleIssues.slice(-2).join(' | ') || 'пусто'}`);
        flowOk = false;
      } else {
        const success = JSON.parse(
          await evaluate(
            client,
            `JSON.stringify({
              package: (document.querySelector('[data-success-package]') || {}).textContent,
              date: (document.querySelector('[data-success-date]') || {}).textContent,
              time: (document.querySelector('[data-success-time]') || {}).textContent,
              guests: (document.querySelector('[data-success-guests]') || {}).textContent,
              note: (document.querySelector('[data-success-note]') || {}).textContent
            })`
          )
        );
        record('запись', `заявка принята: ${ref}`, true, `программа «${success.package}», ${success.date}, ${success.time}, ${success.guests}`);
        record('запись', 'экран успеха повторяет выбор пользователя',
          Boolean(success.package && success.package !== '—' && success.time && success.time !== '—'),
          JSON.stringify(success).slice(0, 160));
        record('запись', 'в сводке шага 6 совпало число гостей', summary.guests === success.guests, `${summary.guests} / ${success.guests}`);
      }

      record('запись', 'на отправку ушёл один POST', posts.length - before === 1, `POST: ${posts.length - before}`);
    }

    /* ── Канал связи и ник в Telegram ──────────────────────────────────── */

    console.log('\n  — Канал связи и ник в Telegram —');

    await viewport(client, 375, 812, true);
    await navigate(client, BASE + '/booking');

    const wizardShape = JSON.parse(
      await evaluate(
        client,
        `JSON.stringify({
          steps: document.querySelectorAll('.wizard-step').length,
          progress: document.querySelectorAll('[data-progress-step]').length,
          guestsOnContacts: Boolean(document.querySelector('[data-step="4"] [data-guests-plus]'))
        })`
      )
    );
    record('запись', 'в мастере пять шагов, гости на шаге контактов',
      wizardShape.steps === 5 && wizardShape.progress === 5 && wizardShape.guestsOnContacts === true,
      `шагов ${wizardShape.steps}, пунктов прогресса ${wizardShape.progress}, счётчик гостей на шаге контактов: ${wizardShape.guestsOnContacts}`);

    await click(client, '.package-option[data-package]');
    await sleep(240);
    await click(client, '[data-next="2"]');
    await sleep(240);
    await click(client, '[data-date]');
    await sleep(240);
    await click(client, '[data-next="3"]');
    await waitFor(client, `Boolean(document.querySelector('.slot-btn[data-slot]'))`, 8000);
    await click(client, '.slot-btn[data-slot]');
    await sleep(200);
    await click(client, '[data-next="4"]');
    await sleep(320);

    const nickHiddenForWhatsapp = await evaluate(client, `document.querySelector('[data-nick-field]').hidden`);
    record('канал связи', 'при WhatsApp поле ника скрыто', nickHiddenForWhatsapp === true,
      `hidden=${nickHiddenForWhatsapp}`);

    await pickMessenger('telegram');
    const nickInfo = JSON.parse(
      await evaluate(
        client,
        `(function () {
          var field = document.querySelector('[data-nick-field]');
          var input = document.querySelector('#nick');
          return JSON.stringify({
            hidden: field.hidden,
            required: input.hasAttribute('required'),
            label: (field.querySelector('label') || {}).textContent
          });
        })()`
      )
    );
    record('канал связи', 'при выборе Telegram появляется поле ника',
      nickInfo.hidden === false && nickInfo.required === true,
      `скрыто=${nickInfo.hidden}, обязательно=${nickInfo.required}, подпись «${(nickInfo.label || '').trim()}»`);
    await shot(client, 'booking-step-contacts-telegram-375');

    // Пустой ник не должен пускать дальше
    await sleep(3400);
    await fill(client, '#name', 'Телеграм Проверка');
    await fill(client, '#phone', '+7 700 222 33 44');
    await click(client, '#consent');
    await sleep(200);
    const postsBeforeNick = posts.length;
    await click(client, '[data-next="5"]');
    await sleep(900);
    const nickError = await fieldText(client);
    record('канал связи', 'без ника дальше не пускает и объясняет почему',
      posts.length === postsBeforeNick && /ник|telegram/i.test(nickError || ''),
      `«${nickError || '— пусто'}»`);

    // Ник в свободной форме: «Fantom_Uka» и «@Fantom_Uka» — одно и то же
    await fill(client, '#nick', 'Fantom_Uka');
    await sleep(200);
    await click(client, '[data-next="5"]');
    await sleep(420);
    const confirmText = await text(client, '[data-confirm]');
    record('канал связи', 'ник виден на шаге проверки',
      /@Fantom_Uka/i.test(confirmText || ''),
      `${(confirmText || '').replace(/\s+/g, ' ').slice(0, 96)}`);

    // Возврат на WhatsApp: поле скрывается и значение не остаётся в форме
    await click(client, '[data-back="4"]');
    await sleep(320);
    await pickMessenger('whatsapp');
    const switched = JSON.parse(
      await evaluate(
        client,
        `JSON.stringify({
          hidden: document.querySelector('[data-nick-field]').hidden,
          value: document.querySelector('#nick').value
        })`
      )
    );
    record('канал связи', 'возврат на WhatsApp прячет поле и очищает ник',
      switched.hidden === true && switched.value === '',
      `скрыто=${switched.hidden}, значение «${switched.value}»`);

    /* ── 5. Крайние случаи ─────────────────────────────────────────────── */

    console.log('\n  — Крайние случаи —');

    /* Доводит мастер до нужного шага теми же кликами, что и посетитель.
       Повторяется в нескольких проверках, поэтому вынесено отдельно. */
    async function reachStep(target, options) {
      const opts = options || {};
      await navigate(client, BASE + '/booking');
      await click(client, '.package-option[data-package]');
      await sleep(240);
      await click(client, '[data-next="2"]');
      await sleep(240);
      await click(client, '[data-date]');
      await sleep(240);
      await click(client, '[data-next="3"]');
      await waitFor(client, `Boolean(document.querySelector('.slot-btn[data-slot]'))`, 8000);
      if (target <= 3) return;
      await click(client, '.slot-btn[data-slot]');
      await sleep(200);
      await click(client, '[data-next="4"]');
      await sleep(240);
      if (target <= 4) return;
      // Сервер не принимает заявку, отправленную быстрее трёх секунд после
      // открытия формы: это защита от ботов. Проверка обязана её уважать,
      // а не обходить, иначе получает 422 и делает неверный вывод.
      await sleep(3400);
      await fill(client, '#name', opts.name || 'Проверка Крайняя');
      await fill(client, '#phone', opts.phone || '+7 700 111 22 33');
      if (opts.messenger) await pickMessenger(opts.messenger, opts.nick);
      if (opts.consent) await click(client, '#consent');
      await sleep(200);
      await click(client, '[data-next="5"]');
      await sleep(320);
    }

    /* Переключение канала связи так, как это делает человек: выбираем радио
       и, если нужно, вписываем ник. */
    async function pickMessenger(value, nick) {
      await evaluate(
        client,
        `(function () {
          var radio = document.querySelector('input[name="messenger"][value="' + ${JSON.stringify(value)} + '"]');
          if (!radio) return false;
          radio.click();
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`
      );
      await sleep(220);
      if (nick) await fill(client, '#nick', nick);
      await sleep(160);
    }

    // Согласие не проставлено: заявка уходить не должна
    await reachStep(6, { consent: false });
    const consentError = `${(await text(client, '[data-form-error]')) || ''} ${(await fieldText(client)) || ''}`.trim();
    const postsBeforeNoConsent = posts.length;
    await click(client, '[data-submit]');
    await sleep(1200);
    const consentSubmitError = `${(await text(client, '[data-form-error]')) || ''} ${(await fieldText(client)) || ''}`.trim();
    record('крайние случаи', 'без согласия заявка не уходит', posts.length === postsBeforeNoConsent,
      `POST: ${posts.length - postsBeforeNoConsent}`);
    record('крайние случаи', 'без согласия причина названа человеку',
      /соглас/i.test(consentError) || /соглас/i.test(consentSubmitError),
      `«${consentError || consentSubmitError || '— пусто'}»`);

    // Короткий телефон: форма не должна ни пропустить его, ни отправить заявку
    await reachStep(6, { name: 'Плохой Телефон', phone: '+7 700', consent: true });
    const phoneError = `${(await text(client, '[data-form-error]')) || ''} ${(await fieldText(client)) || ''}`.trim();
    const postsBeforeBadPhone = posts.length;
    await click(client, '[data-submit]');
    await sleep(1200);
    const phoneSubmitError = `${(await text(client, '[data-form-error]')) || ''} ${(await fieldText(client)) || ''}`.trim();
    record('крайние случаи', 'короткий телефон не проходит',
      posts.length === postsBeforeBadPhone && /телефон/i.test(`${phoneError} ${phoneSubmitError}`),
      `«${phoneError || phoneSubmitError || '— пусто'}» · POST: ${posts.length - postsBeforeBadPhone}`);

    // Тройной клик по кнопке: созданных заявок должно остаться ровно одна
    await reachStep(6, { name: 'Двойной Клик', phone: '+7 700 999 88 77', consent: true });
    const createdBefore = created.length;
    await evaluate(
      client,
      `(function () {
        var btn = document.querySelector('[data-submit]');
        btn.click();
        btn.click();
        btn.click();
        return true;
      })()`
    );
    await sleep(2600);
    const doubleRef = await text(client, '[data-success-ref]');
    record('крайние случаи', 'тройной клик создаёт одну заявку', created.length - createdBefore === 1,
      `создано заявок: ${created.length - createdBefore}`);
    record('крайние случаи', 'после отправки показан номер заявки',
      Boolean(doubleRef && doubleRef !== '—'), `номер ${doubleRef || '—'}`);

    // Смена даты после выбора времени: время в сводке не должно остаться старым
    await navigate(client, BASE + '/booking');
    await click(client, '.package-option[data-package]');
    await sleep(220);
    await click(client, '[data-next="2"]');
    await sleep(220);
    await click(client, '[data-date]');
    await sleep(220);
    await click(client, '[data-next="3"]');
    await waitFor(client, `Boolean(document.querySelector('.slot-btn[data-slot]'))`, 8000);
    await click(client, '.slot-btn[data-slot]');
    await sleep(250);
    const timeBefore = await text(client, '[data-summary-time]');
    await click(client, '[data-back="2"]');
    await sleep(260);
    const chips = await evaluate(client, `document.querySelectorAll('[data-date]').length`);
    if (chips > 1) {
      await evaluate(client, `document.querySelectorAll('[data-date]')[1].click()`);
      await sleep(400);
    }
    const timeAfter = await text(client, '[data-summary-time]');
    record('крайние случаи', 'при смене даты старое время не остаётся',
      timeAfter === '—' || timeAfter !== timeBefore,
      `было «${timeBefore}», стало «${timeAfter}»`);

    // Отказ API: человеческое сообщение вместо поломки
    console.log('  — Отказ сети и перезагрузка —');
    blockingApi = true;
    await client.send('Network.setBlockedURLs', { urls: ['*/api/bookings*'] });
    await reachStep(5, { name: 'Отказ Сети', phone: '+7 700 333 22 11', consent: true });
    await click(client, '[data-submit]');
    await sleep(2500);
    const networkError = await text(client, '[data-form-error]');
    record('крайние случаи', 'при отказе сети сообщение понятное, а не «500»',
      Boolean(networkError && networkError.length > 8 && !/500|undefined|NaN/.test(networkError)),
      String(networkError || '— пусто'));
    await client.send('Network.setBlockedURLs', { urls: [] });
    blockingApi = false;

    // Обновление страницы посреди мастера
    await navigate(client, BASE + '/booking');
    await click(client, '.package-option[data-package]');
    await sleep(250);
    await navigate(client, BASE + '/booking');
    const afterReload = await text(client, '[data-summary-package]');
    record('крайние случаи', 'после перезагрузки страница цела', afterReload !== null, `программа: «${afterReload}»`);

    // Обновление на успешном экране не должно ломать страницу
    await navigate(client, BASE + '/booking/status');
    const statusH1 = await text(client, 'h1');
    record('крайние случаи', 'страница статуса открывается', Boolean(statusH1), String(statusH1));

    /* ── 6. Цена: одна и та же на всех экранах ─────────────────────────── */

    if (wants('ui')) {
    console.log('\n  — Цена —');
    await viewport(client, 375, 812, true);
    await navigate(client, BASE + '/');

    const priceData = JSON.parse(
      await evaluate(
        client,
        `(function () {
          var hero = document.querySelector('.hero-facts');
          var heroMatch = hero ? (hero.textContent || '').match(/от\\s*([\\d\\s\\u00a0]+)\\s*₸/) : null;
          var heroPrice = heroMatch ? Number(heroMatch[1].replace(/\\D/g, '')) : null;
          var options = Array.prototype.slice.call(document.querySelectorAll('.package-option[data-package-price]'))
            .map(function (el) {
              var match = String(el.dataset.packagePrice).match(/([\\d\\s\\u00a0]+)\\s*₸/);
              return {
                id: el.dataset.package,
                label: el.dataset.packagePrice,
                price: match ? Number(match[1].replace(/\\D/g, '')) : null
              };
            })
            .filter(function (item) { return item.price; });
          return JSON.stringify({ heroPrice: heroPrice, options: options });
        })()`
      )
    );

    const cheapest = priceData.options.slice().sort((a, b) => a.price - b.price)[0];
    record('цена', 'Самая низкая цена на витрине совпадает с hero',
      Boolean(cheapest && priceData.heroPrice === cheapest.price),
      `hero «от ${priceData.heroPrice}», минимум по программам «${cheapest ? cheapest.price : '—'}»`);

    /*
     * Каждая программа: цена, объявленная в карточке, против цены, которая
     * оказалась в сводке записи после её выбора. Сравнение целиком идёт
     * внутри страницы: обработчик выбора синхронный, а переносить строки с
     * неразрывными пробелами через границу Node→браузер — верный способ
     * получить расхождение там, где его нет.
     */
    const priceCompare = JSON.parse(
      await evaluate(
        client,
        `(function () {
          function firstPrice(text) {
            if (!text) return null;
            var match = String(text).match(/([\\d\\s\\u00a0]+)\\s*₸/);
            return match ? Number(match[1].replace(/\\D/g, '')) : null;
          }
          var out = [];
          Array.prototype.slice.call(document.querySelectorAll('.package-option[data-package-price]')).forEach(function (el) {
            el.click();
            var summary = document.querySelector('[data-summary-price]');
            out.push({
              id: el.dataset.package,
              card: el.dataset.packagePrice,
              summary: summary ? summary.textContent.trim() : null,
              cardPrice: firstPrice(el.dataset.packagePrice),
              summaryPrice: firstPrice(summary ? summary.textContent : '')
            });
          });
          return JSON.stringify(out);
        })()`
      )
    );

    const priceMismatch = priceCompare
      .filter((item) => item.cardPrice === null || item.cardPrice !== item.summaryPrice)
      .map((item) => `${item.id}: карточка ${item.cardPrice} ₸ («${item.card}»), сводка ${item.summaryPrice} ₸ («${item.summary}»)`);
    record('цена', `Цена в карточке программы совпадает со сводкой (программ: ${priceCompare.length})`,
      priceCompare.length > 0 && priceMismatch.length === 0,
      priceMismatch.join('; '));

    /* ── 7. Метрики загрузки ───────────────────────────────────────────── */

    console.log('\n  — Загрузка —');

    /*
     * Два разных замера. Первый — только первый экран: столько посетитель
     * реально скачивает, прежде чем что-то увидит, и именно это влияет на LCP.
     * Второй — вся страница после прокрутки, когда подтянулись ленивые кадры.
     * Смешивать их нельзя: «вес первого экрана» из полной прокрутки — это вес
     * всей страницы, и норматив по нему ничего не значит.
     */
    const perfSnapshot = async () => JSON.parse(
      await evaluate(
        client,
        `(function () {
          var resources = performance.getEntriesByType('resource');
          // transferSize равен нулю для ответа из кэша, поэтому берём размер
          // тела: иначе повторный заход показывает «передано 0 КБ».
          function size(item) { return item.transferSize || item.encodedBodySize || 0; }
          var images = resources.filter(function (item) { return item.initiatorType === 'img' || /\\.webp$/.test(item.name); });
          var heaviest = images.slice().sort(function (a, b) { return size(b) - size(a); })[0];
          return JSON.stringify({
            lcp: window.__perf.lcp,
            cls: Math.round(window.__perf.cls * 1000) / 1000,
            worstShift: Math.round(window.__perf.worstShift * 1000) / 1000,
            shiftSources: window.__perf.sources,
            total: resources.reduce(function (sum, item) { return sum + size(item); }, 0),
            byType: resources.reduce(function (acc, item) {
              var key = item.initiatorType || 'other';
              acc[key] = (acc[key] || 0) + size(item);
              return acc;
            }, {}),
            top: resources.slice().sort(function (a, b) { return size(b) - size(a); }).slice(0, 5)
              .map(function (item) {
                return item.name.split('/').pop().slice(0, 52) + ' ' + Math.round(size(item) / 1024) + 'КБ';
              }),
            images: images.map(function (item) { return item.name.split('/').pop(); }),
            heaviest: heaviest ? heaviest.name.split('/').pop() + ' ' + Math.round(size(heaviest) / 1024) + 'КБ' : '—',
            heaviestImage: heaviest ? heaviest.name.split('/').pop() : '',
            heaviestImageKb: heaviest ? Math.round(size(heaviest) / 1024) : 0
          });
        })()`
      )
    );

    /*
     * Замер идёт с эмуляцией мобильной сети. Без неё Chrome считает канал
     * бесконечно быстрым и подтягивает ленивые кадры на несколько экранов
     * вперёд — на localhost в загрузку первого экрана попадает вся страница,
     * и замер перестаёт что-либо значить. Профиль: 4G, 10 Мбит/с, 70 мс.
     */
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 70,
      downloadThroughput: (10 * 1024 * 1024) / 8,
      uploadThroughput: (3 * 1024 * 1024) / 8,
      connectionType: 'cellular4g'
    });

    /*
     * Кэш очищаем: иначе браузер отдаёт ресурсы из памяти, и замер показывает
     * то, что уже лежало в кэше от предыдущих переходов, а не реальную
     * загрузку. Один и тот же адрес считается в разных размерах, поэтому
     * без очистки результат меняется от прогона к прогону.
     */
    await installPerfObservers();
    await client.send('Network.clearBrowserCache');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });

    await viewport(client, 375, 812, true);
    await navigate(client, BASE + '/');
    await sleep(900);
    const firstScreen = await perfSnapshot();

    record('загрузка', 'Сдвиг вёрстки CLS меньше 0,1', firstScreen.cls < 0.1,
      `CLS ${firstScreen.cls}${firstScreen.shiftSources.length ? ' → ' + firstScreen.shiftSources.join(', ') : ''}`);
    record('загрузка', 'Первый экран отрисован быстрее 2,5 с',
      firstScreen.lcp > 0 && firstScreen.lcp < 2500, `LCP ${firstScreen.lcp} мс`);
    record('загрузка', 'На телефоне грузится облегчённый кадр hero',
      firstScreen.images.some((name) => name.includes('nun-hood-900')),
      `кадры: ${firstScreen.images.filter((n) => n.includes('nun-hood')).join(', ') || 'кадр hero не найден'}`);
    /*
     * Вес разбит на две честные величины.
     *
     * Критический путь — то, без чего страница не отрисуется: стили, скрипты
     * и то, что тянется тегом link. Его вес проверяется по нормативу.
     *
     * Замер идёт по локальному серверу, который отдаёт файлы БЕЗ сжатия
     * (Vercel сжимает сам, nginx на VPS нужно настроить отдельно). Поэтому
     * числа — верхняя оценка: в продакшене стили приходят в разы легче.
     * Именно поэтому нормативы здесь с запасом, а не «как в PageSpeed».
     */
    const byType = Object.keys(firstScreen.byType)
      .sort((a, b) => firstScreen.byType[b] - firstScreen.byType[a])
      .map((key) => `${key} ${Math.round(firstScreen.byType[key] / 1024)}КБ`)
      .join(', ');

    const criticalPath =
      (firstScreen.byType.link || 0) + (firstScreen.byType.script || 0) + (firstScreen.byType.css || 0);
    record('загрузка', 'Критический путь (стили, скрипты, link) меньше 300 КБ без сжатия',
      criticalPath > 0 && criticalPath < 307200,
      `${Math.round(criticalPath / 1024)} КБ; разбивка: ${byType}`);

    record('загрузка', 'Ни один кадр не тяжелее 250 КБ',
      firstScreen.heaviestImageKb > 0 && firstScreen.heaviestImageKb <= 250,
      `тяжелейший кадр: ${firstScreen.heaviestImage || '—'} ${firstScreen.heaviestImageKb} КБ`);

    await scrollThrough(client);
    await sleep(900);
    const fullPage = await perfSnapshot();
    record('загрузка', 'Страница целиком меньше 1,5 МБ без сжатия', fullPage.total > 0 && fullPage.total < 1572864,
      `передано ${Math.round(fullPage.total / 1024)} КБ, самый тяжёлый кадр: ${fullPage.heaviest}`);

    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    });
    await client.send('Network.setCacheDisabled', { cacheDisabled: false });

    /* ── Правила веб-интерфейса ────────────────────────────────────────── */

    console.log('\n  — Правила интерфейса —');
    await viewport(client, 375, 812, true);
    await navigate(client, BASE + '/booking');
    await scrollThrough(client);

    const a11y = JSON.parse(
      await evaluate(
        client,
        `(function () {
          var nodes = Array.prototype.slice.call(
            document.querySelectorAll('a[href], button, input, select, textarea, summary')
          );
          var nameless = [];
          var unlabelled = [];
          nodes.forEach(function (el) {
            var cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            // Ловушка для ботов и служебные скрытые поля — не часть интерфейса.
            if (el.closest('[aria-hidden="true"]')) return;
            if (el.type === 'hidden') return;
            var r = el.getBoundingClientRect();
            if (!r.width && !r.height) return;

            var name = (el.getAttribute('aria-label') || '').trim() ||
              (el.getAttribute('aria-labelledby') ? 'по ссылке' : '') ||
              (el.textContent || '').trim() ||
              (el.getAttribute('title') || '');
            var short = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
              '.' + String(el.className || '').split(' ').filter(Boolean).slice(0, 1).join('');
            if (!name) nameless.push(short);

            var isField = el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
            if (isField && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
              var byFor = el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
              if (!byFor && !el.closest('label')) unlabelled.push(short);
            }
          });
          return JSON.stringify({ total: nodes.length, nameless: nameless, unlabelled: unlabelled });
        })()`
      )
    );

    record('интерфейс', `У интерактивных элементов есть доступное имя (проверено ${a11y.total})`,
      a11y.nameless.length === 0, a11y.nameless.slice(0, 5).join(', '));
    record('интерфейс', 'У каждого поля формы есть связанная подпись',
      a11y.unlabelled.length === 0, a11y.unlabelled.slice(0, 5).join(', '));

    const preferences = JSON.parse(
      await evaluate(
        client,
        `(function () {
          var button = document.querySelector('.btn');
          var heading = document.querySelector('h1') || document.querySelector('h2');
          var root = getComputedStyle(document.documentElement);
          var bcs = button ? getComputedStyle(button) : null;
          var hcs = heading ? getComputedStyle(heading) : null;
          return JSON.stringify({
            colorScheme: root.colorScheme,
            touchAction: bcs ? bcs.touchAction : '—',
            tapHighlight: bcs ? (bcs.webkitTapHighlightColor || '—') : '—',
            headingWrap: hcs ? (hcs.textWrap || hcs.textWrapMode || '—') : '—'
          });
        })()`
      )
    );

    record('интерфейс', 'Страница сообщает браузеру тёмную тему',
      /dark/.test(preferences.colorScheme), `color-scheme: ${preferences.colorScheme}`);
    record('интерфейс', 'Касание срабатывает без задержки на двойной тап',
      preferences.touchAction === 'manipulation', `touch-action: ${preferences.touchAction}`);
    record('интерфейс', 'Подсветка касания задана, а не системная',
      preferences.tapHighlight !== '—' && !/rgba?\\(0, 0, 0, 0\\)/.test(preferences.tapHighlight),
      `-webkit-tap-highlight-color: ${preferences.tapHighlight}`);
    record('интерфейс', 'Заголовок переносится без висячего слова',
      /balance/.test(preferences.headingWrap), `text-wrap: ${preferences.headingWrap}`);

    // Клавиатура: каждый шаг табуляции должен давать видимый и доступный фокус
    const focusProblems = [];
    let focused = 0;
    await evaluate(client, `(function(){ window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); return true; })()`);
    for (let i = 0; i < 12; i += 1) {
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
      await sleep(150);
      const info = JSON.parse(
        await evaluate(
          client,
          `(function () {
            var el = document.activeElement;
            if (!el || el === document.body) return JSON.stringify({ tag: 'body' });
            var cs = getComputedStyle(el);
            var r = el.getBoundingClientRect();
            var covered = '';
            if (r.width && r.height) {
              var x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
              var y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
              var top = document.elementFromPoint(x, y);
              if (top && top !== el && !el.contains(top) && !top.contains(el)) {
                covered = top.tagName.toLowerCase() + '.' + String(top.className || '').split(' ')[0];
              }
            }
            return JSON.stringify({
              tag: el.tagName.toLowerCase(),
              cls: String(el.className || '').split(' ')[0],
              name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24),
              outline: cs.outlineStyle + ' ' + cs.outlineWidth,
              ring: cs.boxShadow !== 'none',
              visible: cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05,
              covered: covered
            });
          })()`
        )
      );
      if (info.tag === 'body') continue;
      focused += 1;
      const hasRing = info.ring || /^(solid|dashed|dotted|auto|double) (?!0px)/.test(info.outline);
      if (!info.visible || !hasRing || info.covered) {
        focusProblems.push(
          info.tag + '.' + info.cls + ' «' + info.name + '»' +
          (!info.visible ? ' невидим' : '') +
          (!hasRing ? ' без обводки фокуса' : '') +
          (info.covered ? ' перекрыт ' + info.covered : '')
        );
      }
    }
    record('интерфейс', `Клавиатурный фокус виден и ничем не перекрыт (проверено ${focused})`,
      focused >= 5 && focusProblems.length === 0, focusProblems.slice(0, 4).join('; '));

    }

    /* ── 8. Ссылки ─────────────────────────────────────────────────────── */

    console.log('\n  — Ссылки —');
    await viewport(client, 1440, 900, false);
    await navigate(client, BASE + '/');
    const hrefs = [];
    for (const route of ROUTES) {
      await navigate(client, BASE + route);
      const found = await evaluate(
        client,
        `JSON.stringify(Array.prototype.slice.call(document.querySelectorAll('a[href]'))
          .map(function (a) { return a.getAttribute('href'); })
          .filter(function (h) {
            return h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:') && !h.startsWith('http');
          }))`
      );
      hrefs.push(...JSON.parse(found));
    }
    const unique = [...new Set(hrefs)];
    const broken = [];
    for (const href of unique) {
      try {
        const response = await fetch(BASE + href);
        if (response.status >= 400) broken.push(`${href} → ${response.status}`);
      } catch (error) {
        broken.push(`${href} → ${error.message}`);
      }
    }
    if (broken.length) {
      record('ссылки', 'Внутренние ссылки живые', false, broken.slice(0, 5).join(', '));
    } else {
      record('ссылки', `Внутренние ссылки живые (проверено ${unique.length})`, true, '');
    }

    /* ── 7. Консоль и сеть ─────────────────────────────────────────────── */

    console.log('\n  — Консоль и сеть —');
    const realConsole = consoleIssues.filter((line) => !/favicon|404 \(Not Found\)/i.test(line));
    const realNetwork = badResponses.filter((line) => !/favicon/i.test(line));

    record('консоль', 'Ошибок и предупреждений нет', realConsole.length === 0, realConsole.slice(0, 4).join(' | '));
    record('сеть', 'Ответов 4xx/5xx нет', realNetwork.length === 0, realNetwork.slice(0, 4).join(' | '));
    record('сеть', 'Обрывов загрузки нет', failedRequests.length === 0, failedRequests.slice(0, 4).join(' | '));
  } finally {
    clearTimeout(watchdog);
    writeReport();
    if (client) {
      try {
        await client.send('Browser.close');
      } catch {
        /* уже закрыт */
      }
    }
    if (chrome) chrome.kill();
    server.kill();
    await sleep(300);
    // Уборка не должна подменять собой результат: на Windows временный профиль
    // Chrome иногда ещё занят, и падение при удалении скрыло бы итог проверки.
    for (const dir of [dataDir, profile]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* временная папка останется — это не ошибка проверки */
      }
    }
  }

  const failed = results.filter((item) => !item.ok);
  const areas = [...new Set(results.map((item) => item.area))];

  console.log('\n' + '─'.repeat(78));
  for (const area of areas) {
    const list = results.filter((item) => item.area === area);
    const bad = list.filter((item) => !item.ok).length;
    console.log(`  ${bad ? '✗' : '✓'} ${area.padEnd(16)} проверок ${String(list.length).padStart(3)}   провалено ${bad}`);
  }
  console.log('─'.repeat(78));
  console.log(`  Всего проверок: ${results.length}   провалено: ${failed.length}`);
  if (failed.length) {
    console.log('\n  Провалы:');
    for (const item of failed) console.log(`   • [${item.area}] ${item.name}${item.detail ? ' — ' + item.detail : ''}`);
  }
  console.log('─'.repeat(78) + '\n');

  process.exit(failed.length ? 1 : 0);
}

run().catch((error) => {
  console.error('Проверка не выполнена:', error.message);
  if (process.env.VERBOSE) console.error(error.stack);
  process.exit(1);
});
