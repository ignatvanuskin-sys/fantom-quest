'use strict';

/**
 * Исходные данные проекта.
 *
 * ПРАВИЛО ДОСТОВЕРНОСТИ (главное ограничение брифа):
 *   Здесь есть только то, что подтверждено публичными источниками —
 *   карточкой 2ГИС и профилем Instagram. Любое значение, которого нет
 *   в источниках, помечается полем `confirmed: false` и попадает в
 *   settings.unconfirmed. Интерфейс обязан показывать такие значения
 *   как «нужно подтвердить», а не как факт.
 *
 * Источники:
 *   2ГИС  — https://2gis.kz/ust-kamenogorsk/search/fantom%20Усть%20Каменогорск%20Адрес%20Назарбаева%2050/firm/70000001112974709/82.595183%2C49.968637
 *   IG    — https://www.instagram.com/_fantom_uka_/
 */

const SOURCES = {
  gis: {
    id: 'src-2gis',
    label: 'Карточка 2ГИС',
    url: 'https://2gis.kz/ust-kamenogorsk/search/fantom%20%D0%A3%D1%81%D1%82%D1%8C%20%D0%9A%D0%B0%D0%BC%D0%B5%D0%BD%D0%BE%D0%B3%D0%BE%D1%80%D1%81%D0%BA%20%D0%90%D0%B4%D1%80%D0%B5%D1%81%20%D0%9D%D0%B0%D0%B7%D0%B0%D1%80%D0%B1%D0%B0%D0%B5%D0%B2%D0%B0%2050/firm/70000001112974709/82.595183%2C49.968637?m=82.595198%2C49.96862%2F17.68',
    checkedAt: '2026-09-27'
  },
  instagram: {
    id: 'src-instagram',
    label: 'Instagram @_fantom_uka_',
    url: 'https://www.instagram.com/_fantom_uka_/',
    checkedAt: '2026-09-27'
  }
};

const IMAGE_REQUIREMENTS = {
  hero: {
    slot: 'hero-main',
    label: 'Кадр локации «Заклятия-Проклятия Монахини»',
    note: 'Нужен реальный кадр интерьера. Не заменять стоковым хоррором. Формат 3:2, минимум 2000px по ширине.',
    provided: false
  },
  gallery: [
    { slot: 'gallery-01', label: 'Вход / цокольный этаж', note: 'Реальное фото входа, чтобы гость нашёл дверь.', provided: false },
    { slot: 'gallery-02', label: 'Коридор локации', note: 'Реальное фото сцены без спойлеров.', provided: false },
    { slot: 'gallery-03', label: 'Реквизит', note: 'Крупный план реквизита, без раскрытия сюжета.', provided: false },
    { slot: 'gallery-04', label: 'Команда после игры', note: 'Согласие на публикацию фото гостей обязательно.', provided: false }
  ]
};

