'use strict';

/**
 * Fantom — хоррор-квест в Усть-Каменогорске.
 * HTTP-сервер: страницы с серверным рендером, REST API бронирования, админка.
 *
 * Запуск:  npm start        (http://localhost:3000)
 * Тесты:   npm test
 */

const http = require('http');
const path = require('path');
const fsp = require('fs/promises');

const config = require('./src/config');
const store = require('./src/store');
const render = require('./src/render');
const api = require('./src/api');
const audit = require('./src/lib/audit');
const {
  createRouter,
  sendHtml,
  sendText,
  sendJson,
  serveStatic,
  logRequest,
  ensureDataDirs,
  HttpError
} = require('./src/lib/http');

const router = createRouter();

// ── Страницы ───────────────────────────────────────────────────────────────

const pages = [
  [/^\/$/, (req, res, params, query) => render.renderHome()],
  [/^\/quests$/, () => render.renderQuests()],
  [/^\/booking$/, (req, res, params, query) => render.renderBooking(query)],
  [/^\/booking\/status$/, () => render.renderBookingStatus()],
  [/^\/how-it-works$/, () => render.renderHowItWorks()],
  [/^\/safety$/, () => render.renderSafety()],
  [/^\/reviews$/, () => render.renderReviews()],
  [/^\/faq$/, () => render.renderFaq()],
  [/^\/contacts$/, () => render.renderContacts()],
  [/^\/privacy$/, () => render.renderPrivacy()]
];

for (const [pattern, handler] of pages) {
  router.get(pattern, async (req, res, params, query) => {
    const html = await handler(req, res, params, query);
    sendHtml(res, 200, html, { 'cache-control': 'no-cache' });
  });
}

router.get(/^\/quests\/(?<slug>[a-z0-9-]+)$/, async (req, res, params) => {
  const html = await render.renderQuest(params.slug);
  if (!html) throw new HttpError(404, 'not_found', 'Сценарий не найден.');
  sendHtml(res, 200, html, { 'cache-control': 'no-cache' });
});

// Админка: статическая оболочка, данные подтягиваются по API с токеном.
router.get(/^\/admin\/?$/, async (req, res) => {
  const file = path.join(config.publicDir, 'admin.html');
  const html = await fsp.readFile(file, 'utf8');
  sendHtml(res, 200, html, { 'cache-control': 'no-store' });
});

// Служебные файлы
router.get(/^\/sitemap\.xml$/, async (req, res) => {
  sendText(res, 200, await render.renderSitemap(), 'application/xml; charset=utf-8', {
    'cache-control': 'public, max-age=3600'
  });
});

router.get(/^\/robots\.txt$/, (req, res) => {
  sendText(res, 200, render.renderRobots(), 'text/plain; charset=utf-8', {
    'cache-control': 'public, max-age=3600'
  });
});

router.get(/^\/healthz$/, async (req, res) => {
  const data = await store.read();
  sendJson(res, 200, {
    ok: true,
    version: config.version,
    timezone: data.settings.timezone,
    platform: config.platform,
    mockMode: config.mockMode,
    storage: {
      driver: config.storeDriver,
      persistent: config.persistentStorage,
      demoMode: config.demoMode
    },
    bookings: data.bookings.length,
    serverTime: new Date().toISOString()
  });
});

// ── API ────────────────────────────────────────────────────────────────────

api.register(router);

// ── Обработка запросов ─────────────────────────────────────────────────────

function parseQuery(url) {
  const query = {};
  for (const [key, value] of url.searchParams) query[key] = value;
  return query;
}

async function handle(req, res) {
  const startedAt = Date.now();
  const url = new URL(req.url, config.siteUrl);

  try {
    // Стенд без постоянного хранилища: изменения из админки исчезнут вместе
    // с инстансом. Честнее отказать, чем делать вид, что настройки сохранены.
    // Вход и выход из админки остаются доступны — просмотр работает.
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (
      isWrite &&
      config.demoMode &&
      url.pathname.startsWith('/api/admin') &&
      !/\/api\/admin\/(login|logout)$/.test(url.pathname)
    ) {
      throw new HttpError(
        503,
        'demo_mode',
        config.demoReason + ' Заявки и настройки на этом стенде доступны только для просмотра.'
      );
    }

    const matched = router.match(req.method, url.pathname);
    if (matched) {
      const params = await resolveParams(matched, url.pathname);
      await matched.route.handler(req, res, params, parseQuery(url));
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const served = await serveStatic(req, res, url.pathname);
      if (served) return;
    }

    // Мягкий 404: страница вместо JSON — пользователь обычно попадает сюда из ссылки.
    if ((req.headers.accept || '').includes('text/html')) {
      sendHtml(res, 404, await render.renderNotFound());
      return;
    }
    sendJson(res, 404, { ok: false, code: 'not_found', message: 'Маршрут не найден.' });
  } catch (error) {
    const expected = error instanceof HttpError;
    const status = expected ? error.status : error.status || 500;
    const code = error.code || 'internal_error';
    // Осознанные отказы (HttpError) не считаем сбоями и не пишем в журнал ошибок.
    if (status >= 500 && !expected) {
      console.error('[error]', error);
      await audit.append('server.error', { code, message: error.message, path: url.pathname });
    }
    if (res.headersSent) {
      res.end();
      return;
    }
    // Текст HttpError написан для пользователя и должен дойти как есть.
    // Общая формулировка — только для непредвиденных сбоев.
    const message =
      expected || status < 500
        ? error.message
        : 'Внутренняя ошибка сервера. Заявка не потеряна — попробуйте ещё раз.';
    if ((req.headers.accept || '').includes('application/json') || url.pathname.startsWith('/api/')) {
      sendJson(res, status, { ok: false, code, message, ...(error.extra || {}) });
    } else {
      sendHtml(
        res,
        status,
        `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Ошибка ${status}</title>
        <link rel="stylesheet" href="/styles.css"></head><body><main class="section"><div class="wrap narrow">
        <p class="eyebrow">Ошибка ${status}</p><h1>${status === 404 ? 'Страница не найдена' : 'Что-то сломалось'}</h1>
        <p>${message}</p><div class="cta-row"><a class="btn btn-primary" href="/">На главную</a>
        <a class="btn btn-wa" href="${config.siteUrl}/booking">К записи</a></div></div></main></body></html>`
      );
    }
  } finally {
    logRequest(req, res, startedAt);
  }
}

