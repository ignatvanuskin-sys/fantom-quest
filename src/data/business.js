'use strict';

/**
 * Карточка бизнеса. Здесь только данные, подтверждённые источниками.
 *
 * Источники и что именно из них взято:
 *   2ГИС (карточка 70000001112974709) — название, категория, адрес, этаж,
 *     индекс, часы работы, способы оплаты, рейтинг, количество отзывов и фото;
 *   Instagram fantom_uka_ (ссылка из карточки 2ГИС) — название локации
 *     «Заклятия-Последний обряд», 60 минут, состав персонажей, пакеты;
 *   Instagram _fantom_uka_ — название локации «Заклятия-Проклятия Монахини»,
 *     60 минут, «не только для взрослых, но и для детей»;
 *   фотографии из галереи 2ГИС — прайс-листы пакетов, режимы игры,
 *     вывеска «Испытай свой страх», логотип QUEST ROOM FANTOM.
 *
 * Всё, чего нет в источниках, помечено confirmed: false и выводится
 * на сайте как «уточняется», а не как факт.
 */

const SOURCES = {
  gis: {
    id: '2gis',
    label: '2ГИС',
    url: 'https://2gis.kz/ust-kamenogorsk/firm/70000001112974709',
    note: 'Карточка организации QuestHouse Fantom & KinoLand',
    checkedAt: '2026-09-27'
  },
  gallery: {
    id: '2gis-gallery',
    label: 'Галерея 2ГИС (62 фото)',
    url: 'https://2gis.kz/ust-kamenogorsk/gallery/firm/70000001112974709',
    note: 'Прайс-листы пакетов, режимы игры, интерьер и вывеска',
    checkedAt: '2026-09-27'
  },
  reviews: {
    id: '2gis-reviews',
    label: 'Отзывы 2ГИС',
    url: 'https://2gis.kz/ust-kamenogorsk/firm/70000001112974709/tab/reviews',
    note: '343 отзыва, рейтинг 5',
    checkedAt: '2026-09-27'
  },
  instagram: {
    id: 'instagram-main',
    label: 'Instagram @_fantom_uka_',
    url: 'https://www.instagram.com/_fantom_uka_/',
    note: 'Основной аккаунт: 42,7 тыс. подписчиков',
    checkedAt: '2026-09-27'
  },
  instagramGis: {
    id: 'instagram-gis',
    label: 'Instagram @fantom_uka_',
    url: 'https://www.instagram.com/fantom_uka_/',
    note: 'Аккаунт, на который ссылается карточка 2ГИС',
    checkedAt: '2026-09-27'
  }
};

