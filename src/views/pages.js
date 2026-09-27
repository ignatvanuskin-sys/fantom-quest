'use strict';

const config = require('../config');
const { page } = require('./layout');
const { esc } = require('../lib/validate');
const s = require('./sections');
const jsonld = require('./jsonld');

function crumbs(items) {
  return `<nav class="crumbs" aria-label="Хлебные крошки"><div class="wrap">${items
    .map((item, index) =>
      index === items.length - 1
        ? `<span aria-current="page">${esc(item.name)}</span>`
        : `<a href="${esc(item.path)}">${esc(item.name)}</a>`
    )
    .join('<span class="crumbs-sep" aria-hidden="true">/</span>')}</div></nav>`;
}

function bookingBlock(data, options = {}) {
  return `<section class="section section--booking" id="booking">
  <div class="wrap">
    ${s.sectionHead({
      eyebrow: 'Бронирование',
      title: options.title || 'Выбери дату',
      lead:
        options.lead ||
        'Шесть шагов: программа, дата, время, гости, контакты, проверка. Заявка бесплатная — оплата на месте.'
    })}
    ${s.bookingWizard({
      settings: data.settings,
      packages: data.packages,
      days: data.bookableDays,
      quest: data.quest,
      initialPackage: data.initialPackage || '',
      initialDate: data.initialDate || '',
      preselectedSlot: data.preselectedSlot || ''
    })}
    ${s.bookingSuccess({ settings: data.settings })}
  </div>
</section>`;
}

/* ── Главная ────────────────────────────────────────────────────────────── */

function home(data) {
  const { settings, location, quest, packages, gallery, reviews, faq, content, days, bookableDays } = data;
  const body = `
    ${s.hero({ settings, location, quest, packages })}
    ${s.marquee({ settings, quest })}
    ${s.trust({ settings, location, quest })}
    ${s.slotsBoard({ days: bookableDays, quest, settings })}
    ${s.catalog({ packages, settings, quest })}
    ${s.characters({ quest })}
    ${s.fearScale({ quest })}
    ${s.story({ content, quest })}
    ${s.features({ content })}
    ${s.gallery({ gallery, settings, location, limit: 14 })}
    ${s.instagram({ settings, gallery })}
    ${s.numbers({ settings, quest, packages, location })}
    ${s.reviews({ settings, reviews, limit: 6 })}
    ${s.howItWorks({ content, quest, settings })}
    ${s.beforeYouGo({ settings, location, quest })}
    ${bookingBlock({ ...data, bookableDays })}
    ${s.locationSection({ settings, location })}
    ${s.faq({ faq, limit: 8 })}
    ${s.finalCta({ settings, content, location })}
  `;

  return page({
    title: settings.seo.defaultTitle,
    description: settings.seo.defaultDescription,
    path: '/',
    body,
    settings,
    location,
    ogType: 'website',
    jsonLd: [
      jsonld.webSite(),
      jsonld.localBusiness(settings, location),
      jsonld.service(settings, location),
      jsonld.offerCatalog(packages),
      jsonld.faqPage(faq),
      ...(jsonld.reviews(reviews, settings) || [])
    ]
  });
}

/* ── Квест ──────────────────────────────────────────────────────────────── */

