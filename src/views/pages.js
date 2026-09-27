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

/* ── Главная ────────────────────────────────────────────────────────────── */

function home(data) {
  const { settings, location, quest, packages, gallery, reviews, faq, content, days } = data;
  const body = `
    ${s.hero({ settings, location, quest, packages })}
    ${s.trust({ settings, location })}
    ${s.packagesSection({ settings, packages })}
    ${s.questSection({ quest, settings })}
    ${s.storySection({ content })}
    ${s.featuresSection({ content })}
    ${s.gallerySection({ gallery, settings, location, limit: 12 })}
    ${s.reviewsSection({ settings, reviews, content, limit: 4 })}
    ${s.howSection({ content })}
    <section class="section section--booking" id="booking">
      <div class="wrap">
        ${s.sectionHead({
          eyebrow: 'Запись',
          title: 'Забронировать квест',
          lead: 'Три шага: пакет, дата и время, контакты. Заявка бесплатная — оплата на месте.'
        })}
        ${s.bookingWizard({
          settings,
          packages,
          days,
          initialPackage: '',
          initialDate: '',
          preselectedSlot: ''
        })}
        ${s.bookingSuccess({ settings })}
      </div>
    </section>
    ${s.locationSection({ settings, location })}
    ${s.faqSection({ faq, limit: 6 })}
    ${s.finalCtaSection({ settings, content, location })}
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
  const { settings, location, quest, packages, gallery, days } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Квест', path: '/quests' }])}

    <section class="section quest-hero">
      <div class="wrap quest-hero-grid">
        <div>
          <p class="eyebrow">${esc(quest.genre)} · ${esc(settings.city)}</p>
          <h1>${esc(quest.name)}</h1>
          <p class="lede">${esc(quest.longDescription)}</p>
          <dl class="hero-facts">
            <div><dt>Длительность</dt><dd>${esc(String(quest.durationMinutes))} минут</dd></div>
            <div><dt>Персонажи</dt><dd>${esc(String(quest.characters.length))}</dd></div>
            <div><dt>Режимы</dt><dd>${esc(String(quest.modes.list.length))} уровня страха</dd></div>
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
        </figure>
      </div>
    </section>

    ${s.questSection({ quest, settings })}
    ${s.storySection({ content: data.content })}
    ${s.gallerySection({ gallery, settings, location, limit: 0 })}

    <section class="section section--slots" id="slots">
      <div class="wrap">
        ${s.sectionHead({
          eyebrow: 'Свободное время',
          title: 'Ближайшие игровые дни',
          lead: `График ${settings.hours.label}. Слоты после полуночи относятся к предыдущему игровому дню.`
        })}
        <div class="days">
          ${days
            .slice(0, 7)
            .map(
              (day) => `<article class="day">
            <header><h3>${esc(day.label)}</h3><span>${day.availableCount ? `свободно ${day.availableCount}` : 'нет мест'}</span></header>
            <ul class="day-slots">
              ${day.slots
                .filter((slot) => slot.status === 'open' || slot.status === 'held')
                .slice(0, 8)
                .map(
                  (slot) =>
                    `<li class="day-slot">${esc(slot.time)}${slot.crossesMidnight ? '<i>+1д</i>' : ''}</li>`
                )
                .join('') || '<li class="day-slot day-slot--empty">мест нет</li>'}
            </ul>
            ${
              day.availableCount
                ? `<a class="btn btn-outline btn-block" href="/booking?date=${esc(day.businessDate)}">Выбрать</a>`
                : '<span class="btn btn-disabled btn-block" aria-disabled="true">Нет мест</span>'
            }
          </article>`
            )
            .join('')}
        </div>
      </div>
    </section>

    ${s.packagesSection({ settings, packages })}
    ${s.finalCtaSection({ settings, content: data.content, location })}
  `;

  return page({
    title: `Хоррор-квест «${quest.name}» в Усть-Каменогорске — 60 минут, от 17 500 ₸`,
    description: `${quest.shortDescription} Три персонажа, пять режимов страха. ${location.fullAddress}. Бронирование онлайн.`,
    path: '/quests',
    body,
    settings,
    location,
    ogType: 'article',
    ogImage: `${config.siteUrl}/images/quests/nun-face-1440.webp`,
    jsonLd: [
      jsonld.breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Квест', path: '/quests' }]),
      jsonld.service(settings, location),
      jsonld.offerCatalog(packages)
    ]
  });
}

