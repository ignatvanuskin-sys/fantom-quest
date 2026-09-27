'use strict';

/**
 * Серверный рендер: данные → HTML с метаданными.
 * Метаданные (title, description, canonical, OG, JSON-LD) собираются на сервере,
 * а не в браузере — это обязательное условие для индексации и превью ссылок.
 */

const config = require('./config');
const store = require('./store');
const time = require('./lib/time');
const availability = require('./services/availability');
const pages = require('./views/pages');

const HORIZON = config.booking.horizonDays;

async function context(query = {}) {
  const data = await store.read();
  const settings = data.settings;
  const location = data.locations[0];
  const quest = data.quests.find((item) => item.isPrimary) || data.quests[0];

  const requestedDate = time.isValidDate(query.date) ? query.date : '';

  /*
   * Горизонт свободных дней ровно один — HORIZON. Раньше рядом жил второй
   * массив на 14 дней: главная показывала занятость по 30 дням, а страница
   * квеста по 14, и один и тот же блок «Ближайшие игры» выдавал в один момент
   * «всего свободно 501» и «229». Для посетителя это выглядело как случайные
   * числа, а сайт прямо обещает не показывать цифры из головы.
   */
  const bookableDays = availability
    .upcoming(data, { days: HORIZON, from: requestedDate || undefined, questId: quest.id })
    .map((day) => ({
      businessDate: day.businessDate,
      label: time.formatDateRu(day.businessDate),
      weekday: day.weekday,
      slots: day.slots,
      availableCount: day.slots.filter((slot) => slot.status === 'open').length
    }));

  return {
    data,
    settings,
    location,
    quest,
    packages: data.packages.filter((item) => item.active !== false),
    addons: data.addons,
    kinoLand: data.kinoLand,
    gallery: data.gallery,
    pricePhotos: data.pricePhotos,
    reviews: data.reviews,
    faq: data.faq.slice().sort((a, b) => a.order - b.order),
    content: data.content,
    bookableDays
  };
}

async function renderHome(query = {}) {
  const c = await context(query);
  return pages.home(c);
}

async function renderQuests(query = {}) {
  const c = await context(query);
  return pages.questPage(c);
}

async function renderPrices(query = {}) {
  const c = await context(query);
  return pages.pricesPage(c);
}

async function renderGallery(query = {}) {
  const c = await context(query);
  return pages.galleryPage(c);
}

async function renderReviews(query = {}) {
  const c = await context(query);
  return pages.reviewsPage(c);
}

async function renderFaq(query = {}) {
  const c = await context(query);
  return pages.faqPage(c);
}

async function renderContacts(query = {}) {
  const c = await context(query);
  return pages.contactsPage(c);
}

/** Запись. Дата и слот могут прийти ссылкой с карточки пакета или дня. */
async function renderBooking(query = {}) {
  const c = await context(query);
  const requestedPackage = query.package
    ? c.packages.find((item) => item.id === query.package && item.confirmed)
    : null;
  const initialDate = time.isValidDate(query.date) ? query.date : c.bookableDays[0].businessDate;

  return pages.bookingPage({
    ...c,
    initialPackage: requestedPackage ? requestedPackage.id : '',
    initialDate,
    preselectedSlot: time.isValidTime(query.time) ? query.time : ''
  });
}

async function renderBookingStatus(query = {}) {
  const c = await context(query);
  return pages.bookingStatusPage(c);
}

async function renderPrivacy(query = {}) {
  const c = await context(query);
  return pages.privacyPage(c);
}

async function renderNotFound(query = {}) {
  const c = await context(query);
  return pages.notFoundPage(c);
}

async function renderSitemap() {
  const c = await context();
  const today = time.todayIn(c.settings.timezone);
  const paths = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/quests', priority: '0.9', changefreq: 'weekly' },
    { path: '/prices', priority: '0.9', changefreq: 'weekly' },
    { path: '/booking', priority: '0.9', changefreq: 'weekly' },
    { path: '/gallery', priority: '0.7', changefreq: 'weekly' },
    { path: '/reviews', priority: '0.7', changefreq: 'weekly' },
    { path: '/faq', priority: '0.6', changefreq: 'monthly' },
    { path: '/contacts', priority: '0.7', changefreq: 'monthly' }
  ];
  const urls = paths
    .map(
      (item) => `  <url>
    <loc>${config.siteUrl}${item.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function renderRobots() {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /booking/status

Sitemap: ${config.siteUrl}/sitemap.xml
`;
}

module.exports = {
  context,
  renderHome,
  renderQuests,
  renderPrices,
  renderGallery,
  renderReviews,
  renderFaq,
  renderContacts,
  renderBooking,
  renderBookingStatus,
  renderPrivacy,
  renderNotFound,
  renderSitemap,
  renderRobots
};