function questPage(data) {
  const { settings, location, quest, packages, reviews, faq, content, days } = data;
  const features = quest.modes.list;

  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Квесты', path: '/quests' }])}

    <section class="section quest-hero">
      <div class="wrap quest-hero-grid">
        <div>
          <p class="eyebrow">${esc(quest.genre)} · ${esc(settings.city)}</p>
          <h1>${esc(quest.name)}</h1>
          <p class="lede">${esc(quest.longDescription)}</p>
          <dl class="hero-facts">
            <div><dt>Длительность</dt><dd>${esc(String(quest.durationMinutes))} минут</dd></div>
            <div><dt>Персонажи</dt><dd>${esc(String(quest.characters.length))}</dd></div>
            <div><dt>Режимы</dt><dd>${esc(String(features.length))} уровня страха</dd></div>
            <div><dt>Состав</dt><dd>от 2 человек</dd></div>
          </dl>
          <div class="hero-actions">
            <a class="btn btn-blood btn-xl" href="/booking">Забронировать</a>
            <a class="btn btn-outline btn-xl" href="${esc(settings.whatsappUrl)}" rel="noopener">Спросить в WhatsApp</a>
          </div>
        </div>
        <figure class="quest-hero-photo">
          <img src="/images/quests/nun-face-1440.webp" alt="Актриса в образе Монахини на локации FANTOM"
               width="1440" height="2560" fetchpriority="high" decoding="async">
          <figcaption>Кадр из галереи локации</figcaption>
        </figure>
      </div>
    </section>

    ${s.story({ content, quest })}
    ${s.characters({ quest })}
    ${s.fearScale({ quest })}
    ${s.gallery({ gallery: data.gallery, settings, location })}
    ${s.slotsBoard({ days, quest, settings, limit: 4 })}
    ${s.catalog({ packages, settings, quest })}
    ${bookingBlock(data, {
      title: 'Забронировать эту локацию',
      lead: 'Выберите программу, дату и время. Заявка бесплатная — администратор подтвердит бронь.'
    })}
    ${s.faq({ faq, limit: 6 })}
    ${s.finalCta({ settings, content, location })}
  `;

  return page({
    title: `Хоррор-квест «${quest.name}» в Усть-Каменогорске — 60 минут`,
    description: `${quest.shortDescription} Три персонажа, пять режимов страха. ${location.fullAddress}. Бронирование онлайн.`,
    path: '/quests',
    body,
    settings,
    location,
    ogType: 'article',
    ogImage: `${config.siteUrl}/images/quests/nun-face-1440.webp`,
    jsonLd: [
      jsonld.breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Квесты', path: '/quests' }]),
      jsonld.service(settings, location),
      jsonld.offerCatalog(packages)
    ]
  });
}

/* ── Пакеты и цены ──────────────────────────────────────────────────────── */

function pricesPage(data) {
  const { settings, location, packages, pricePhotos, addons, quest } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Программы', path: '/prices' }])}
    ${s.catalog({ packages, settings, quest })}

    <section class="section section--alt">
      <div class="wrap">
        ${s.sectionHead({
          eyebrow: 'Дополнительно',
          title: 'Видео с вашей игры',
          lead: 'Видео моменты уже входят в пакеты. Reels можно заказать отдельно.'
        })}
        <div class="addons">
          ${addons
            .map(
              (item) => `<article class="addon">
            <h3>${esc(item.name)}</h3>
            <p class="addon-price">${esc(item.priceLabel)}</p>
            <p class="source-line">Табличка «Видео съёмка» в локации</p>
          </article>`
            )
            .join('')}
        </div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="wrap">
        ${s.sectionHead({
          eyebrow: 'Первоисточники',
          title: 'Прайс-листы как есть',
          lead: 'Фотографии прайсов, которые владелец загрузил в 2ГИС. Цены перенесены с них без изменений.'
        })}
        <div class="price-photos">
          ${pricePhotos
            .map(
              (photo) => `<figure class="price-photo">
            <a href="${esc(photo.src)}" target="_blank" rel="noopener">
              <img src="${esc(photo.src)}" alt="${esc(photo.alt)}" width="1000" height="1333" loading="lazy" decoding="async">
            </a>
            <figcaption>${esc(photo.caption)}</figcaption>
          </figure>`
            )
            .join('')}
        </div>
      </div>
    </section>

    ${bookingBlock(data)}
  `;
  return page({
    title: 'Программы и цены хоррор-квеста FANTOM — Усть-Каменогорск',
    description:
      'Пакет Хоррор — 17 500 ₸ за двоих, Level mini — 30 000 ₸, Level 1 — 36 500 ₸, Level 2 — 50 000 ₸. ' +
      'Реальные цены с прайс-листов FANTOM в Усть-Каменогорске.',
    path: '/prices',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Программы', path: '/prices' }]),
      jsonld.offerCatalog(packages)
    ]
  });
}

