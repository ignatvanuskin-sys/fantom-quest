'use strict';

/**
 * Schema.org разметка.
 *
 * Осторожность с Review/aggregateRating: агрегированный рейтинг взят из 2ГИС,
 * а не собран самим сайтом. Google требует, чтобы aggregateRating описывал
 * отзывы, собранные самим бизнесом. Поэтому вывод рейтинга в разметке по
 * умолчанию ВЫКЛЮЧЕН (settings.rating.includeInSchema). Включайте только
 * после подключения собственных отзывов. Review выводится исключительно для
 * подтверждённых отзывов с источником.
 */

const config = require('../config');
const { abs } = require('./layout');

function localBusiness(settings, location) {
  const node = {
    '@context': 'https://schema.org',
    '@type': ['EntertainmentBusiness', 'LocalBusiness'],
    '@id': abs('/#business'),
    name: settings.brand.legalName,
    alternateName: settings.brand.displayName,
    description:
      'Хоррор-квесты в Усть-Каменогорске. Локация «Заклятия-Проклятия Монахини», 60 минут игры.',
    url: config.siteUrl,
    telephone: settings.phone,
    image: abs('/og.png'),
    sameAs: [settings.instagramUrl, settings.whatsappUrl].filter(Boolean),
    address: location
      ? {
          '@type': 'PostalAddress',
          streetAddress: location.streetAddress,
          addressLocality: location.city,
          addressRegion: location.region,
          postalCode: location.postalCode,
          addressCountry: location.country
        }
      : undefined,
    geo: location
      ? { '@type': 'GeoCoordinates', latitude: location.lat, longitude: location.lng }
      : undefined,
    areaServed: { '@type': 'City', name: 'Усть-Каменогорск' },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday'
        ],
        opens: settings.hours.shiftStart,
        closes: settings.hours.shiftEnd
      }
    ],
    // priceRange намеренно отсутствует: цена не подтверждена владельцем.
    hasMap: location ? location.mapUrl : undefined
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

function faqPage(items) {
  const published = items.filter((item) => item.status === 'published' && item.answer);
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

function verifiedReviews(reviews) {
  const items = reviews.filter((r) => r.verified && r.text && r.status === 'published');
  if (!items.length) return null;
  return items.map((review) => ({
    '@context': 'https://schema.org',
    '@type': 'Review',
    itemReviewed: { '@type': 'EntertainmentBusiness', name: 'Fantom' },
    author: { '@type': 'Person', name: review.author || 'Гость' },
    datePublished: review.publishedAt || undefined,
    reviewBody: review.text,
    reviewRating: review.rating
      ? { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 }
      : undefined
  }));
}

function webSite() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': abs('/#website'),
    url: config.siteUrl,
    name: 'Fantom — хоррор-квест в Усть-Каменогорске',
    inLanguage: 'ru-KZ',
    publisher: { '@id': abs('/#business') }
  };
}

function service(quest, location) {
  return stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: quest.name,
    serviceType: 'Хоррор-квест',
    description: quest.shortDescription,
    provider: { '@id': abs('/#business') },
    areaServed: { '@type': 'City', name: 'Усть-Каменогорск' },
    location: location ? { '@type': 'Place', name: location.name, address: location.fullAddress } : undefined
    // offers намеренно отсутствует: цена не подтверждена.
  });
}

function stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      out[key] = stripUndefined(value);
    }
    return out;
  }
  return obj;
}

module.exports = { localBusiness, breadcrumbs, faqPage, verifiedReviews, webSite, service, stripUndefined };
