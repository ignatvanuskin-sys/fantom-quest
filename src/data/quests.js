'use strict';

/**
 * Квесты, тарифы и режимы игры.
 *
 * Все характеристики и цены перенесены с реальных прайс-листов FANTOM
 * (фотографии из галереи 2ГИС). Каждая позиция хранит файл-первоисточник,
 * чтобы владелец мог сверить.
 */

const quest = {
  id: 'zaklyatiya-proklyatiya-monahini',
  slug: 'zaklyatiya-proklyatiya-monahini',
  name: 'Заклятия-Проклятия Монахини',
  altName: 'Заклятия-Последний обряд',
  brandLabel: 'Fantom',
  genre: 'хоррор',
  durationMinutes: 60,
  durationConfirmed: true,
  durationSource: 'Оба аккаунта Instagram: «60 минут внутри себя»',
  active: true,
  bookingEnabled: true,
  isPrimary: true,

  /** Формулировка, подтверждённая источниками, без выдуманных деталей сюжета. */
  shortDescription:
    'Хоррор-локация в стиле фильма «Проклятия Монахини»: 60 минут внутри сюжета, ' +
    'актёры в образах и выбор режима игры по уровню страха.',

  longDescription:
    'Квест построен как фильм: подготовка, вход, сюжет и персонажи внутри. ' +
    'Гостей встречают актёры — Монахиня, клоун Эдди и Самара. Уровень взаимодействия ' +
    'вы выбираете сами: от детского режима без спецэффектов до формата 18+ с контактом.',

  /** Персонажи подтверждены публикацией Instagram: «В нашем квесте 3 персонажей». */
  characters: [
    { name: 'Монахиня', note: 'Центральный персонаж локации' },
    { name: 'Клоун Эдди', note: 'Из публикации: «Страшный клоун, которого поглотило зло»' },
    { name: 'Самара', note: 'Третий персонаж квеста' }
  ],
  charactersConfirmed: true,
  charactersSource: 'instagram-main + instagram-gis',

  /** Режимы игры — с настоящей таблички в локации. */
  modes: {
    confirmed: true,
    source: '2gis-gallery',
    sourcePhoto: '/images/prices/rezhimy-igry.webp',
    list: [
      { id: 'kids-soft', title: 'Детский — без спецэффектов', short: 'Детский без спецэффектов' },
      { id: 'kids-fx', title: 'Детский — со спецэффектами', short: 'Детский со спецэффектами' },
      { id: 'mid-no-contact', title: 'Средний — без контакта', short: 'Средний без контакта' },
      { id: 'mid-contact', title: 'Средний — с контактом', short: 'Средний с контактом' },
      { id: 'hard', title: 'Хард 18+', short: 'Хард 18+' }
    ]
  },

  suitedFor: null,
  suitedForConfirmed: false,
  ageLimit: null,
  ageLimitConfirmed: false,
  ageNote:
    'Возраст зависит от выбранного режима: есть детские режимы и формат 18+. ' +
    'Точные возрастные границы подтвердит администратор.',

  heroImage: '/images/quests/nun-hood-1440.webp',
  heroImageSmall: '/images/quests/nun-hood-900.webp',
  heroImageAlt: 'Актёр в образе Монахини с крестом в тёмном помещении FANTOM',

  gallery: [
    { src: '/images/quests/nun-face-1000.webp', alt: 'Актриса в образе Монахини' },
    { src: '/images/quests/actor-red-1000.webp', alt: 'Актёр квеста в красном свете' },
    { src: '/images/gallery/actor-room-1000.webp', alt: 'Актёр в комнате с картинами' },
    { src: '/images/quests/corridor-1000.webp', alt: 'Коридор локации в красном свете' },
    { src: '/images/gallery/corridor-blue-1000.webp', alt: 'Коридор с синей подсветкой' }
  ],

  sources: ['2gis', 'instagram-main', 'instagram-gis', '2gis-gallery'],
  unconfirmed: []
};

/**
 * Тарифы. Цены перенесены с фотографий прайс-листов, которые владелец
 * сам загрузил в 2ГИС. Поле priceListImage — ссылка на тот же файл на сайте.
 */