function createDefaultData() {
  const now = new Date().toISOString();

  return {
    meta: {
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      note: 'db.json генерируется автоматически. Правьте данные через админку /admin.'
    },

    settings: {
      id: 'site',
      brand: {
        legalName: 'QuestHouse Fantom & KinoLand',
        displayName: 'Fantom',
        tagline: 'Хоррор-квест в Усть-Каменогорске',
        questBrandName: 'Fantom «Заклятия-Проклятия Монахини»'
      },
      city: 'Усть-Каменогорск',
      country: 'KZ',
      timezone: 'Asia/Almaty',
      locale: 'ru',
      phone: '+7 700 153 85 84',
      phoneE164: '+77001538584',
      whatsappE164: '77001538584',
      whatsappUrl: 'https://wa.me/77001538584',
      instagramUrl: 'https://www.instagram.com/_fantom_uka_/',
      telegramUrl: '',
      hours: {
        label: 'Ежедневно 09:00–02:00',
        shiftStart: '09:00',
        shiftEnd: '02:00',
        days: [0, 1, 2, 3, 4, 5, 6],
        source: SOURCES.gis.id,
        confirmed: true
      },
      rating: {
        sourceLabel: '2ГИС',
        sourceUrl: SOURCES.gis.url,
        value: 5.0,
        reviewsCount: 394,
        ratingsCount: 394,
        testimonialsCount: 343,
        photosCount: 62,
        category: 'Квесты',
        updatedAt: '2026-09-27',
        dynamic: true,
        note: 'Динамическое значение. Не зашивать в вёрстку — обновлять из админки или API.'
      },
      payments: {
        methods: ['Наличный расчёт', 'Перевод с карты', 'QR-код'],
        source: SOURCES.gis.id,
        confirmed: true,
        note: 'Список способов оплаты по данным карточки 2ГИС.'
      },
      notificationChannel: {
        label: 'Администратор свяжется по выбранному каналу',
        confirmed: false,
        note: 'Нужно подтвердить: кто именно обрабатывает заявки и в какие часы.'
      },
      mockModeBanner: true,
      unconfirmedFields: [
        { key: 'price', label: 'Цена по числу игроков', note: 'Нужно подтвердить у владельца.' },
        { key: 'prepayment', label: 'Предоплата', note: 'Есть ли бронь без предоплаты и как переносится.' },
        { key: 'scenarios', label: 'Названия и количество сценариев', note: 'Подтверждён один хоррор-сценарий.' },
        { key: 'teamSize', label: 'Минимальный и максимальный состав команды', note: 'Нужно подтвердить.' },
        { key: 'ageLimit', label: 'Возрастные ограничения', note: 'Нужно подтвердить.' },
        { key: 'contactLevels', label: 'Уровни контакта', note: 'Есть ли выбор уровня взаимодействия с актёром.' },
        { key: 'stopWord', label: 'Стоп-слово', note: 'Точное стоп-слово и процедура остановки игры.' },
        { key: 'health', label: 'Ограничения по здоровью', note: 'Противопоказания и правила допуска.' },
        { key: 'dressCode', label: 'Что надеть', note: 'Рекомендации по одежде и обуви.' },
        { key: 'lateArrival', label: 'Опоздание', note: 'Сколько минут ждут и что происходит при опоздании.' },
        { key: 'reschedule', label: 'Перенос брони', note: 'Условия и сроки переноса.' },
        { key: 'photoPolicy', label: 'Съёмка и фото', note: 'Можно ли снимать внутри, делают ли фото после игры.' },
        { key: 'parking', label: 'Парковка', note: 'Где парковаться рядом с проспектом Назарбаева, 50.' },
        { key: 'entrance', label: 'Вход с цокольного этажа', note: 'Как именно найти вход.' },
        { key: 'holidayHours', label: 'Праздничные дни', note: 'Работаете ли 1 января и в другие праздники.' },
        { key: 'guestRequests', label: 'Дни рождения и корпоративы', note: 'Отдельные условия для групп.' }
      ],
      seo: {
        defaultTitle: 'Хоррор-квест Fantom — Усть-Каменогорск | 60 минут, 09:00–02:00',
        defaultDescription:
          'Fantom — хоррор-квест в Усть-Каменогорске, локация «Заклятия-Проклятия Монахини». 60 минут игры, проспект Нурсултана Назарбаева, 50 (цокольный этаж). Бронь по времени онлайн.',
        keywords: ['квест Усть-Каменогорск', 'страшный квест Усть-Каменогорск', 'хоррор-квест с актёрами', 'квест на день рождения']
      }
    },

    locations: [
      {
        id: 'loc-uka-nazarbaeva-50',
        name: 'Fantom — цокольный этаж',
        city: 'Усть-Каменогорск',
        region: 'Восточно-Казахстанская область',
        country: 'KZ',
        streetAddress: 'проспект Нурсултана Назарбаева, 50',
        floor: 'цокольный этаж',
        postalCode: '070018',
        fullAddress: 'проспект Нурсултана Назарбаева, 50, цокольный этаж, Усть-Каменогорск, 070018',
        landmark: 'Парк «Металлургов» — около 3 минут пешком, ~250 м',
        lat: 49.968637,
        lng: 82.595183,
        mapUrl: SOURCES.gis.url,
        routeUrl: 'https://2gis.kz/ust-kamenogorsk/directions/points/%7C82.595183%2C49.968637',
        entranceNote: null,
        entranceConfirmed: false,
        source: SOURCES.gis.id
      }
    ],

    quests: [
      {
        id: 'zaklyatiya-proklyatiya-monahini',
        slug: 'zaklyatiya-proklyatiya-monahini',
        name: 'Заклятия-Проклятия Монахини',
        brandLabel: 'Fantom',
        genre: 'хоррор',
        shortDescription:
          'Хоррор-локация Fantom в Усть-Каменогорске: 60 минут внутри сюжета «Заклятия-Проклятия Монахини».',
        longDescription:
          'Наш основной хоррор-сценарий. Название и длительность подтверждены Instagram бренда: «Заклятия-Проклятия Монахини», 60 минут. Дополнительные детали сюжета мы не публикуем — это часть впечатления.',
        durationMinutes: 60,
        durationConfirmed: true,
        locationId: 'loc-uka-nazarbaeva-50',
        isPrimary: true,
        isPlaceholder: false,
        active: true,
        bookingEnabled: true,
        intensity: null,
        intensityConfirmed: false,
        ageLimit: null,
        ageConfirmed: false,
        minGuests: null,
        maxGuests: null,
        teamSizeConfirmed: false,
        priceFrom: null,
        priceConfirmed: false,
        priceNote: 'Цена зависит от числа игроков. Значение нужно подтвердить у владельца — на сайте не показываем выдуманные цифры.',
        contactLevel: null,
        contactConfirmed: false,
        stopWord: null,
        stopWordConfirmed: false,
        suitedFor: null,
        suitedForConfirmed: false,
        heroImage: null,
        gallery: [],
        imageRequirements: IMAGE_REQUIREMENTS,
        sources: [SOURCES.instagram.id, SOURCES.gis.id],
        unconfirmed: [
          'priceFrom',
          'ageLimit',
          'minGuests',
          'maxGuests',
          'intensity',
          'contactLevel',
          'stopWord',
          'suitedFor'
        ]
      },
      {
        id: 'placeholder-scenario-2',
        slug: 'vtoroy-scenariy',
        name: 'Второй сценарий — уточняется',
        brandLabel: 'QuestHouse Fantom',
        genre: null,
        shortDescription:
          'В публичной карточке бренд указан как QuestHouse Fantom & KinoLand, но названия и параметры второго сценария не опубликованы.',
        longDescription: null,
        durationMinutes: null,
        durationConfirmed: false,
        locationId: 'loc-uka-nazarbaeva-50',
        isPrimary: false,
        isPlaceholder: true,
        active: false,
        bookingEnabled: false,
        intensity: null,
        ageLimit: null,
        minGuests: null,
        maxGuests: null,
        priceFrom: null,
        contactLevel: null,
        stopWord: null,
        suitedFor: null,
        heroImage: null,
        gallery: [],
        sources: [SOURCES.gis.id],
        unconfirmed: ['name', 'durationMinutes', 'priceFrom', 'ageLimit', 'minGuests', 'maxGuests'],
        ownerAction: 'Прислать название, жанр, длительность и цену — карточка включится автоматически.'
      }
    ],

    faq: [
      {
        id: 'faq-where',
        question: 'Где находится Fantom?',
        answer:
          'Усть-Каменогорск, проспект Нурсултана Назарбаева, 50, цокольный этаж, индекс 070018. Ориентир — парк «Металлургов», около 3 минут пешком (~250 м).',
        status: 'published',
        confirmed: true,
        source: SOURCES.gis.id,
        order: 10
      },
      {
        id: 'faq-duration',
        question: 'Сколько длится игра?',
        answer: '60 минут. Это подтверждённая длительность основного хоррор-сценария.',
        status: 'published',
        confirmed: true,
        source: SOURCES.instagram.id,
        order: 20
      },
      {
        id: 'faq-hours',
        question: 'Какой у вас график работы?',
        answer:
          'Ежедневно с 09:00 до 02:00. Ночные слоты после полуночи относятся к игровому дню предыдущей календарной даты — при бронировании это подписано.',
        status: 'published',
        confirmed: true,
        source: SOURCES.gis.id,
        order: 30
      },
      {
        id: 'faq-how-to-book',
        question: 'Как записаться?',
        answer:
          'Выберите сценарий, дату и свободное время на этой странице и отправьте заявку. Администратор свяжется с вами по выбранному каналу — WhatsApp, Telegram или звонком.',
        status: 'published',
        confirmed: true,
        source: null,
        order: 40
      },
      {
        id: 'faq-payment',
        question: 'Как можно оплатить?',
        answer:
          'По данным карточки 2ГИС принимаются наличный расчёт, перевод с карты и QR-код. Оплата на сайте не проводится: заявка ничего не списывает.',
        status: 'published',
        confirmed: true,
        source: SOURCES.gis.id,
        order: 50
      },
      {
        id: 'faq-price',
        question: 'Сколько стоит игра?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Цена зависит от числа игроков. Уточните у администратора в WhatsApp — мы не публикуем непроверенную цену.',
        source: null,
        order: 60
      },
      {
        id: 'faq-age',
        question: 'С какого возраста можно играть?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Возрастные ограничения уточняются. Напишите в WhatsApp — ответим до записи.',
        source: null,
        order: 70
      },
      {
        id: 'faq-guests',
        question: 'Сколько человек может играть?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Минимальный и максимальный состав команды уточняются. Укажите число игроков в заявке — администратор подтвердит возможность.',
        source: null,
        order: 80
      },
      {
        id: 'faq-pair',
        question: 'Можно ли играть вдвоём?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Зависит от минимального состава команды. Уточняйте в WhatsApp перед бронированием.',
        source: null,
        order: 90
      },
      {
        id: 'faq-dress',
        question: 'Что надеть?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Рекомендации по одежде и обуви уточняются у владельца.',
        source: null,
        order: 100
      },
      {
        id: 'faq-prepay',
        question: 'Нужна ли предоплата?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Условия брони и предоплаты уточняются. Заявка на сайте бесплатна и ничего не списывает.',
        source: null,
        order: 110
      },
      {
        id: 'faq-reschedule',
        question: 'Можно ли перенести игру?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Условия и сроки переноса уточняются. Свяжитесь с администратором как можно раньше.',
        source: null,
        order: 120
      },
      {
        id: 'faq-late',
        question: 'Что будет, если опоздать?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Правила по опозданию уточняются. Предупредите администратора в WhatsApp, если задерживаетесь.',
        source: null,
        order: 130
      },
      {
        id: 'faq-safety',
        question: 'Это безопасно? Есть ли стоп-слово?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder:
          'Инструктаж перед игрой проводится. Точное стоп-слово, уровни контакта и ограничения по здоровью должен подтвердить владелец — эти данные появятся здесь после проверки.',
        source: null,
        order: 140
      },
      {
        id: 'faq-photo',
        question: 'Можно ли снимать внутри?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'В Instagram есть highlights про видеосъёмку, но правила съёмки нужно подтвердить у владельца.',
        source: SOURCES.instagram.id,
        order: 150
      },
      {
        id: 'faq-parking',
        question: 'Есть ли парковка?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Информация о парковке у проспекта Назарбаева, 50 уточняется.',
        source: null,
        order: 160
      },
      {
        id: 'faq-entrance',
        question: 'Как найти вход?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Локация на цокольном этаже. Как именно выглядит вход, уточняется — после подтверждения добавим фото.',
        source: null,
        order: 170
      },
      {
        id: 'faq-groups',
        question: 'Проводите дни рождения и корпоративы?',
        answer: null,
        status: 'needs_confirmation',
        confirmed: false,
        placeholder: 'Условия для групп, дней рождения и корпоративов уточняются.',
        source: null,
        order: 180
      }
    ],

    reviews: [
      {
        id: 'rev-placeholder-1',
        author: null,
        rating: null,
        text: null,
        publishedAt: null,
        sourceLabel: '2ГИС',
        sourceUrl: SOURCES.gis.url,
        verified: false,
        status: 'needs_confirmation',
        placeholder:
          'Место для реального отзыва из 2ГИС. Цитата добавляется владельцем без изменения смысла — выдуманные отзывы не публикуем.',
        order: 1
      },
      {
        id: 'rev-placeholder-2',
        author: null,
        rating: null,
        text: null,
        publishedAt: null,
        sourceLabel: '2ГИС',
        sourceUrl: SOURCES.gis.url,
        verified: false,
        status: 'needs_confirmation',
        placeholder:
          'Место для реального отзыва из 2ГИС. Укажите дату отзыва — freshness важна для доверия.',
        order: 2
      },
      {
        id: 'rev-placeholder-3',
        author: null,
        rating: null,
        text: null,
        publishedAt: null,
        sourceLabel: 'Instagram',
        sourceUrl: SOURCES.instagram.url,
        verified: false,
        status: 'needs_confirmation',
        placeholder:
          'Место для реального отзыва из Instagram highlights «Отзывы». Нужно согласие автора на публикацию.',
        order: 3
      }
    ],

    // Persist-слой для слотов: здесь хранятся только слоты, состояние
    // которых отличается от базовой сетки (заблокированные, занятые).
    slots: [],

    bookings: [],
    customers: []
  };
}

module.exports = { createDefaultData, SOURCES, IMAGE_REQUIREMENTS };