/* ── Галерея ────────────────────────────────────────────────────────────── */

function galleryPage(data) {
  const { settings, location, gallery, pricePhotos } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Галерея', path: '/gallery' }])}
    ${s.gallery({ gallery, settings, location })}
    <section class="section section--alt">
      <div class="wrap">
        ${s.sectionHead({
          eyebrow: 'Документы',
          title: 'Прайс-листы и таблички',
          lead: 'Реальные таблички из локации: режимы игры, программы и стоимость видео.'
        })}
        <div class="price-photos">
          ${pricePhotos
            .map(
              (photo) => `<figure class="price-photo">
            <a href="${esc(photo.src)}" target="_blank" rel="noopener">
              <img src="${esc(photo.src)}" alt="${esc(photo.alt)}" width="1000" height="1333" loading="lazy" decoding="async">
            </a>
            <figcaption>${esc(photo.caption)}</figcaption>
          </figure>`
            )
            .join('')}
        </div>
      </div>
    </section>
    ${s.instagram({ settings, gallery })}
    ${s.finalCta({ settings, content: data.content, location })}
  `;
  return page({
    title: 'Фото хоррор-квеста FANTOM — локация, актёры, вывеска',
    description:
      'Реальные фотографии локации FANTOM в Усть-Каменогорске: актёры в образах, интерьер, вывеска, прайс-листы и режимы игры.',
    path: '/gallery',
    body,
    settings,
    location,
    jsonLd: [jsonld.breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Галерея', path: '/gallery' }])]
  });
}

/* ── Отзывы ─────────────────────────────────────────────────────────────── */

function reviewsPage(data) {
  const { settings, location, reviews, content } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Отзывы', path: '/reviews' }])}
    ${s.reviews({ settings, reviews, limit: 0 })}
    <section class="section section--alt">
      <div class="wrap">
        ${s.sectionHead({ eyebrow: 'Прозрачность', title: 'Как мы работаем с отзывами' })}
        <ul class="plain-list">
          <li>Отзывы приведены дословно: текст, имя, дата и оценка — как в 2ГИС.</li>
          <li>Ответы организации тоже настоящие — их писал администратор FANTOM.</li>
          <li>Мы не публикуем отзывы без источника и не покупаем рейтинг.</li>
          <li>Рейтинг и количество отзывов — живые данные 2ГИС, их обновляет владелец.</li>
        </ul>
      </div>
    </section>
    ${s.finalCta({ settings, content, location })}
  `;
  return page({
    title: `Отзывы о хоррор-квесте FANTOM — рейтинг ${String(settings.rating.value).replace('.', ',')} в 2ГИС`,
    description:
      `Рейтинг ${String(settings.rating.value).replace('.', ',')} и ${settings.rating.reviewsCount} отзыва о хоррор-квесте FANTOM в Усть-Каменогорске. Дословные отзывы гостей и ответы администратора.`,
    path: '/reviews',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Отзывы', path: '/reviews' }]),
      ...(jsonld.reviews(reviews, settings) || [])
    ]
  });
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */

function faqPage(data) {
  const { settings, location, faq } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Вопросы', path: '/faq' }])}
    ${s.faq({ faq })}
    ${s.beforeYouGo({ settings, location, quest: data.quest })}
    ${s.finalCta({ settings, content: data.content, location })}
  `;
  return page({
    title: 'Частые вопросы о хоррор-квесте FANTOM — цена, возраст, режимы',
    description:
      'Сколько стоит, сколько длится, можно ли с детьми, какой режим страха выбрать, как забронировать. Подтверждённые ответы и открытые вопросы.',
    path: '/faq',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Вопросы', path: '/faq' }]),
      jsonld.faqPage(faq)
    ]
  });
}

/* ── Контакты ───────────────────────────────────────────────────────────── */

function contactsPage(data) {
  const { settings, location, quest } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Контакты', path: '/contacts' }])}
    ${s.locationSection({ settings, location })}
    <section class="section">
      <div class="wrap two-col">
        <div class="panel">
          <p class="panel-title">О локации</p>
          <p>${esc(quest.shortDescription)}</p>
          <p class="panel-note">${esc(quest.ageNote)}</p>
        </div>
        <div class="panel">
          <p class="panel-title">Два аккаунта Instagram</p>
          <p>${esc(settings.instagramNote.text)}</p>
          <p class="panel-note">
            <a href="${esc(settings.instagramUrl)}" rel="noopener">${esc(settings.instagramHandle)}</a> ·
            <a href="${esc(settings.instagramGisUrl)}" rel="noopener">${esc(settings.instagramGisHandle)}</a>
          </p>
        </div>
      </div>
    </section>
    ${s.faq({ faq: data.faq, limit: 5 })}
    ${s.finalCta({ settings, content: data.content, location })}
  `;
  return page({
    title: 'Контакты FANTOM — Назарбаева, 50, Усть-Каменогорск',
    description:
      'Адрес: проспект Нурсултана Назарбаева, 50, цокольный этаж, Усть-Каменогорск, 070018. Телефон и WhatsApp +7 700 153 85 84. Ежедневно 09:00–02:00.',
    path: '/contacts',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Контакты', path: '/contacts' }]),
      jsonld.localBusiness(settings, location)
    ]
  });
}

/* ── Запись ─────────────────────────────────────────────────────────────── */

