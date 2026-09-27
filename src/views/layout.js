'use strict';

const config = require('../config');
const { esc, escJson } = require('../lib/validate');

const NAV = [
  { href: '/quests', label: 'Квест' },
  { href: '/prices', label: 'Пакеты' },
  { href: '/gallery', label: 'Галерея' },
  { href: '/reviews', label: 'Отзывы' },
  { href: '/contacts', label: 'Контакты' }
];

function abs(pathname) {
  return config.siteUrl + (pathname.startsWith('/') ? pathname : '/' + pathname);
}

/** Упрощённый знак FANTOM: круг, рога и крылья — по мотивам вывески. */
function brandMark(size = 30) {
  return `<svg class="brand-mark" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">
  <circle cx="24" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="1.6" opacity="0.55"/>
  <path d="M14 15.5c2.6.6 4.4 2.3 5.3 4.6M34 15.5c-2.6.6-4.4 2.3-5.3 4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  <path d="M24 17.6c4.6 0 7.6 3.1 7.6 7.4 0 3-1.5 5.4-3.7 6.7l1.4 3.3-2.9-1.5h-4.8l-2.9 1.5 1.4-3.3c-2.2-1.3-3.7-3.7-3.7-6.7 0-4.3 3-7.4 7.6-7.4z" fill="currentColor" fill-opacity="0.9"/>
  <circle cx="21.2" cy="24.6" r="1.5" fill="#08090a"/>
  <circle cx="26.8" cy="24.6" r="1.5" fill="#08090a"/>
  <path d="M8 32.5c3.4 3.3 6.2 5 8.4 5.2M40 32.5c-3.4 3.3-6.2 5-8.4 5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.7"/>
</svg>`;
}

function header(settings, path) {
  const nav = NAV.map(
    (item) =>
      `<a href="${esc(item.href)}"${path === item.href ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`
  ).join('');

  return `<header class="site-header" data-header>
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="FANTOM — на главную">
      ${brandMark(34)}
      <span class="brand-text">
        <strong>Fantom</strong>
        <small>${esc(settings.city)}</small>
      </span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
      <span class="nav-toggle-bars" aria-hidden="true"></span>
      <span class="sr-only">Меню</span>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="Основная навигация">${nav}</nav>
    <div class="header-actions">
      <a class="header-phone" href="tel:${esc(settings.phoneE164)}">
        <span class="header-phone-label">Телефон</span>
        <span class="header-phone-value">${esc(settings.phone)}</span>
      </a>
      <a class="btn btn-blood" href="/booking">Забронировать</a>
    </div>
  </div>
  ${stageBanner()}
</header>`;
}

/**
 * Плашка честности. Показывается, пока стенд не готов принимать реальные
 * заявки: либо нет постоянного хранилища (demoMode), либо включён MOCK_MODE.
 */
function stageBanner() {
  const parts = [];
  if (config.demoMode) {
    parts.push(
      '<b>Демонстрационный стенд.</b> Постоянное хранилище не подключено: заявка не сохранится и не дойдёт до администратора. Для реальной брони напишите в WhatsApp.'
    );
  }
  if (config.mockMode) {
    parts.push('Режим <code>MOCK_MODE</code>: уведомления администратору не отправляются.');
  }
  if (!parts.length) return '';
  return `<div class="stage-banner${config.demoMode ? ' stage-banner--demo' : ''}" role="status">
    <div class="wrap"><strong>${config.demoMode ? 'Демо' : 'Тест'}</strong> ${parts.join(' ')}</div>
  </div>`;
}

