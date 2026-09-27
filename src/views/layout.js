'use strict';

const config = require('../config');
const { esc, escJson } = require('../lib/validate');

const NAV = [
  { href: '/quests', label: 'Квесты' },
  { href: '/how-it-works', label: 'Как это работает' },
  { href: '/safety', label: 'Безопасность' },
  { href: '/reviews', label: 'Отзывы' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contacts', label: 'Контакты' }
];

function abs(pathname) {
  return config.siteUrl + (pathname.startsWith('/') ? pathname : '/' + pathname);
}

function header(settings, currentPath) {
  const phoneHref = 'tel:' + settings.phoneE164;
  const nav = NAV.map(
    (item) =>
      `<a href="${esc(item.href)}"${currentPath === item.href ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`
  ).join('');

  return `<header class="site-header" id="top">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="Fantom — на главную">
      <span class="brand-mark" aria-hidden="true">${brandMarkSvg()}</span>
      <span class="brand-text">
        <strong>Fantom</strong>
        <small>Усть-Каменогорск</small>
      </span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
      <span class="nav-toggle-bars" aria-hidden="true"></span>
      <span class="sr-only">Меню</span>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="Основная навигация">${nav}</nav>
    <div class="header-actions">
      <a class="phone-link" href="${esc(phoneHref)}">
        <span class="phone-label">Телефон</span>
        <span class="phone-value">${esc(settings.phone)}</span>
      </a>
      <a class="btn btn-primary" href="/booking">Выбрать дату и время</a>
    </div>
  </div>
  ${mockBanner()}
</header>`;
}

function brandMarkSvg() {
  return `<svg viewBox="0 0 32 32" width="32" height="32" role="img" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="30" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M8 24V8h12v3.4h-8.2v3.1h6.6v3.4h-6.6V24z" fill="currentColor"/>
    <circle cx="24.5" cy="24.5" r="2.5" fill="var(--red)"/>
  </svg>`;
}

/**
 * Плашка честности. Два независимых предупреждения:
 *  - demoMode — у стенда нет постоянного хранилища (например, деплой на Vercel
 *    без подключённого KV): заявки не переживут перезапуск инстанса;
 *  - MOCK_MODE — заявки не уходят реальному бизнесу.
 * Показываем их, пока оба условия сняты не будут.
 */
function mockBanner() {
  const parts = [];
  if (config.demoMode) {
    parts.push(
      '<b>Демонстрационный стенд.</b> Постоянное хранилище не подключено: заявки не сохраняются ' +
        'и не отправляются бизнесу. Для реальной брони используйте WhatsApp.'
    );
  }
  if (config.mockMode) {
    parts.push(
      'Тестовый режим <code>MOCK_MODE</code>: заявки не уходят реальному бизнесу.'
    );
  }
  if (!parts.length) return '';

  return `<div class="mock-banner${config.demoMode ? ' mock-banner--demo' : ''}" role="status">
    <div class="wrap">
      <strong>${config.demoMode ? 'Демо-режим' : 'Тестовый режим'}</strong>
      <span>${parts.join(' ')}</span>
    </div>
  </div>`;
}

function footer(settings, location) {
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <p class="footer-brand">${esc(settings.brand.displayName)}</p>
      <p class="footer-note">${
        location
          ? esc(location.fullAddress)
          : esc(settings.city)
      }</p>
      <p class="footer-note">${esc(settings.hours.label)}</p>
    </div>
    <div>
      <p class="footer-title">Запись</p>
      <p><a href="/booking">Выбрать дату и время</a></p>
      <p><a href="${esc(settings.whatsappUrl)}" rel="noopener">Спросить в WhatsApp</a></p>
      <p><a href="tel:${esc(settings.phoneE164)}">${esc(settings.phone)}</a></p>
    </div>
    <div>
      <p class="footer-title">Информация</p>
      <p><a href="/safety">Безопасность и правила</a></p>
      <p><a href="/faq">Частые вопросы</a></p>
      <p><a href="/privacy">Политика обработки данных</a></p>
      <p><a href="/contacts">Контакты и как добраться</a></p>
    </div>
    <div>
      <p class="footer-title">Источники фактов</p>
      <p><a href="${esc(settings.instagramUrl)}" rel="noopener">Instagram @_fantom_uka_</a></p>
      <p><a href="${esc(settings.rating.sourceUrl)}" rel="noopener">Карточка 2ГИС</a></p>
      <p class="footer-note">Рейтинг и количество отзывов — динамические данные, обновлено ${esc(
        settings.rating.updatedAt
      )}.</p>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>Прототип сайта. Перед публикацией владелец подтверждает цены, сценарии, правила, возраст и канал обработки заявок.</span>
    <a href="/admin">Админка</a>
  </div>
</footer>
${soundToggle()}`;
}

function soundToggle() {
  return `<button class="sound-toggle" type="button" data-sound-toggle aria-pressed="false" hidden>
  <span class="sound-icon" aria-hidden="true"></span>
  <span class="sound-text" data-sound-text>Звук выключен</span>
</button>`;
}

/**
 * @param {object} options
 * @param {string} options.title       — <title>
 * @param {string} options.description — meta description
 * @param {string} options.path        — canonical path
 * @param {string} options.body        — HTML контента
 * @param {object} options.settings
 * @param {object|null} options.location
 * @param {Array} options.jsonLd       — массив JSON-LD объектов
 * @param {string} [options.ogType]
 * @param {string} [options.bodyClass]
 * @param {boolean} [options.noindex]
 */
function page(options) {
  const { title, description, path, body, settings, location, jsonLd = [], ogType = 'website', bodyClass = '', noindex = false } = options;
  const canonical = abs(path);
  const ogImage = abs('/og.png');

  const ld = jsonLd
    .filter(Boolean)
    .map((item) => `<script type="application/ld+json">${escJson(item)}</script>`)
    .join('\n    ');

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(canonical)}">
    ${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
    <meta name="theme-color" content="#08090a">
    <meta name="format-detection" content="telephone=yes">
    <meta property="og:type" content="${esc(ogType)}">
    <meta property="og:site_name" content="Fantom">
    <meta property="og:locale" content="ru_RU">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:image" content="${esc(ogImage)}">
    <meta property="og:image:alt" content="Fantom — хоррор-квест в Усть-Каменогорске">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${esc(ogImage)}">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/favicon.svg">
    <link rel="manifest" href="/site.webmanifest">
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

module.exports = { page, abs, NAV };
