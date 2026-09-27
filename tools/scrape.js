'use strict';

/**
 * Скрапер на Chrome DevTools Protocol.
 *
 * Зачем: карточка организации в 2ГИС и профиль Instagram — это SPA,
 * которые достраивают контент на клиенте. Обычный HTTP-запрос видит только
 * «скелет» страницы, поэтому фото, цены и часть данных недоступны.
 * Здесь страница открывается в headless Chrome, перехватываются все сетевые
 * запросы (включая внутренние API) и собираются реальные URL изображений.
 *
 * Запуск:
 *   node tools/scrape.js <url> [--wait=9000] [--out=file.json]
 *   node tools/scrape.js <url> --scrolls=12      # прокрутить, чтобы догрузить ленивые фото
 */

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const arg = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const WAIT = Number(arg('wait', '9000'));
const SCROLLS = Number(arg('scrolls', '0'));
const OUT = arg('out', '');
const PORT = 9400 + Math.floor(Math.random() * 300);

const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  for (const candidate of CHROME) {
    try {
      require('fs').accessSync(candidate);
      return candidate;
    } catch {
      /* следующий */
    }
  }
  return null;
}

function cdp(ws) {
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
    on(method, fn) {
      const list = listeners.get(method) || [];
      list.push(fn);
      listeners.set(method, list);
    }
  };
}

async function main() {
  if (!target) {
    console.error('Использование: node tools/scrape.js <url> [--wait=9000] [--scrolls=8] [--out=file.json]');
    process.exit(1);
  }
  const browser = findBrowser();
  if (!browser) {
    console.error('Chrome/Edge не найден. Укажите CHROME_PATH.');
    process.exit(2);
  }

  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'fantom-scrape-'));
  const child = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--lang=ru-RU',
      '--window-size=1440,1000',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* ещё поднимается */
    }
  }
  if (!ready) {
    child.kill();
    console.error('Chrome не открыл отладочный порт');
    process.exit(2);
  }

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket отклонён')), { once: true });
  });
  const client = cdp(ws);

  const requests = [];
  const responses = [];
  client.on('Network.requestWillBeSent', (p) => requests.push({ url: p.request.url, type: p.type }));
  client.on('Network.responseReceived', (p) => {
    responses.push({ url: p.response.url, status: p.response.status, mime: p.response.mimeType, type: p.type });
  });

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');

  console.log(`Открываю ${target}`);
  await client.send('Page.navigate', { url: target });
  await sleep(WAIT);

  for (let i = 0; i < SCROLLS; i += 1) {
    await client.send('Runtime.evaluate', {
      expression: 'window.scrollBy(0, Math.round(window.innerHeight * 0.9))'
    });
    await sleep(900);
  }
  await sleep(1200);

  const extracted = await client.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title,
      url: location.href,
      images: [...document.querySelectorAll('img')].map(function (img) {
        return { src: img.currentSrc || img.src, alt: img.alt || '', w: img.naturalWidth, h: img.naturalHeight };
      }).filter(function (item) { return item.src && item.src.startsWith('http'); }),
      backgrounds: [...document.querySelectorAll('*')].map(function (el) {
        var bg = getComputedStyle(el).backgroundImage;
        return bg && bg !== 'none' && bg.indexOf('url(') === 0 ? bg.slice(5, -2).replace(/["']/g, '') : null;
      }).filter(Boolean),
      links: [...document.querySelectorAll('a[href]')].map(function (a) {
        return { href: a.href, text: (a.textContent || '').trim().slice(0, 80) };
      }),
      text: (document.body.innerText || '').slice(0, 20000)
    })`,
    returnByValue: true
  });

  const data = {
    target,
    scrapedAt: new Date().toISOString(),
    page: JSON.parse(extracted.result.value),
    requests: requests.filter((r) => r.type === 'XHR' || r.type === 'Fetch' || r.type === 'Image' || r.type === 'Document'),
    responses: responses.filter((r) => r.status >= 200 && r.status < 400)
  };

  if (OUT) {
    await fs.writeFile(OUT, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Сохранено: ${OUT}`);
  }

  const photoUrls = [...new Set(
    [...data.page.images.map((i) => i.src), ...data.page.backgrounds]
      .filter((u) => /photo|img|image/i.test(u))
  )];
  console.log(`\nИзображений на странице: ${data.page.images.length}, уникальных фото-URL: ${photoUrls.length}`);
  for (const url of photoUrls.slice(0, 15)) console.log('  ' + url);

  const apiUrls = [...new Set(data.requests.map((r) => r.url).filter((u) => /api|json|graphql/i.test(u)))];
  console.log(`\nЗапросы к API (${apiUrls.length}):`);
  for (const url of apiUrls.slice(0, 20)) console.log('  ' + url);

  console.log('\nТекст страницы (первые 1200 символов):');
  console.log(data.page.text.slice(0, 1200));

  ws.close();
  child.kill();
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  process.exit(0);
}

main().catch((error) => {
  console.error('Скрапер упал:', error.message);
  process.exit(1);
});
