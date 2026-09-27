'use strict';

/**
 * Галерея. Все кадры — реальные фотографии FANTOM из галереи 2ГИС
 * (62 медиа: 45 фото и 17 видео). Здесь отобраны и пережаты в WebP те,
 * что показывают локацию, актёров и атмосферу.
 *
 * Файлы: public/images/... Каждый кадр имеет подпись и указание, кто автор
 * снимка — владелец, гость или отзыв. Это важно: часть фото загрузили гости.
 */

const gallery = [
  {
    id: 'nun-hood',
    src: '/images/quests/nun-hood-1440.webp',
    thumb: '/images/quests/nun-hood-900.webp',
    alt: 'Актёр в образе Монахини держит крест в тёмном помещении',
    caption: 'Монахиня',
    author: 'Фотография из отзывов',
    wide: true
  },
  {
    id: 'nun-face',
    src: '/images/quests/nun-face-1440.webp',
    thumb: '/images/quests/nun-face-900.webp',
    alt: 'Крупный план актрисы в образе Монахини',
    caption: 'Монахиня вблизи',
    author: 'Фотография от владельца'
  },
  {
    id: 'actor-red',
    src: '/images/quests/actor-red-1440.webp',
    thumb: '/images/quests/actor-red-900.webp',
    alt: 'Актёр квеста в красном свете среди декораций',
    caption: 'Один из трёх персонажей',
    author: 'Фотография от владельца'
  },
  {
    id: 'actor-room',
    src: '/images/gallery/actor-room-1000.webp',
    thumb: '/images/gallery/actor-room-480.webp',
    alt: 'Актёр стоит в комнате с картинами на стене',
    caption: 'Внутри локации',
    author: 'Фотография от владельца'
  },
  {
    id: 'corridor',
    src: '/images/quests/corridor-1440.webp',
    thumb: '/images/quests/corridor-900.webp',
    alt: 'Коридор локации с красной подсветкой',
    caption: 'Коридор',
    author: 'Фотография от владельца'
  },
  {
    id: 'corridor-blue',
    src: '/images/gallery/corridor-blue-1000.webp',
    thumb: '/images/gallery/corridor-blue-480.webp',
    alt: 'Тёмный коридор с синей подсветкой',
    caption: 'Перед входом в сюжет',
    author: 'Фотография от владельца'
  },
  {
    id: 'logo-wall',
    src: '/images/gallery/logo-wall-1000.webp',
    thumb: '/images/gallery/logo-wall-480.webp',
    alt: 'Стена с логотипом QUEST ROOM FANTOM',
    caption: 'Логотип на стене локации',
    author: 'Фотография от владельца'
  },
  {
    id: 'logo-hall',
    src: '/images/gallery/logo-hall-1000.webp',
    thumb: '/images/gallery/logo-hall-480.webp',
    alt: 'Стена с логотипом FANTOM и надписью «Теория зла»',
    caption: 'Зал перед игрой',
    author: 'Фотография от владельца'
  },
  {
    id: 'neon-red',
    src: '/images/gallery/neon-red-1000.webp',
    thumb: '/images/gallery/neon-red-480.webp',
    alt: 'Неоновая вывеска FANTOM на красной стене',
    caption: 'Неон FANTOM',
    author: 'Фотография от владельца'
  },
  {
    id: 'sign-strah',
    src: '/images/gallery/sign-strah-1000.webp',
    thumb: '/images/gallery/sign-strah-480.webp',
    alt: 'Неоновая вывеска «Страх» над входом в локацию',
    caption: '«Страх» — надпись над входом',
    author: 'Фотография от владельца'
  },
  {
    id: 'sign-strah-blue',
    src: '/images/gallery/sign-strah-blue-1000.webp',
    thumb: '/images/gallery/sign-strah-blue-480.webp',
    alt: 'Синяя неоновая вывеска «Страх» на стене',
    caption: 'Второй светильник «Страх»',
    author: 'Фотография от владельца'
  },
  {
    id: 'neon-hall',
    src: '/images/gallery/neon-hall-1000.webp',
    thumb: '/images/gallery/neon-hall-480.webp',
    alt: 'Красная шахматная стена с неоновым FANTOM',
    caption: 'Красный зал',
    author: 'Фотография от владельца'
  },
  {
    id: 'logo-purple',
    src: '/images/gallery/logo-purple-1000.webp',
    thumb: '/images/gallery/logo-purple-480.webp',
    alt: 'Логотип FANTOM в фиолетовом свете',
    caption: 'Свет в зале меняется',
    author: 'Фотография от владельца'
  },
  {
    id: 'logo-dark',
    src: '/images/gallery/logo-dark-1000.webp',
    thumb: '/images/gallery/logo-dark-480.webp',
    alt: 'Тёмная стена с логотипом QUEST ROOM FANTOM',
    caption: 'Логотип крупным планом',
    author: 'Фотография от владельца'
  },
  {
    id: 'neon-close',
    src: '/images/gallery/neon-close-1000.webp',
    thumb: '/images/gallery/neon-close-480.webp',
    alt: 'Неоновая надпись FANTOM вблизи',
    caption: 'Неон вблизи',
    author: 'Фотография из отзывов'
  },
  {
    id: 'guest-logo',
    src: '/images/gallery/guest-logo-1000.webp',
    thumb: '/images/gallery/guest-logo-480.webp',
    alt: 'Гостья фотографируется у стены с логотипом FANTOM',
    caption: 'Фото на память',
    author: 'Фотография из отзывов'
  },
  {
    id: 'kids-actors',
    src: '/images/gallery/kids-actors-1000.webp',
    thumb: '/images/gallery/kids-actors-480.webp',
    alt: 'Дети фотографируются с актёром квеста у неоновой вывески',
    caption: 'Детский режим игры',
    author: 'Фотография от пользователя'
  },
  {
    id: 'kids-neon',
    src: '/images/gallery/kids-neon-1000.webp',
    thumb: '/images/gallery/kids-neon-480.webp',
    alt: 'Дети и актёр у неоновой вывески FANTOM',
    caption: 'После игры',
    author: 'Фотография от владельца'
  },
  {
    id: 'entrance-street',
    src: '/images/gallery/entrance-street-1000.webp',
    thumb: '/images/gallery/entrance-street-480.webp',
    alt: 'Вход в локацию FANTOM с улицы: белая кирпичная стена и чёрная вывеска',
    caption: 'Вход с улицы',
    author: 'Из отзывов'
  },
  {
    id: 'entrance-door',
    src: '/images/gallery/entrance-door-1000.webp',
    thumb: '/images/gallery/entrance-door-480.webp',
    alt: 'Фотография входа в локацию',
    caption: 'Та самая дверь',
    author: 'Из отзывов'
  }
];