function footer(settings, location) {
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand-col">
      <p class="footer-brand">${esc(settings.brand.displayName)}</p>
      <p class="footer-tagline">${esc(settings.brand.tagline)}</p>
      <p class="footer-note">${esc(settings.brand.legalName)}</p>
      <p class="footer-note">${esc(location.fullAddress)}</p>
      <p class="footer-note">${esc(settings.hours.label)}</p>
    </div>
    <div>
      <p class="footer-title">Запись</p>
      <p><a href="/booking">Выбрать время</a></p>
      <p><a href="/prices">Пакеты и цены</a></p>
      <p><a href="tel:${esc(settings.phoneE164)}">${esc(settings.phone)}</a></p>
      <p><a href="${esc(settings.whatsappUrl)}" rel="noopener">WhatsApp</a></p>
    </div>
    <div>
      <p class="footer-title">О квесте</p>
      <p><a href="/quests">Сценарий и режимы</a></p>
      <p><a href="/gallery">Галерея</a></p>
      <p><a href="/reviews">Отзывы</a></p>
      <p><a href="/faq">Частые вопросы</a></p>
    </div>
    <div>
      <p class="footer-title">Связь</p>
      <p><a href="${esc(settings.instagramUrl)}" rel="noopener">${esc(settings.instagramHandle)}</a></p>
      <p><a href="${esc(location.galleryUrl)}" rel="noopener">Фото в 2ГИС</a></p>
      <p><a href="${esc(location.routeUrl)}" rel="noopener">Маршрут в 2ГИС</a></p>
      <p><a href="/privacy">Обработка данных</a></p>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>
      Рейтинг и отзывы — динамические данные 2ГИС, обновлено ${esc(settings.rating.updatedAt)}.
      Непроверенные сведения помечены на сайте как «уточняется».
    </span>
    <a href="/admin">Админка</a>
  </div>
</footer>
${soundControl()}
${contactBar(settings)}`;
}

/** Звук: выключен по умолчанию, включается только явным нажатием. */
function soundControl() {
  return `<button class="sound-control" type="button" data-sound-toggle aria-pressed="false" hidden>
  <span class="sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
  <span class="sound-label" data-sound-label>Звук выключен</span>
</button>`;
}

/**
 * Компактная панель контактов на мобильном.
 * Не перекрывает контент: одна строка, учитывает safe-area, скрывается
 * при прокрутке вниз и при открытой клавиатуре (см. app.js).
 */
function contactBar(settings) {
  return `<div class="contact-bar" data-contact-bar>
  <a class="contact-bar-btn contact-bar-btn--ghost" href="tel:${esc(settings.phoneE164)}">
    <span aria-hidden="true">☏</span><span>Позвонить</span>
  </a>
  <a class="contact-bar-btn contact-bar-btn--wa" href="${esc(settings.whatsappUrl)}" rel="noopener">
    <span aria-hidden="true">✆</span><span>WhatsApp</span>
  </a>
  <a class="contact-bar-btn contact-bar-btn--blood" href="/booking">Забронировать</a>
</div>`;
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {string} options.path
 * @param {string} options.body
 * @param {object} options.settings
 * @param {object} options.location
 * @param {Array}  options.jsonLd
 * @param {string} [options.ogImage]
 * @param {string} [options.bodyClass]
 * @param {boolean} [options.noindex]
 * @param {string} [options.ogType]
 */
function page(options) {
  const {
    title,
    description,
    path,
    body,
    settings,
    location,
    jsonLd = [],
    ogImage = abs('/images/og/og-fantom.jpg'),
    bodyClass = '',
    noindex = false,
    ogType = 'website'
  } = options;

  const canonical = abs(path);
  const ld = jsonLd
    .filter(Boolean)
    .map((item) => `<script type="application/ld+json">${escJson(item)}</script>`)
    .join('\n    ');

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(canonical)}">
    ${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
    <meta name="theme-color" content="#050505">
    <meta name="format-detection" content="telephone=yes">
    <meta name="geo.region" content="KZ-VOS">
    <meta name="geo.placename" content="Усть-Каменогорск">
    <meta property="og:type" content="${esc(ogType)}">
    <meta property="og:site_name" content="FANTOM">
    <meta property="og:locale" content="ru_RU">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:image" content="${esc(ogImage)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="FANTOM — хоррор-квест в Усть-Каменогорске">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${esc(ogImage)}">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/favicon.svg">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preload" as="image" href="/images/quests/nun-hood-900.webp" fetchpriority="high">
    <link rel="stylesheet" href="/styles.css">
    ${ld}
  </head>
  <body class="${esc(bodyClass)}">
    <a class="skip-link" href="#main">Перейти к содержанию</a>
    ${header(settings, path)}
    <main id="main">
${body}
    </main>
    ${footer(settings, location)}
    <script src="/app.js" defer></script>
  </body>
</html>`;
}

module.exports = { page, abs, NAV, brandMark };
