'use strict';

/**
 * Schema.org разметка.
 *
 * Правила, которые здесь соблюдаются:
 *  - публикуются только реальные address, phone, openingHours, URL и соцссылки;
 *  - `aggregateRating` по умолчанию НЕ выводится: рейтинг собран 2ГИС,
 *    а не самим сайтом. Включается флагом settings.rating.includeInSchema;
 *  - `Review` — только для подтверждённых отзывов с источником;
 *  - `FAQPage` — только для вопросов с подтверждённым ответом;
 *  - цены берутся из реальных прайс-листов, а не придумываются.
 */

const config = require('../config');
const { abs } = require('./layout');

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined || item === null) continue;
      out[key] = stripUndefined(item);
    }
    return out;
  }
  return value;
}

function localBusiness(settings, location) {
  const node = {
    '@context': 'https://schema.org',
    '@type': ['EntertainmentBusiness', 'LocalBusiness'],
    '@id': abs('/#business'),
    name: settings.brand.legalName,
    alternateName: settings.brand.displayName,
    slogan: settings.brand.tagline,
    description:
      `Хоррор-квест «${settings.brand.questName}» в Усть-Каменогорске: 60 минут, ` +
      'три персонажа и пять режимов страха.',
    url: config.siteUrl,
    telephone: settings.phone,
    image: [abs('/images/og/og-fantom.jpg'), abs('/images/quests/nun-hood-1440.webp')],
    priceRange: '17 500 ₸ – 50 000 ₸',
    currenciesAccepted: 'KZT',
    paymentAccepted: settings.payments.methods.join(', '),
    sameAs: [settings.instagramUrl, settings.instagramGisUrl, settings.whatsappUrl, settings.rating.sourceUrl].filter(Boolean),
    address: {
      '@type': 'PostalAddress',
      streetAddress: location.streetAddress,
      addressLocality: location.city,
      addressRegion: location.region,
      postalCode: location.postalCode,
      addressCountry: location.country
    },
    geo: { '@type': 'GeoCoordinates', latitude: location.lat, longitude: location.lng },
    areaServed: { '@type': 'City', name: location.city },
    hasMap: location.mapUrl,
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: settings.hours.shiftStart,
        closes: settings.hours.shiftEnd
      }
    ]
  };
  if (settings.rating && settings.rating.includeInSchema) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: settings.rating.value,
      reviewCount: settings.rating.reviewsCount,
      bestRating: 5,
      worstRating: 1
    };
  }
  return stripUndefined(node);
}

/** Каталог услуг с реальными ценами из прайс-листов. */
function offerCatalog(packages) {
  const items = packages
    .filter((item) => item.confirmed && item.priceFrom)
    .map((item) => ({
      '@type': 'Offer',
      name: item.name,
      description: item.includes.join('; '),
      price: item.priceFrom,
      priceCurrency: 'KZT',
      availability: 'https://schema.org/InStock',
      url: abs('/prices#' + item.id)
    }));
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: 'Пакеты FANTOM',
    itemListElement: items
  };
}

function breadcrumbs(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: abs(item.path)
    }))
  };
}

function faqPage(faq) {
  const published = faq.filter((item) => item.status === 'published' && item.answer);
  if (!published.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: published.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
  };
}

function reviews(reviewsList, settings) {
  const items = reviewsList.filter((item) => item.verified && item.text);
  if (!items.length) return null;
  return items.map((item) => ({
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: { '@type': 'EntertainmentBusiness', name: settings.brand.legalName },
    author: { '@type': 'Person', name: item.author },
    datePublished: item.publishedAt,
    reviewBody: item.text,
    reviewRating: { '@type': 'Rating', ratingValue: item.rating, bestRating: 5, worstRating: 1 }
  }));
}

function webSite() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': abs('/#website'),
    url: config.siteUrl,
    name: 'FANTOM — хоррор-квест в Усть-Каменогорске',
    inLanguage: 'ru-KZ',
    publisher: { '@id': abs('/#business') }
  };
}

function service(settings, location) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Хоррор-квест «${settings.brand.questName}»`,
    serviceType: 'Хоррор-квест',
    provider: { '@id': abs('/#business') },
    areaServed: { '@type': 'City', name: location.city },
    location: { '@type': 'Place', name: settings.brand.displayName, address: location.fullAddress }
  };
}

module.exports = { localBusiness, offerCatalog, breadcrumbs, faqPage, reviews, webSite, service, stripUndefined };