/** Прайс-листы и таблички — отдельная группа: это документы, а не атмосфера. */
const pricePhotos = [
  {
    id: 'paket-horror',
    src: '/images/prices/paket-horror.webp',
    alt: 'Прайс-лист «Пакет Хоррор» с ценами 17 500 / 19 500 / 5 500 ₸',
    caption: 'Прайс-лист «Пакет Хоррор»'
  },
  {
    id: 'level-mini',
    src: '/images/prices/level-mini.webp',
    alt: 'Прайс-лист «Пакет Level mini» — 30 000 ₸',
    caption: 'Прайс-лист Level mini'
  },
  {
    id: 'level-1',
    src: '/images/prices/level-1.webp',
    alt: 'Прайс-лист «Пакет Level 1» — 36 500 ₸',
    caption: 'Прайс-лист Level 1'
  },
  {
    id: 'modes',
    src: '/images/prices/rezhimy-igry.webp',
    alt: 'Табличка «Режимы игры»: детский, средний, хард 18+',
    caption: 'Режимы игры'
  },
  {
    id: 'video',
    src: '/images/prices/video-semka.webp',
    alt: 'Табличка «Видео съёмка»: видео моменты 3 000 ₸, видео Reels 7 000 ₸',
    caption: 'Дополнительные услуги'
  }
];

module.exports = { gallery, pricePhotos };