/**
 * Роутер поддерживает именованные группы, но params нужно получить и из
 * регулярного выражения без групп — собираем совместимый объект.
 */
async function resolveParams(matched, pathname) {
  if (matched.params && Object.keys(matched.params).length) return matched.params;
  const groups = matched.match.groups || {};
  return { ...groups };
}

// ── Старт ──────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('X-Powered-By', 'Fantom');
  handle(req, res).catch((error) => {
    console.error('[fatal]', error);
    try {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Внутренняя ошибка сервера');
    } catch {
      /* соединение уже закрыто */
    }
  });
});

server.keepAliveTimeout = 15000;
server.headersTimeout = 20000;

/**
 * Слушаем порт синхронно, во время загрузки модуля.
 *
 * Это требование Vercel: платформа находит Node-сервер именно по вызову
 * server.listen() при инициализации модуля и дальше проксирует на него
 * запросы через внутренний порт. Поэтому здесь нельзя прятать listen()
 * за `require.main === module` или за await.
 */
function listen() {
  if (server.listening) return;
  if (config.host) server.listen(config.port, config.host);
  else server.listen(config.port);
}

function logBanner(data) {
  if (config.isVercel || process.env.QUIET === '1') return;
  const base = `http://${config.host || 'localhost'}:${server.address() ? server.address().port : config.port}`;
  console.log('');
  console.log('  Fantom — хоррор-квест, Усть-Каменогорск');
  console.log(`  Сайт:     ${base}`);
  console.log(`  Админка:  ${base}/admin`);
  console.log(`  API:      ${base}/api/site`);
  console.log(`  Таймзона: ${data ? data.settings.timezone : config.timezone}`);
  console.log(
    `  Хранилище: ${config.storeDriver}${config.persistentStorage ? ' (постоянное)' : ' (ВРЕМЕННОЕ — данные не сохраняются)'}`
  );
  console.log(`  Режим:    ${config.mockMode ? 'MOCK — заявки не уходят бизнесу' : 'LIVE — заявки уходят администратору'}`);
  if (config.demoMode) {
    console.log('  ВНИМАНИЕ: ' + config.demoReason);
  }
  if (config.isDefaultAdminToken) {
    console.log('  ВНИМАНИЕ: используется стандартный ADMIN_TOKEN. Замените его в .env до публикации.');
  }
  console.log('');
}

let bootPromise = null;

/** Идемпотентная инициализация: создание каталогов, база, первая запись в журнал. */
function boot() {
  if (!bootPromise) {
    bootPromise = (async () => {
      ensureDataDirs();
      const data = await store.load();
      await audit.append('server.started', {
        version: config.version,
        platform: config.platform,
        storeDriver: config.storeDriver,
        mockMode: config.mockMode,
        timezone: data.settings.timezone
      });
      return data;
    })().catch((error) => {
      // Прогрев не должен ронять процесс: база догрузится при первом запросе.
      console.error('[boot] инициализация не завершилась:', error.message);
      return null;
    });
  }
  return bootPromise;
}

async function start() {
  listen();
  const data = await boot();
  logBanner(data);
  await new Promise((resolve) => {
    if (server.listening) return resolve();
    server.once('listening', resolve);
  });
  return server;
}

function shutdown(signal) {
  console.log(`\n[server] получен ${signal}, останавливаемся…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// На Vercel порт назначает платформа: получив http-сервер в default export,
// она сама вызывает listen() на внутреннем порту. Собственный вызов там
// приводит к ERR_SERVER_ALREADY_LISTEN и запросы зависают без ответа.
// Локально (и в тестах) порт выбираем мы.
if (!config.isVercel) listen();
boot().then(logBanner);

// Vercel требует, чтобы default export модуля был функцией или http-сервером:
// иначе он отвечает «Invalid export found in module». Экспортируем сам сервер,
// а именованные экспорты (нужны тестам и локальному запуску) навешиваем
// свойствами на тот же объект, чтобы требование выполнялось.
module.exports = server;
module.exports.server = server;
module.exports.start = start;
module.exports.handle = handle;