const packages = [
  {
    id: 'paket-horror',
    name: 'Пакет Хоррор',
    tagline: 'Фильм + квест в одном вечере',
    icon: 'film',
    durationLabel: '3 часа',
    durationHours: 3,
    audienceLabel: 'от 2 человек',
    baseGuests: 2,
    priceLabel: '2 человека — 17 500 ₸',
    priceFrom: 17500,
    priceNote: '3 человека — 19 500 ₸ · от 4 человек — по 5 500 ₸ с человека',
    tiers: [
      { guests: 2, price: 17500, label: '2 человека' },
      { guests: 3, price: 19500, label: '3 человека' },
      { guests: 4, price: 5500, perPerson: true, label: 'от 4 человек' }
    ],
    includes: [
      'Просмотр фильма «Проклятия Монахини» в киноруме — 2 часа, 1 или 2 часть на выбор',
      '1 час квеста в стиле фильма «Проклятия Монахини»',
      'Видео моменты с квеста'
    ],
    primary: true,
    confirmed: true,
    source: '2gis-gallery',
    priceListImage: '/images/prices/paket-horror.webp'
  },
  {
    id: 'level-mini',
    name: 'Пакет Level mini',
    tagline: 'Короткая программа на компанию',
    icon: 'bolt',
    durationLabel: '2 часа',
    durationHours: 2,
    audienceLabel: 'до 6 человек',
    baseGuests: 6,
    priceLabel: '30 000 ₸',
    priceFrom: 30000,
    priceNote: 'Включено 6 человек. С каждого следующего игрока доплата 3 000 ₸.',
    tiers: [{ guests: 6, price: 30000, label: '6 человек' }, { guests: 7, price: 3000, perPerson: true, label: 'каждый следующий' }],
    includes: [
      '1 час квеста',
      '1 час кинорума',
      'Просмотр фильма',
      'Настольные игры',
      '+10 видео моментов с квеста'
    ],
    confirmed: true,
    source: '2gis-gallery',
    priceListImage: '/images/prices/level-mini.webp'
  },
  {
    id: 'level-1',
    name: 'Пакет Level 1',
    tagline: 'Квест, кино и еда на компанию',
    icon: 'pizza',
    durationLabel: '2 часа',
    durationHours: 2,
    audienceLabel: 'до 6 человек',
    baseGuests: 6,
    priceLabel: '36 500 ₸',
    priceFrom: 36500,
    priceNote: 'Включено 6 человек. С каждого следующего — 3 600 ₸.',
    tiers: [{ guests: 6, price: 36500, label: '6 человек' }, { guests: 7, price: 3600, perPerson: true, label: 'каждый следующий' }],
    includes: [
      '1 час квеста',
      '1 час кинорума',
      'Настольные игры',
      'Фильмы',
      '3 пиццы по 25 см',
      '3 литра колы',
      'Одноразовая посуда',
      '+10 видео моментов с квеста'
    ],
    confirmed: true,
    source: '2gis-gallery',
    priceListImage: '/images/prices/level-1.webp'
  },
  {
    id: 'level-2',
    name: 'Пакет Level 2',
    tagline: 'Три часа: квест, кино и бургеры',
    icon: 'burger',
    durationLabel: '3 часа',
    durationHours: 3,
    audienceLabel: 'до 6 человек',
    baseGuests: 6,
    priceLabel: '50 000 ₸',
    priceFrom: 50000,
    priceNote:
      'Включено 6 человек. Состав читается по фотографии прайс-листа частично — ' +
      'уточните доплату за каждого следующего игрока у администратора.',
    tiers: [{ guests: 6, price: 50000, label: '6 человек' }],
    includes: [
      '1 час квеста',
      '2 часа кинорума',
      'Одноразовая посуда',
      'Настольные игры',
      'Фильмы',
      'Комбо-бургеры на 6 человек (бургер куриный, фри, наггетсы)'
    ],
    partiallyConfirmed: true,
    confirmed: true,
    source: '2gis-gallery',
    priceListImage: null,
    unconfirmed: ['Доплата за каждого следующего игрока на фото не читается']
  },
  {
    id: 'level-3',
    name: 'Пакет Level 3',
    tagline: 'Максимальная программа',
    icon: 'star',
    durationLabel: null,
    durationHours: null,
    audienceLabel: null,
    baseGuests: null,
    priceLabel: null,
    priceFrom: null,
    priceNote: 'На прайс-листе видно только название — состав и цену должен подтвердить владелец.',
    tiers: [],
    includes: [],
    confirmed: false,
    source: '2gis-gallery',
    priceListImage: null,
    unconfirmed: ['Состав программы', 'Цена', 'Длительность']
  }
];

/** Дополнительные услуги — с отдельной таблички «Видео съёмка». */
const addons = [
  {
    id: 'video-moments',
    name: 'Видео моменты с квеста',
    price: 3000,
    priceLabel: '3 000 ₸',
    confirmed: true,
    source: '2gis-gallery',
    image: '/images/prices/video-semka.webp'
  },
  {
    id: 'video-reels',
    name: 'Видео Reels',
    price: 7000,
    priceLabel: '7 000 ₸',
    confirmed: true,
    source: '2gis-gallery',
    image: '/images/prices/video-semka.webp'
  }
];

/** Кинорум KinoLand — часть бренда QuestHouse Fantom & KinoLand. */
const kinoLand = {
  confirmed: true,
  source: 'instagram-gis',
  title: 'KinoLand',
  description:
    'Кинорум при квесте: PlayStation, просмотр фильмов и караоке. ' +
    'Его можно добавить к игре или собрать отдельную программу — смотрите пакеты.',
  features: ['Просмотр фильмов', 'PlayStation', 'Караоке', 'Настольные игры'],
  image: '/images/gallery/logo-hall-1000.webp',
  note: 'Гостям «не только для взрослых, но и для детей» — из описания квеста.'
};

module.exports = { quest, packages, addons, kinoLand };