function bookingPage(data) {
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Запись', path: '/booking' }])}
    ${bookingBlock(data)}
    <section class="section section--alt">
      <div class="wrap two-col">
        <div class="panel">
          <p class="panel-title">Что будет после заявки</p>
          <ol class="plain-list">
            <li>Слот закрепляется за вами на время подтверждения.</li>
            <li>Администратор пишет в выбранный канал и подтверждает время.</li>
            <li>Если планы изменятся — напишите, время освободим.</li>
          </ol>
        </div>
        <div class="panel">
          <p class="panel-title">Оплата</p>
          <p>${esc(data.settings.payments.methods.join(', '))} — на месте.</p>
          <p class="panel-note">Сайт не принимает платежи и не запрашивает данные карты.</p>
        </div>
      </div>
    </section>
  `;
  return page({
    title: 'Запись на хоррор-квест FANTOM — выбрать дату и время',
    description:
      'Выберите программу, дату и свободное время. Заявка бесплатная: администратор FANTOM подтвердит бронь в WhatsApp, Telegram или звонком.',
    path: '/booking',
    body,
    settings: data.settings,
    location: data.location,
    jsonLd: [jsonld.breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Запись', path: '/booking' }])]
  });
}

function bookingStatusPage(data) {
  const { settings, location } = data;
  const body = `
    ${crumbs([
      { name: 'Главная', path: '/' },
      { name: 'Запись', path: '/booking' },
      { name: 'Статус', path: '/booking/status' }
    ])}
    <section class="section">
      <div class="wrap narrow">
        ${s.sectionHead({ eyebrow: 'Проверка', title: 'Статус заявки', lead: 'Введите номер заявки и телефон, на который она оформлялась.' })}
        <form class="panel" id="status-form" novalidate>
          <div class="field">
            <label for="status-ref">Номер заявки</label>
            <input id="status-ref" name="ref" type="text" placeholder="F-XXXXXX" required autocomplete="off">
          </div>
          <div class="field">
            <label for="status-phone">Телефон</label>
            <input id="status-phone" name="phone" type="tel" inputmode="tel" placeholder="+7 700 000 00 00" required autocomplete="tel">
          </div>
          <p class="wizard-error" data-status-error role="alert" aria-live="assertive" hidden></p>
          <button class="btn btn-blood" type="submit">Проверить</button>
        </form>
        <div class="panel panel--result" data-status-result hidden aria-live="polite">
          <p class="panel-title">Заявка <span data-result-ref></span></p>
          <ul class="summary-list">
            <li><span>Статус</span><b data-result-status>—</b></li>
            <li><span>Программа</span><b data-result-package>—</b></li>
            <li><span>Дата</span><b data-result-date>—</b></li>
            <li><span>Время</span><b data-result-time>—</b></li>
            <li><span>Гостей</span><b data-result-guests>—</b></li>
          </ul>
          <a class="btn btn-outline" href="${esc(settings.whatsappUrl)}" rel="noopener">Написать администратору</a>
        </div>
      </div>
    </section>
  `;
  return page({
    title: 'Статус заявки — FANTOM',
    description: 'Проверьте статус брони хоррор-квеста FANTOM по номеру заявки и телефону.',
    path: '/booking/status',
    body,
    settings,
    location,
    noindex: true,
    jsonLd: []
  });
}

function privacyPage(data) {
  const { settings, location } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Обработка данных', path: '/privacy' }])}
    <section class="section">
      <div class="wrap narrow prose">
        ${s.sectionHead({ eyebrow: 'Документы', title: 'Обработка персональных данных' })}
        <div class="legal-note">
          <b>Черновик. Требуется юридическая проверка.</b>
          <p>Текст описывает то, как реально работает сайт. Перед публикацией его должен проверить юрист на соответствие законодательству Казахстана о персональных данных.</p>
        </div>
        <h2>Что собираем</h2>
        <p>Имя, телефон, предпочтительный канал связи и необязательный комментарий. Дополнительно фиксируется дата согласия и источник заявки.</p>
        <h2>Зачем</h2>
        <p>Только чтобы подтвердить бронь, связаться с вами и, при необходимости, перенести игру. Рассылок без отдельного согласия нет.</p>
        <h2>Сколько храним</h2>
        <p>Заявки хранятся до 12 месяцев после даты игры. Срок подтверждает владелец в финальной версии документа.</p>
        <h2>Кто видит</h2>
        <p>Администраторы FANTOM через защищённую панель. Все действия с заявками пишутся в журнал, персональные данные в нём маскируются.</p>
        <h2>Отзыв согласия</h2>
        <p>Напишите в WhatsApp <a href="${esc(settings.whatsappUrl)}" rel="noopener">${esc(settings.phone)}</a> — удалим заявку и данные.</p>
        <h2>Передача третьим лицам</h2>
        <p>Данные не продаются. Технические сервисы доставки уведомлений получают только текст заявки.</p>
        <h2>Контакты</h2>
        <p>${esc(settings.brand.legalName)}<br>${esc(location.fullAddress)}<br>${esc(settings.phone)}</p>
        <p class="legal-foot">Версия черновика 1.2 · составлена ${esc(settings.rating.updatedAt)}</p>
      </div>
    </section>
  `;
  return page({
    title: 'Обработка персональных данных — FANTOM',
    description: 'Какие данные собирает сайт FANTOM, зачем, сколько хранит и как отозвать согласие.',
    path: '/privacy',
    body,
    settings,
    location,
    noindex: true,
    jsonLd: []
  });
}

function notFoundPage(data) {
  const { settings, location } = data;
  const body = `
    <section class="section">
      <div class="wrap narrow error-page">
        <p class="eyebrow">404</p>
        <h1>Здесь темно и пусто</h1>
        <p>Такой страницы нет. Но квест на месте.</p>
        <div class="location-actions">
          <a class="btn btn-blood" href="/booking">Забронировать</a>
          <a class="btn btn-outline" href="/">На главную</a>
        </div>
      </div>
    </section>
  `;
  return page({
    title: 'Страница не найдена — FANTOM',
    description: 'Такой страницы нет. Перейдите к записи на хоррор-квест FANTOM.',
    path: '/404',
    body,
    settings,
    location,
    noindex: true,
    jsonLd: []
  });
}

module.exports = {
  home,
  questPage,
  pricesPage,
  galleryPage,
  reviewsPage,
  faqPage,
  contactsPage,
  bookingPage,
  bookingStatusPage,
  privacyPage,
  notFoundPage
};
