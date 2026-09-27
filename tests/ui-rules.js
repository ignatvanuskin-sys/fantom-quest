'use strict';

/**
 * Быстрая проверка правил веб-интерфейса.
 *
 * Отдельный скрипт, а не часть browser-qa.js: правила проверяются на одной
 * странице за полминуты. Долгая сессия с браузером в этом окружении живёт
 * на пределе — за десять минут обхода Chrome начинает падать, и результат
 * теряется. Короткая сессия доходит до конца стабильно.
 *
 * Проверяется то, что видно только в браузере:
 *   · доступные имена у интерактивных элементов и подписи у полей;
 *   · видимый фокус при переходе табуляцией, фокус ничем не перекрыт;
 *   · страница сообщает браузеру тёмную тему;
 *   · касание обрабатывается без задержки на двойной тап;
 *   · заголовки переносятся без висячего слова.
 *
 * Ссылка на правила: vercel-labs/agent-skills → web-design-guidelines.
 *
 * Запуск: npm run qa:ui
 */

const fs = require('fs');
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
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const PAGES = ['/', '/booking'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

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

function cdp(ws) {
  const pending = new Map();
  let nextId = 1;
  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    send(method, params, timeoutMs = 15000) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome не ответил на ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(new Error(`Канал к Chrome закрыт: ${error.message}`));
        }
      });
    }
  };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'ошибка в выражении');
  return result.result.value;
}

async function run() {
  console.log('\nFANTOM — правила интерфейса\n');

  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome не найден');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantom-ui-'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fantom-ui-chrome-'));
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
      DATA_DIR: dataDir,
      MOCK_MODE: 'true',
      ADMIN_PASSWORD: 'ui-password',
      ADMIN_SESSION_SECRET: 'ui-session-secret',
      QUIET: '1',
      VERCEL: ''
    },
    stdio: 'ignore'
  });

  let chrome = null;
  let client = null;
  const watchdog = setTimeout(() => {
    console.error('\nПроверка остановлена: превышен лимит времени\n');
    process.exit(1);
  }, 90000);

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

    chrome = spawn(
      chromePath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profile}`,
        'about:blank'
      ],
      { stdio: 'ignore' }
    );

    let wsUrl = null;
    for (let attempt = 0; attempt < 60 && !wsUrl; attempt += 1) {
      await sleep(250);
      try {
        const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        const targets = await response.json();
        const page = targets.find((item) => item.type === 'page') || targets[0];
        if (page) wsUrl = page.webSocketDebuggerUrl;
      } catch {
        /* ждём */
      }
    }
    if (!wsUrl) throw new Error('Отладочный порт Chrome не поднялся');

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('WebSocket отклонён')), { once: true });
    });
    client = cdp(ws);

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true
    });

    for (const page of PAGES) {
      await client.send('Page.navigate', { url: BASE + page });
      await sleep(1400);

      const audit = JSON.parse(
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
              if (el.closest('[aria-hidden="true"]') || el.type === 'hidden') return;
              var r = el.getBoundingClientRect();
              if (!r.width && !r.height) return;

              var name = (el.getAttribute('aria-label') || '').trim() ||
                (el.getAttribute('aria-labelledby') ? 'по ссылке' : '') ||
                (el.textContent || '').trim() ||
                (el.getAttribute('title') || '');
              var short = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
              if (!name) nameless.push(short);

              var isField = ['INPUT', 'SELECT', 'TEXTAREA'].indexOf(el.tagName) !== -1;
              if (isField && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
                var byFor = el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
                if (!byFor && !el.closest('label')) unlabelled.push(short);
              }
            });

            var root = getComputedStyle(document.documentElement);
            var button = document.querySelector('.btn');
            var heading = document.querySelector('h1') || document.querySelector('h2');
            var bcs = button ? getComputedStyle(button) : null;
            var hcs = heading ? getComputedStyle(heading) : null;

            return JSON.stringify({
              total: nodes.length,
              nameless: nameless,
              unlabelled: unlabelled,
              colorScheme: root.colorScheme,
              touchAction: bcs ? bcs.touchAction : '—',
              tapHighlight: bcs ? (bcs.webkitTapHighlightColor || '—') : '—',
              headingWrap: hcs ? (hcs.textWrap || hcs.textWrapMode || '—') : '—',
              skipLink: Boolean(document.querySelector('.skip-link')),
              main: Boolean(document.querySelector('main, #main'))
            });
          })()`
        )
      );

      const where = page === '/' ? 'главная' : page;
      record(`${where}: доступное имя у всех элементов (${audit.total})`, audit.nameless.length === 0,
        audit.nameless.slice(0, 4).join(', '));
      record(`${where}: подпись у каждого поля формы`, audit.unlabelled.length === 0,
        audit.unlabelled.slice(0, 4).join(', '));
      record(`${where}: есть ссылка «к содержанию» и сам main`, audit.skipLink && audit.main, '');
      record(`${where}: сообщает тёмную тему`, /dark/.test(audit.colorScheme), audit.colorScheme);
      record(`${where}: касание без задержки`, audit.touchAction === 'manipulation', audit.touchAction);
      record(`${where}: подсветка касания задана`, audit.tapHighlight !== '—' && !/rgba?\\(0, 0, 0, 0\\)/.test(audit.tapHighlight),
        audit.tapHighlight);
      record(`${where}: заголовок без висячего слова`, /balance/.test(audit.headingWrap), audit.headingWrap);
    }

    // Клавиатура: шесть шагов табуляции должны давать видимый и доступный фокус
    await client.send('Page.navigate', { url: BASE + '/' });
    await sleep(1400);
    const focusProblems = [];
    let focused = 0;
    for (let step = 0; step < 6; step += 1) {
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
      await sleep(160);
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
          info.tag + ' «' + info.name + '»' +
          (!info.visible ? ' невидим' : '') +
          (!hasRing ? ' без обводки' : '') +
          (info.covered ? ' перекрыт ' + info.covered : '')
        );
      }
    }
    record(`клавиатура: видимый фокус без перекрытий (${focused} шагов)`,
      focused >= 4 && focusProblems.length === 0, focusProblems.slice(0, 3).join('; '));
  } finally {
    clearTimeout(watchdog);
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
    for (const dir of [dataDir, profile]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* временная папка останется — это не ошибка проверки */
      }
    }
  }

  const failed = results.filter((item) => !item.ok);
  console.log('\n' + '─'.repeat(70));
  console.log(`  Проверок: ${results.length}   провалено: ${failed.length}`);
  if (failed.length) {
    console.log('\n  Провалы:');
    for (const item of failed) console.log(`   • ${item.name}${item.detail ? ' — ' + item.detail : ''}`);
  }
  console.log('─'.repeat(70) + '\n');
  process.exit(failed.length ? 1 : 0);
}

run().catch((error) => {
  console.error('Проверка не выполнена:', error.message);
  if (process.env.VERBOSE) console.error(error.stack);
  process.exit(1);
});
