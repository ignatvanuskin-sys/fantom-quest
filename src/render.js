'use strict';

/**
 * Серверный рендер страниц: данные → HTML.
 * Метаданные (title, description, canonical, OG, JSON-LD) собираются на сервере,
 * а не в браузере — это требование брифа и обязательное условие для индексации.
 */

const config = require('./config');
const store = require('./store');
const time = require('./lib/time');
const availability = require('./services/availability');
const home = require('./views/pages-home');
const questPages = require('./views/pages-quests');
const infoPages = require('./views/pages-info');

async function ctx() {
  const data = await store.read();
  const settings = data.settings;
  const location = data.locations[0] || null;
  const quests = data.quests;
  const primaryQuest = quests.find((q) => q.isPrimary) || quests[0] || null;
  const days = availability.upcoming(data, { days: 14 });
  const nextSlot = availability.nextOpenSlot(data);
  return { data, settings, location, quests, primaryQuest, days, nextSlot };
}

async function renderHome() {
  const c = await ctx();
  return home.home({
    settings: c.settings,
    location: c.location,
    quests: c.quests,
    faq: c.data.faq.sort((a, b) => a.order - b.order),
    reviews: c.data.reviews.sort((a, b) => a.order - b.order),
    nextSlot: c.nextSlot,
    days: c.days,
    mockMode: config.mockMode
  });
}

async function renderQuests() {
  const c = await ctx();
  return questPages.quests({
    settings: c.settings,
    location: c.location,
    quests: c.quests,
    nextSlot: c.nextSlot
  });
}

async function renderQuest(slug) {
  const c = await ctx();
  const quest = c.quests.find((q) => q.slug === slug || q.id === slug);
  if (!quest) return null;
  if (quest.isPlaceholder) {
    // Заготовка сценария не имеет отдельной страницы — ведём в каталог.
    return null;
  }
  const days = availability.upcoming(c.data, { days: 10, questId: quest.id });
  const nextSlot = availability.nextOpenSlot(c.data, { questId: quest.id });
  return questPages.questDetail({
    settings: c.settings,
    location: c.location,
    quest,
    quests: c.quests,
    nextSlot,
    days
  });
}

async function renderBooking(query) {
  const c = await ctx();
  const bookable = c.quests.filter((q) => q.active && q.bookingEnabled !== false);
  const requestedQuest = query.quest
    ? bookable.find((q) => q.slug === query.quest || q.id === query.quest)
    : null;
  const initialQuest = (requestedQuest || bookable[0] || {}).id || '';
  const initialDate = time.isValidDate(query.date) ? query.date : '';
  const days = availability.upcoming(c.data, {
    days: config.booking.horizonDays,
    questId: initialQuest,
    from: initialDate || undefined
  });

  return questPages.booking({
    settings: c.settings,
    location: c.location,
    quests: c.quests,
    initialQuest,
    initialDate: initialDate || (days[0] ? days[0].businessDate : ''),
    preselectedSlot: time.isValidTime(query.time) ? query.time : '',
    days
  });
}

async function renderHowItWorks() {
  const c = await ctx();
  return infoPages.howItWorks({
    settings: c.settings,
    location: c.location,
    quest: c.primaryQuest,
    days: c.days
  });
}

async function renderSafety() {
  const c = await ctx();
  return infoPages.safety({ settings: c.settings, location: c.location, quest: c.primaryQuest });
}

async function renderReviews() {
  const c = await ctx();
  const reviews = c.data.reviews.sort((a, b) => a.order - b.order);
  const published = reviews.filter((r) => r.verified && r.text);
  return infoPages.reviews({
    settings: c.settings,
    location: c.location,
    reviews,
    published,
    pendingCount: reviews.length - published.length
  });
}

async function renderFaq() {
  const c = await ctx();
  return infoPages.faqPageView({
    settings: c.settings,
    location: c.location,
    faq: c.data.faq.sort((a, b) => a.order - b.order)
  });
}

async function renderContacts() {
  const c = await ctx();
  return infoPages.contacts({ settings: c.settings, location: c.location, quest: c.primaryQuest });
}

async function renderPrivacy() {
  const c = await ctx();
  return infoPages.privacy({ settings: c.settings, location: c.location });
}

async function renderBookingStatus() {
  const c = await ctx();
  return infoPages.bookingStatus({ settings: c.settings, location: c.location });
}

async function renderNotFound() {
  const c = await ctx();
  return infoPages.notFound({ settings: c.settings, location: c.location });
}

async function renderSitemap() {
  const c = await ctx();
  const tz = c.settings.timezone;
  const today = time.todayIn(tz);
  const paths = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/quests', priority: '0.9', changefreq: 'weekly' },
    { path: `/quests/${c.primaryQuest.slug}`, priority: '0.9', changefreq: 'weekly' },
    { path: '/booking', priority: '0.9', changefreq: 'weekly' },
    { path: '/how-it-works', priority: '0.6', changefreq: 'monthly' },
    { path: '/safety', priority: '0.6', changefreq: 'monthly' },
    { path: '/reviews', priority: '0.6', changefreq: 'weekly' },
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
  renderHome,
  renderQuests,
  renderQuest,
  renderBooking,
  renderHowItWorks,
  renderSafety,
  renderReviews,
  renderFaq,
  renderContacts,
  renderPrivacy,
  renderBookingStatus,
  renderNotFound,
  renderSitemap,
  renderRobots
};