/* ── Пакеты и цены ──────────────────────────────────────────────────────── */

function pricesPage(data) {
  const { settings, location, packages, pricePhotos, addons } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Пакеты', path: '/prices' }])}
    <section class="section">
      <div class="wrap">
        ${s.sectionHead({
          eyebrow: 'Цены',
          title: 'Пакеты FANTOM',
          lead:
            'Четыре программы: короткая с кинорумом, полная с пиццей и бургерами и флагманский «Пакет Хоррор» с фильмом «Проклятия Монахини».'
        })}
        <div class="packages packages--full">
          ${packages.map((item) => s.packageCard(item)).join('')}
        </div>
      </div>
    </section>

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

    <section class="section">
      <div class="wrap">
        ${s.sectionHead({
          eyebrow: 'Первоисточники',
          title: 'Прайс-листы как есть',
          lead: 'Фотографии прайсов, которые владелец загрузил в 2ГИС. Мы перенесли цены с них без изменений.'
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

    <section class="section section--booking">
      <div class="wrap">
        ${s.sectionHead({ eyebrow: 'Запись', title: 'Выбрать пакет и время' })}
        ${s.bookingWizard({ settings, packages, days: data.days, initialPackage: '', initialDate: '', preselectedSlot: '' })}
        ${s.bookingSuccess({ settings })}
      </div>
    </section>
  `;
  return page({
    title: 'Пакеты и цены хоррор-квеста FANTOM — Усть-Каменогорск',
    description:
      'Пакет Хоррор — 17 500 ₸ за двоих, Level mini — 30 000 ₸, Level 1 — 36 500 ₸, Level 2 — 50 000 ₸. ' +
      'Реальные цены с прайс-листов FANTOM в Усть-Каменогорске.',
    path: '/prices',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([{ name: 'Главная', path: '/' }, { name: 'Пакеты', path: '/prices' }]),
      jsonld.offerCatalog(packages)
    ]
  });
}

/* ── Галерея ────────────────────────────────────────────────────────────── */

function galleryPage(data) {
  const { settings, location, gallery, pricePhotos } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Галерея', path: '/gallery' }])}
    ${s.gallerySection({ gallery, settings, location })}
    <section class="section section--alt">
      <div class="wrap">
        ${s.sectionHead({
          eyebrow: 'Документы',
          title: 'Прайс-листы и таблички',
          lead: 'Реальные таблички из локации: режимы игры, пакеты и стоимость видео.'
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
    ${s.finalCtaSection({ settings, content: data.content, location })}
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
    ${s.reviewsSection({ settings, reviews, content, limit: 0 })}
    <section class="section section--alt">
      <div class="wrap">
        ${s.sectionHead({ eyebrow: 'Прозрачность', title: 'Как мы работаем с отзывами' })}
        <ul class="plain-list">
          <li>Отзывы приведены дословно: текст, имя, дата и оценка — как в 2ГИС.</li>
          <li>Ответы организации тоже настоящие — их писал администратор FANTOM.</li>
          <li>Schema.org Review добавляется только к подтверждённым отзывам с источником.</li>
          <li>Рейтинг и количество отзывов — живые данные 2ГИС, их обновляет владелец в админке.</li>
        </ul>
      </div>
    </section>
    ${s.finalCtaSection({ settings, content, location })}
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
    ${s.faqSection({ faq, title: 'Частые вопросы' })}
    ${s.finalCtaSection({ settings, content: data.content, location })}
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
    <section class="section">
      <div class="wrap contacts-grid">
        <div>
          ${s.sectionHead({ eyebrow: 'Контакты', title: 'FANTOM в Усть-Каменогорске' })}
          <ul class="location-list">
            <li><span>Адрес</span><b>${esc(location.fullAddress)}</b></li>
            <li><span>Этаж</span><b>${esc(location.floor)}</b></li>
            <li><span>График</span><b>${esc(settings.hours.label)}</b></li>
            <li><span>Таймзона</span><b>${esc(settings.timezone)}</b></li>
            <li><span>Телефон</span><b><a href="tel:${esc(settings.phoneE164)}">${esc(settings.phone)}</a></b></li>
            <li><span>WhatsApp</span><b><a href="${esc(settings.whatsappUrl)}" rel="noopener">Написать</a></b></li>
            <li><span>Instagram</span><b><a href="${esc(settings.instagramUrl)}" rel="noopener">${esc(settings.instagramHandle)}</a></b></li>
            <li><span>Оплата</span><b>${settings.payments.methods.map((m) => esc(m)).join(', ')}</b></li>
          </ul>
          <div class="location-actions">
            <a class="btn btn-blood" href="${esc(location.routeUrl)}" rel="noopener">Построить маршрут</a>
            <a class="btn btn-outline" href="/booking">Выбрать время</a>
          </div>
        </div>
        <div>
          <a class="location-photo" href="${esc(location.galleryUrl)}" rel="noopener" target="_blank">
            <img src="/images/gallery/entrance-street-1000.webp" alt="Вход в локацию FANTOM с улицы" width="1000" height="750" loading="lazy" decoding="async">
            <span>Вход: белая кирпичная стена, чёрная вывеска QUEST ROOM FANTOM</span>
          </a>
          <div class="panel">
            <p class="panel-title">Как найти</p>
            <p>${esc(location.entranceNote)}</p>
            <p class="panel-note">Мы на цокольном этаже. Координаты: ${esc(String(location.lat))}, ${esc(String(location.lng))}.</p>
          </div>
          <div class="panel">
            <p class="panel-title">Не подтверждено</p>
            ${(settings.unconfirmedFields || [])
              .slice(0, 4)
              .map((field) => `<p class="panel-item"><b>${esc(field.label)}</b><span>${esc(field.note)}</span></p>`)
              .join('')}
          </div>
        </div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="wrap two-col">
        <div class="panel">
          <p class="panel-title">О квесте</p>
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
  const { settings, location, packages, days } = data;
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Запись', path: '/booking' }])}
    <section class="section section--booking">
      <div class="wrap">
        ${s.sectionHead({
          eyebrow: 'Бронирование',
          title: 'Выберите пакет и время',
          lead: 'Три шага, около минуты. Заявка ничего не оплачивает — администратор подтвердит время.'
        })}
        ${s.bookingWizard({
          settings,
          packages,
          days,
          initialPackage: data.initialPackage,
          initialDate: data.initialDate,
          preselectedSlot: data.preselectedSlot
        })}
        ${s.bookingSuccess({ settings })}
      </div>
    </section>

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
          <p>${esc(settings.payments.methods.join(', '))} — на месте.</p>
          <p class="panel-note">Сайт не принимает платежи и не запрашивает данные карты.</p>
        </div>
      </div>
    </section>
  `;
  return page({
    title: 'Запись на хоррор-квест FANTOM — выбрать дату и время',
    description:
      'Выберите пакет, дату и свободное время. Заявка бесплатная: администратор FANTOM подтвердит бронь в WhatsApp, Telegram или звонком.',
    path: '/booking',
    body,
    settings,
    location,
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
            <li><span>Пакет</span><b data-result-package>—</b></li>
            <li><span>Дата</span><b data-result-date>—</b></li>
            <li><span>Время</span><b data-result-time>—</b></li>
            <li><span>Игроков</span><b data-result-guests>—</b></li>
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
        <p class="legal-foot">Версия черновика 1.1 · составлена ${esc(settings.rating.updatedAt)}</p>
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
