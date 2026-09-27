'use strict';

/**
 * Сборка данных приложения из централизованных модулей src/data/*.
 *
 * Модули — источник правды для контента: их правит владелец, их же читает
 * сборка. Этот файл только приводит их к форме, с которой работают сервисы
 * (слоты, заявки, админка), и добавляет служебные коллекции.
 */

const { business, SOURCES } = require('./data/business');
const { quest, packages, addons, kinoLand } = require('./data/quests');
const { reviews, reviewHighlights } = require('./data/reviews');
const { gallery, pricePhotos } = require('./data/gallery');
const { story, features, howItWorks, faq, finalCta, seo } = require('./data/content');

function createDefaultData() {
  const now = new Date().toISOString();

  return {
    meta: {
      schemaVersion: 2,
      createdAt: now,
      updatedAt: now,
      note: 'db.json собирается из src/data/*. Правьте контент там, заявки — через админку.'
    },

    settings: {
      id: 'site',
      brand: {
        legalName: business.legalName,
        displayName: business.displayName,
        tagline: business.tagline,
        taglineSource: business.taglineSource,
        questName: quest.name,
        questAltName: quest.altName,
        kind: business.kind
      },
      city: business.city,
      region: business.region,
      country: business.country,
      locale: business.locale,
      timezone: business.timezone,

      phone: business.contacts.phone,
      phoneE164: business.contacts.phoneE164,
      whatsappE164: business.contacts.whatsappE164,
      whatsappUrl: business.contacts.whatsappUrl,
      instagramUrl: business.contacts.instagramUrl,
      instagramHandle: business.contacts.instagramHandle,
      instagramGisUrl: business.contacts.instagramGisUrl,
      instagramGisHandle: business.contacts.instagramGisHandle,
      instagramNote: business.instagramNote,

      hours: { ...business.hours },
      rating: {
        ...business.rating,
        sourceLabel: business.rating.sourceLabel,
        includeInSchema: false
      },
      payments: business.payments,
      unconfirmedFields: business.unconfirmed,
      seo,
      sources: Object.values(SOURCES).map((source) => ({
        id: source.id,
        label: source.label,
        url: source.url,
        note: source.note,
        checkedAt: source.checkedAt
      }))
    },

    locations: [
      {
        id: 'loc-uka-nazarbaeva-50',
        name: `${business.displayName} — цокольный этаж`,
        city: business.city,
        region: business.region,
        country: business.country,
        streetAddress: business.location.streetAddress,
        floor: business.location.floor,
        postalCode: business.location.postalCode,
        fullAddress: business.location.fullAddress,
        landmark: business.location.landmark,
        landmarkConfirmed: business.location.landmarkConfirmed,
        lat: business.location.lat,
        lng: business.location.lng,
        mapUrl: business.location.mapUrl,
        routeUrl: business.location.routeUrl,
        galleryUrl: business.location.galleryUrl,
        entranceNote: business.location.entranceNote,
        entranceConfirmed: business.location.entranceConfirmed,
        parking: business.location.parking,
        parkingConfirmed: business.location.parkingConfirmed,
        source: '2gis'
      }
    ],

    quests: [{ ...quest }],

    packages: packages.map((item) => ({ ...item })),
    addons: addons.map((item) => ({ ...item })),
    kinoLand: { ...kinoLand },

    gallery: gallery.map((item) => ({ ...item })),
    pricePhotos: pricePhotos.map((item) => ({ ...item })),

    content: {
      story: { ...story },
      features: features.map((item) => ({ ...item })),
      howItWorks: howItWorks.map((item) => ({ ...item })),
      finalCta: { ...finalCta },
      reviewHighlights: reviewHighlights.map((item) => ({ ...item }))
    },

    faq: faq.map((item) => ({
      ...item,
      status: item.confirmed && item.answer ? 'published' : 'needs_confirmation',
      placeholder: item.placeholder || null,
      source: item.source || null
    })),

    reviews: reviews.map((item) => ({
      ...item,
      status: item.verified ? 'published' : 'needs_confirmation',
      sourceLabel: '2ГИС',
      sourceUrl: business.rating.sourceUrl,
      placeholder: null
    })),

    // Слоты, состояние которых отличается от базовой сетки, и все заявки.
    slots: [],
    bookings: [],
    customers: []
  };
}

module.exports = { createDefaultData, SOURCES };