const business = {
  legalName: 'QuestHouse Fantom & KinoLand',
  displayName: 'Fantom',
  tagline: 'Испытай свой страх',
  taglineSource: 'Надпись на вывеске и на прайс-листе «Пакет Хоррор»',
  category: 'Квесты',
  kind: 'Хоррор-квест с актёрами и кинорумом',
  city: 'Усть-Каменогорск',
  region: 'Восточно-Казахстанская область',
  country: 'KZ',
  locale: 'ru',
  timezone: 'Asia/Almaty',

  contacts: {
    phone: '+7 700 153 85 84',
    phoneE164: '+77001538584',
    whatsappE164: '77001538584',
    whatsappUrl: 'https://wa.me/77001538584',
    instagramUrl: 'https://www.instagram.com/_fantom_uka_/',
    instagramHandle: '@_fantom_uka_',
    instagramGisUrl: 'https://www.instagram.com/fantom_uka_/',
    instagramGisHandle: '@fantom_uka_',
    confirmed: true,
    source: ['2gis']
  },

  location: {
    streetAddress: 'проспект Нурсултана Назарбаева, 50',
    floor: 'цокольный этаж',
    postalCode: '070018',
    fullAddress: 'проспект Нурсултана Назарбаева, 50, цокольный этаж, Усть-Каменогорск, 070018',
    landmark: null,
    landmarkConfirmed: false,
    lat: 49.968637,
    lng: 82.595183,
    mapUrl: 'https://2gis.kz/ust-kamenogorsk/firm/70000001112974709',
    routeUrl:
      'https://2gis.kz/ust-kamenogorsk/directions/points/%7C82.595183%2C49.968637%3B70000001112974709',
    galleryUrl: 'https://2gis.kz/ust-kamenogorsk/gallery/firm/70000001112974709',
    entranceNote:
      'Вход с улицы: белая кирпичная стена с чёрной вывеской QUEST ROOM FANTOM. Цокольный этаж.',
    entranceConfirmed: true,
    entranceSource: '2gis-gallery',
    parking: null,
    parkingConfirmed: false
  },

  hours: {
    label: 'Ежедневно 09:00–02:00',
    shiftStart: '09:00',
    shiftEnd: '02:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    confirmed: true,
    source: '2gis',
    note: 'Смена пересекает полночь: слоты после 00:00 относятся к предыдущему игровому дню.'
  },

  rating: {
    value: 5,
    reviewsCount: 343,
    ratingsCount: 394,
    photosCount: 62,
    photosWithReviewsCount: 23,
    source: '2gis',
    sourceLabel: '2ГИС',
    sourceUrl: 'https://2gis.kz/ust-kamenogorsk/firm/70000001112974709/tab/reviews',
    updatedAt: '2026-09-27',
    dynamic: true,
    note:
      'На карточке рядом с названием стоит «Подтверждён (394)» — это оценки, ' +
      'а во вкладке отзывов 343 отзыва. Обе цифры публикуем отдельно, чтобы не путать.'
  },

  payments: {
    methods: ['Наличный расчёт', 'Перевод с карты', 'Оплата по QR-коду'],
    confirmed: true,
    source: '2gis'
  },

  /** Два аккаунта Instagram: разные названия локаций. Факт, который нужно свести владельцу. */
  instagramNote: {
    title: 'Два аккаунта Instagram',
    text:
      // Формулировка обращена к посетителю. Раньше здесь стояло «название должен
      // свести владелец» — это служебная задача, и на витрине она читалась как
      // внутренняя неразбериха. Сам факт расхождения источников не прячем:
      // он и есть содержание блока про источники.
      'Карточка 2ГИС ведёт на @fantom_uka_ (локация «Заклятия-Последний обряд»), ' +
      'а у @_fantom_uka_ в описании локация «Заклятия-Проклятия Монахини». ' +
      'Телефон и WhatsApp в обоих одинаковые. Под каким названием игра идёт сейчас, ' +
      'уточните у администратора — название за владельца мы не выбираем.',
    confirmed: false
  },

  unconfirmed: [
    {
      key: 'landmark',
      label: 'Ориентир рядом с локацией',
      note: 'Раньше указывали парк «Металлургов». В текущих источниках ориентир не подтверждён — не публикуем.'
    },
    { key: 'parking', label: 'Парковка', note: 'Где оставить машину у проспекта Назарбаева, 50.' },
    { key: 'stopWord', label: 'Стоп-слово', note: 'Точная формулировка и процедура остановки игры.' },
    { key: 'health', label: 'Ограничения по здоровью', note: 'Противопоказания и правила допуска.' },
    { key: 'reschedule', label: 'Перенос и отмена брони', note: 'Условия и сроки.' },
    { key: 'prepayment', label: 'Предоплата', note: 'Нужна ли и каким способом.' },
    {
      key: 'level3',
      label: 'Пакет Level 3',
      note: 'На прайс-листе видно название, но состав и цена не читаются. Нужны данные от владельца.'
    },
    {
      key: 'questName',
      label: 'Название основной локации',
      note: 'В источниках два варианта: «Заклятия-Проклятия Монахини» и «Заклятия-Последний обряд».'
    }
  ]
};

module.exports = { business, SOURCES };
