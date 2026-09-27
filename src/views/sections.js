'use strict';

const config = require('../config');
const { esc } = require('../lib/validate');
const { brandMark } = require('./layout');

const money = (value) => (Number.isFinite(value) ? value.toLocaleString('ru-RU') + ' ₸' : null);

function sectionHead({ eyebrow, title, lead, id, align = '' }) {
  return `<div class="section-head${align ? ' section-head--' + align : ''}">
  ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
  <h2${id ? ` id="${esc(id)}"` : ''}>${esc(title)}</h2>
  ${lead ? `<p class="section-lead">${esc(lead)}</p>` : ''}
</div>`;
}

function pending(label = 'Уточняется', title) {
  return `<span class="tag tag--pending"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</span>`;
}

function sourceTag(label, url) {
  if (!url) return '';
  return `<a class="source-tag" href="${esc(url)}" rel="noopener nofollow" target="_blank">${esc(label)}</a>`;
}

const ICONS = {
  mask: '<path d="M4 5c2.6.6 4.6 1 8 1s5.4-.4 8-1v6.5c0 4.2-3.1 7.5-8 9.5-4.9-2-8-5.3-8-9.5z"/><circle cx="9.5" cy="11" r="1.6" fill="#050505"/><circle cx="14.5" cy="11" r="1.6" fill="#050505"/>',
  gauge: '<path d="M12 4a8 8 0 1 0 8 8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12l4.5-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 5v14M16 5v14M3 12h18" stroke="currentColor" stroke-width="2"/>',
  camera: '<path d="M3 8h4l2-2h6l2 2h4v10H3z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>',
  puzzle: '<path d="M10 4h4v2.4a1.8 1.8 0 1 0 3.6 0V4H20v6h-2.4a1.8 1.8 0 1 0 0 3.6H20V20h-6v-2.4a1.8 1.8 0 1 0-3.6 0V20H4v-6h2.4a1.8 1.8 0 1 0 0-3.6H4V4h6z"/>',
  clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5.4l3.4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  bolt: '<path d="M13 3L5 13h5l-1 8 8-10h-5z"/>',
  pizza: '<path d="M12 4l8 16H4z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="14" r="1.6"/><circle cx="9.5" cy="17" r="1.3"/>',
  burger: '<path d="M4 9h16M4 13h16M6 17h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="6" r="2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  film2: '<path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 10l5 3-5 3z"/>'
};

function icon(name) {
  const path = ICONS[name] || ICONS.star;
  return `<svg class="feature-icon" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">${path}</svg>`;
}

/* ── HERO ───────────────────────────────────────────────────────────────── */

function hero({ settings, location, quest, packages, ctaHref = '/booking' }) {
  const from = packages.filter((p) => p.priceFrom).sort((a, b) => a.priceFrom - b.priceFrom)[0];
  return `<section class="hero" data-hero>
  <div class="hero-media" aria-hidden="true">
    <img src="/images/quests/nun-hood-1440.webp" alt="" width="1440" height="2636" fetchpriority="high" decoding="async">
    <span class="hero-veil"></span>
    <span class="hero-grain"></span>
  </div>

  <div class="wrap hero-inner">
    <p class="hero-kicker">
      <span class="pulse" aria-hidden="true"></span>
      Хоррор-квест · ${esc(settings.city)}
    </p>

    <h1 class="hero-title">
      <span class="hero-title-brand">${brandMark(56)} Fantom</span>
      <span class="hero-title-line">Испытай свой страх</span>
    </h1>

    <p class="hero-lead">
      Локация «${esc(quest.name)}». <b>60 минут</b> внутри сюжета,
      три персонажа и пять режимов — от детского до харда 18+.
    </p>

    <dl class="hero-facts">
      <div><dt>Длительность</dt><dd>60 минут</dd></div>
      <div><dt>Режимы</dt><dd>5 уровней страха</dd></div>
      ${from ? `<div><dt>Стоимость</dt><dd>от ${esc(money(from.priceFrom))}</dd></div>` : ''}
      <div><dt>Адрес</dt><dd>${esc(location.streetAddress)}</dd></div>
    </dl>

    <div class="hero-actions">
      <a class="btn btn-blood btn-xl" href="${esc(ctaHref)}" data-cta="hero">Забронировать</a>
      <a class="btn btn-outline btn-xl" href="${esc(settings.whatsappUrl)}" rel="noopener" data-cta="whatsapp">Спросить в WhatsApp</a>
    </div>

    <p class="hero-note">
      Заявка бесплатная, ничего не списываем. Администратор подтвердит время в WhatsApp.
    </p>
  </div>

  <a class="hero-scroll" href="#trust" aria-label="Листать вниз"><span aria-hidden="true"></span></a>
</section>`;
}

/* ── TRUST ──────────────────────────────────────────────────────────────── */

function trust({ settings, location }) {
  const r = settings.rating;
  return `<section class="trust" id="trust" aria-label="Проверенные данные">
  <div class="wrap trust-grid">
    <div class="trust-item trust-item--rating">
      <b>${esc(String(r.value).replace('.', ','))}</b>
      <span class="trust-stars" aria-hidden="true">★★★★★</span>
      <small>${esc(r.sourceLabel)} · ${esc(String(r.reviewsCount))} отзыва · ${esc(String(r.ratingsCount))} оценки</small>
      ${sourceTag('Смотреть отзывы', r.sourceUrl)}
    </div>
    <div class="trust-item">
      <b>${esc(String(r.photosCount))}</b>
      <small>фото локации в ${esc(r.sourceLabel)} — мы используем их на сайте</small>
    </div>
    <div class="trust-item">
      <b>${esc(settings.hours.shiftStart)}–${esc(settings.hours.shiftEnd)}</b>
      <small>ежедневно, включая ночные сеансы</small>
    </div>
    <div class="trust-item">
      <b>60 мин</b>
      <small>длится сам квест, 2–3 часа — программы с кинорумом</small>
    </div>
  </div>
  <p class="trust-updated">
    Данные ${esc(r.sourceLabel)} обновлены ${esc(r.updatedAt)}. Рейтинг живой — его обновляет владелец,
    поэтому он не зашит в вёрстку.
  </p>
</section>`;
}

/* ── ПАКЕТЫ ─────────────────────────────────────────────────────────────── */

function packagesSection({ settings, packages, compact = false }) {
  const list = compact ? packages.filter((p) => p.confirmed).slice(0, 4) : packages;
  return `<section class="section section--packages" id="packages">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Выбери свой кошмар',
      title: 'Пакеты и цены',
      lead:
        'Квест можно взять отдельно с кинорумом или собрать полную программу: фильм, пицца, бургеры и видео с вашей игры. Цены — с прайс-листов FANTOM.'
    })}
    <div class="packages">
      ${list.map((item) => packageCard(item)).join('')}
    </div>
    <p class="section-note">
      Цены перенесены с фотографий прайс-листов, которые владелец загрузил в 2ГИС.
      ${sourceTag('Открыть прайс-листы в 2ГИС', settings.rating.sourceUrl.replace('/tab/reviews', '/tab/menu'))}
    </p>
  </div>
</section>`;
}

function packageCard(item) {
  const unconfirmed = !item.confirmed;
  return `<article class="package${item.primary ? ' package--primary' : ''}${unconfirmed ? ' package--pending' : ''}">
  <div class="package-top">
    <span class="package-icon">${icon(item.icon)}</span>
    <div>
      <h3>${esc(item.name)}</h3>
      <p class="package-tagline">${esc(item.tagline)}</p>
    </div>
  </div>

  <p class="package-price">
    ${
      item.priceLabel
        ? `<b>${esc(item.priceLabel)}</b>`
        : pending('Цена уточняется', item.priceNote)
    }
    ${item.durationLabel ? `<span class="package-duration">${esc(item.durationLabel)}</span>` : ''}
  </p>

  ${
    item.includes.length
      ? `<ul class="package-list">${item.includes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`
      : `<ul class="package-list package-list--pending">
          ${(item.unconfirmed || []).map((line) => `<li>${pending(line)}</li>`).join('')}
        </ul>`
  }

  ${item.priceNote ? `<p class="package-note">${esc(item.priceNote)}</p>` : ''}
  ${
    item.priceListImage
      ? `<a class="package-proof" href="${esc(item.priceListImage)}" target="_blank" rel="noopener">
          <img src="${esc(item.priceListImage)}" alt="${esc('Прайс-лист «' + item.name + '»')}" width="1000" height="1333" loading="lazy" decoding="async">
          <span>Фото прайс-листа</span>
        </a>`
      : ''
  }
  ${
    item.confirmed
      ? `<a class="btn btn-blood btn-block" href="/booking?package=${esc(item.id)}" data-cta="package">Забронировать «${esc(item.name.replace(/^Пакет\s*/i, ''))}»</a>`
      : `<span class="btn btn-disabled btn-block" aria-disabled="true">Ждём данные от владельца</span>`
  }
</article>`;
}

/* ── КВЕСТ: персонажи и режимы ──────────────────────────────────────────── */

function questSection({ quest, settings }) {
  return `<section class="section section--quest" id="quest">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Локация',
      title: quest.name,
      lead: quest.shortDescription
    })}

    <div class="quest-layout">
      <div class="quest-characters">
        <h3 class="sub-title">Кого вы встретите</h3>
        <ul class="character-list">
          ${quest.characters
            .map(
              (character) => `<li>
            <span class="character-mark" aria-hidden="true">${brandMark(22)}</span>
            <b>${esc(character.name)}</b>
            <span>${esc(character.note)}</span>
          </li>`
            )
            .join('')}
        </ul>
        <p class="source-line">Подтверждено публикациями FANTOM: «В нашем квесте 3 персонажей».</p>
      </div>

      <div class="quest-modes">
        <h3 class="sub-title">Режимы игры</h3>
        <p class="sub-lead">Уровень страха выбираете вы — от детского до 18+.</p>
        <ol class="mode-list">
          ${quest.modes.list
            .map(
              (mode, index) => `<li class="mode${mode.id === 'hard' ? ' mode--hard' : ''}">
            <span class="mode-num">${String(index + 1).padStart(2, '0')}</span>
            <span class="mode-name">${esc(mode.title)}</span>
          </li>`
            )
            .join('')}
        </ol>
        <p class="source-line">
          Табличка «Режимы игры» в локации. ${sourceTag('Фото таблички', '/images/prices/rezhimy-igry.webp')}
        </p>
      </div>
    </div>

    <div class="quest-cta">
      <a class="btn btn-blood btn-xl" href="/booking">Забронировать квест</a>
      <a class="btn btn-outline btn-xl" href="/quests">Подробнее о локации</a>
    </div>
  </div>
</section>`;
}

/* ── СЮЖЕТ ──────────────────────────────────────────────────────────────── */

function storySection({ content }) {
  const story = content.story;
  return `<section class="section section--story" id="story">
  <div class="wrap">
    ${sectionHead({ eyebrow: story.eyebrow, title: story.title })}
    <ol class="story">
      ${story.steps
        .map(
          (step, index) => `<li class="story-step" data-reveal>
        <span class="story-num">${esc(step.num)}</span>
        <div class="story-body">
          <h3>${esc(step.title)}</h3>
          <p>${esc(step.text)}</p>
          ${step.source ? `<p class="source-line">${esc(step.source)}</p>` : ''}
        </div>
      </li>`
        )
        .join('')}
    </ol>
  </div>
</section>`;
}

/* ── ЧТО ТЕБЯ ЖДЁТ ──────────────────────────────────────────────────────── */

function featuresSection({ content }) {
  return `<section class="section section--features" id="features">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Что тебя ждёт',
      title: 'Всё подтверждено источниками',
      lead: 'Ни одного выдуманного пункта: каждая особенность взята с вывески, прайс-листа или публикации FANTOM.'
    })}
    <div class="features">
      ${content.features
        .map(
          (feature) => `<article class="feature" data-reveal>
        ${icon(feature.icon)}
        <h3>${esc(feature.title)}</h3>
        <p>${esc(feature.text)}</p>
        <span class="feature-source">${esc(feature.source)}</span>
      </article>`
        )
        .join('')}
    </div>
  </div>
</section>`;
}

/* ── ГАЛЕРЕЯ ────────────────────────────────────────────────────────────── */

function gallerySection({ gallery, settings, location, withViewer = true, limit = 0 }) {
  const items = limit ? gallery.slice(0, limit) : gallery;
  return `<section class="section section--gallery" id="gallery">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Реальные кадры',
      title: 'Как это выглядит внутри',
      lead:
        'Фотографии локации, актёров и гостей из галереи FANTOM в 2ГИС. Ничего постановочного и никакого стока.'
    })}
  </div>

  <div class="gallery-strip" data-gallery>
    ${items
      .map(
        (item, index) => `<figure class="gallery-item${item.wide ? ' gallery-item--wide' : ''}">
      <button class="gallery-button" type="button" data-gallery-open="${index}"
              aria-label="Открыть фото: ${esc(item.caption)}">
        <img src="${esc(item.thumb)}" alt="${esc(item.alt)}" width="1000" height="1250"
             loading="lazy" decoding="async">
        <span class="gallery-caption">
          <b>${esc(item.caption)}</b>
          <small>${esc(item.author)}</small>
        </span>
      </button>
    </figure>`
      )
      .join('')}
  </div>

  <div class="wrap gallery-foot">
    <a class="btn btn-outline" href="/gallery">Вся галерея (${gallery.length + 5} кадров)</a>
    <a class="btn btn-ghost" href="${esc(location ? location.galleryUrl : settings.rating.sourceUrl)}" rel="noopener" target="_blank">
      Смотреть все ${esc(String(settings.rating.photosCount))} фото в 2ГИС
    </a>
  </div>

  ${
    withViewer
      ? `<div class="lightbox" data-lightbox hidden role="dialog" aria-modal="true" aria-label="Просмотр фотографии">
    <button class="lightbox-close" type="button" data-lightbox-close aria-label="Закрыть">×</button>
    <button class="lightbox-nav lightbox-nav--prev" type="button" data-lightbox-prev aria-label="Предыдущее фото">‹</button>
    <figure class="lightbox-figure"><img alt="" data-lightbox-image><figcaption data-lightbox-caption></figcaption></figure>
    <button class="lightbox-nav lightbox-nav--next" type="button" data-lightbox-next aria-label="Следующее фото">›</button>
  </div>`
      : ''
  }
  <script type="application/json" data-gallery-data>${JSON.stringify(
    items.map((item) => ({ src: item.src, caption: item.caption, author: item.author, alt: item.alt }))
  ).replace(/</g, '\\u003c')}</script>
</section>`;
}

/* ── ОТЗЫВЫ ─────────────────────────────────────────────────────────────── */

function reviewsSection({ settings, reviews, content, limit = 4 }) {
  const list = limit ? reviews.slice(0, limit) : reviews;
  const r = settings.rating;
  return `<section class="section section--reviews" id="reviews">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Отзывы',
      title: 'Что говорят гости',
      lead: `Рейтинг ${String(r.value).replace('.', ',')} в ${r.sourceLabel} на основе ${r.ratingsCount} оценок и ${r.reviewsCount} отзывов.`
    })}

    <div class="rating-row">
      <div class="rating-big">
        <b>${esc(String(r.value).replace('.', ','))}</b>
        <span class="trust-stars" aria-hidden="true">★★★★★</span>
      </div>
      <ul class="rating-facts">
        <li><b>${esc(String(r.reviewsCount))}</b><span>отзыва</span></li>
        <li><b>${esc(String(r.ratingsCount))}</b><span>оценки</span></li>
        <li><b>${esc(String(r.photosCount))}</b><span>фото</span></li>
        <li><b>${esc(String(r.photosWithReviewsCount))}</b><span>отзыва с фото</span></li>
      </ul>
      <a class="btn btn-outline" href="${esc(r.sourceUrl)}" rel="noopener nofollow" target="_blank" data-cta="reviews">
        Читать все отзывы в ${esc(r.sourceLabel)}
      </a>
    </div>

    <div class="review-grid">
      ${list.map((review) => reviewCard(review)).join('')}
    </div>

    ${
      content && content.reviewHighlights
        ? `<ul class="review-highlights">
      ${content.reviewHighlights
        .map(
          (item) => `<li><b>${esc(item.label)}</b><span>${esc(item.note)}</span></li>`
        )
        .join('')}
    </ul>
    <p class="source-line">
      Подборка составлена по прочитанным отзывам, а не по нашей оценке. Отзывы приведены дословно.
    </p>`
        : ''
    }
  </div>
</section>`;
}

function reviewCard(review) {
  return `<article class="review">
  <header class="review-head">
    <b class="review-author">${esc(review.author)}</b>
    <span class="review-rating" aria-label="Оценка ${review.rating} из 5">${'★'.repeat(review.rating || 5)}</span>
  </header>
  <p class="review-text">${esc(review.text)}</p>
  ${
    review.answer
      ? `<div class="review-answer">
          <b>Ответ FANTOM</b>
          <p>${esc(review.answer)}</p>
        </div>`
      : ''
  }
  <footer class="review-foot">
    <time datetime="${esc(review.publishedAt)}">${esc(formatRuDate(review.publishedAt))}</time>
    <span>${esc(review.sourceLabel || '2ГИС')}</span>
  </footer>
</article>`;
}

function formatRuDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${d} ${months[m - 1]} ${y}`;
}

/* ── КАК ПРОХОДИТ ───────────────────────────────────────────────────────── */

function howSection({ content }) {
  return `<section class="section section--how" id="how">
  <div class="wrap">
    ${sectionHead({ eyebrow: 'Как это работает', title: 'От заявки до темноты' })}
    <ol class="how-list">
      ${content.howItWorks
        .map(
          (step) => `<li class="how-step" data-reveal>
        <span class="how-num">${esc(step.num)}</span>
        <h3>${esc(step.title)}</h3>
        <p>${esc(step.text)}</p>
      </li>`
        )
        .join('')}
    </ol>
  </div>
</section>`;
}

/* ── ЛОКАЦИЯ ────────────────────────────────────────────────────────────── */

function locationSection({ settings, location }) {
  return `<section class="section section--location" id="location">
  <div class="wrap location-grid">
    <div>
      ${sectionHead({ eyebrow: 'Где мы', title: 'Подвал на Назарбаева, 50' })}
      <ul class="location-list">
        <li><span>Адрес</span><b>${esc(location.fullAddress)}</b></li>
        <li><span>Этаж</span><b>${esc(location.floor)}</b></li>
        <li><span>График</span><b>${esc(settings.hours.label)}</b></li>
        <li><span>Телефон</span><b><a href="tel:${esc(settings.phoneE164)}" data-cta="phone">${esc(settings.phone)}</a></b></li>
        <li><span>Instagram</span><b><a href="${esc(settings.instagramUrl)}" rel="noopener" data-cta="instagram">${esc(settings.instagramHandle)}</a></b></li>
        <li><span>Оплата</span><b>${settings.payments.methods.map((m) => esc(m)).join(', ')}</b></li>
      </ul>
      <p class="location-entrance">${esc(location.entranceNote)}</p>
      <div class="location-actions">
        <a class="btn btn-blood" href="${esc(location.routeUrl)}" rel="noopener" data-cta="route">Построить маршрут</a>
        <a class="btn btn-outline" href="/contacts">Контакты и вход</a>
      </div>
    </div>
    <a class="location-photo" href="${esc(location.galleryUrl)}" rel="noopener" target="_blank">
      <img src="/images/gallery/entrance-street-1000.webp" alt="Вход в локацию FANTOM: белая кирпичная стена с чёрной вывеской QUEST ROOM FANTOM"
           width="1000" height="750" loading="lazy" decoding="async">
      <span>Вход с улицы. Ещё фото — в 2ГИС</span>
    </a>
  </div>
</section>`;
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */

function faqItem(item, index) {
  const published = item.status === 'published' && item.answer;
  return `<details class="faq"${index === 0 ? ' open' : ''}>
  <summary>
    <span class="faq-question">${esc(item.question)}</span>
    ${published ? '' : pending('Нужно подтвердить')}
  </summary>
  <div class="faq-answer">
    ${
      published
        ? `<p>${esc(item.answer)}</p>`
        : `<p class="faq-pending">${esc(item.placeholder || 'Ответ появится после подтверждения владельцем.')}</p>`
    }
  </div>
</details>`;
}

function faqSection({ faq, limit = 0, title = 'Частые вопросы' }) {
  const published = faq.filter((item) => item.status === 'published');
  const pendingItems = faq.filter((item) => item.status !== 'published');
  const list = limit ? [...published, ...pendingItems].slice(0, limit) : [...published, ...pendingItems];
  return `<section class="section section--faq" id="faq">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'FAQ',
      title,
      lead: 'Сначала то, что известно точно. Ниже — вопросы, по которым ответ нужен от владельца: мы помечаем их, а не додумываем.'
    })}
    <div class="faq-list">${list.map((item, index) => faqItem(item, index)).join('')}</div>
  </div>
</section>`;
}

/* ── ФИНАЛЬНЫЙ CTA ──────────────────────────────────────────────────────── */

function finalCtaSection({ settings, content, location }) {
  const cta = content.finalCta;
  return `<section class="final" id="final">
  <div class="final-bg" aria-hidden="true">
    <img src="/images/quests/nun-face-1440.webp" alt="" width="1440" height="2560" loading="lazy" decoding="async">
    <span class="final-veil"></span>
  </div>
  <div class="wrap final-inner">
    <p class="eyebrow">${esc(cta.eyebrow)}</p>
    <h2 class="final-title">${esc(cta.title)}</h2>
    <p class="final-lead">${esc(cta.lead)}</p>
    <div class="final-actions">
      <a class="btn btn-blood btn-xl" href="/booking" data-cta="final">Забронировать квест</a>
      <a class="btn btn-outline btn-xl" href="tel:${esc(settings.phoneE164)}" data-cta="phone">${esc(settings.phone)}</a>
    </div>
    <p class="final-note">${esc(cta.note)}</p>
    <p class="final-address">${esc(location.fullAddress)} · ${esc(settings.hours.label)}</p>
  </div>
</section>`;
}

/* ── МАСТЕР ЗАПИСИ ──────────────────────────────────────────────────────── */

/**
 * Форма записи. Три шага: пакет → дата и время → контакты.
 * Все данные проверяются на сервере; здесь только UX.
 */
function bookingWizard({ settings, packages, days, initialPackage, initialDate, preselectedSlot }) {
  const bookable = packages.filter((p) => p.confirmed);
  const total = days.length;

  return `<div class="booking-layout">
  <form class="wizard" id="booking-form" novalidate
        data-initial-package="${esc(initialPackage || '')}"
        data-initial-date="${esc(initialDate || '')}"
        data-initial-slot="${esc(preselectedSlot || '')}"
        data-whatsapp="${esc(settings.whatsappUrl)}"
        data-phone="${esc(settings.phone)}">

    <ol class="wizard-progress" data-progress>
      <li class="is-active" data-progress-step="1"><span>1</span> Пакет</li>
      <li data-progress-step="2"><span>2</span> Дата и время</li>
      <li data-progress-step="3"><span>3</span> Контакты</li>
    </ol>

    <fieldset class="wizard-step is-active" data-step="1">
      <legend class="wizard-legend">Шаг 1 из 3. Выберите пакет</legend>
      <div class="package-picker" role="radiogroup" aria-label="Пакет">
        ${bookable
          .map(
            (item) => `<button class="package-option" type="button" role="radio" aria-checked="${item.id === initialPackage ? 'true' : 'false'}"
              data-package="${esc(item.id)}"
              data-package-name="${esc(item.name)}"
              data-package-duration="${esc(item.durationLabel || '')}">
          <span class="package-option-name">${esc(item.name)}</span>
          <span class="package-option-price">${item.priceLabel ? esc(item.priceLabel) : pending('цена уточняется')}</span>
          <span class="package-option-meta">${esc(item.durationLabel || '')}${item.durationLabel && item.audienceLabel ? ' · ' : ''}${esc(item.audienceLabel || '')}</span>
        </button>`
          )
          .join('')}
      </div>
      <input type="hidden" name="packageId" id="packageId" value="${esc(initialPackage || '')}">
      <p class="wizard-hint" data-step1-hint>Пакет со звёздочкой — рекомендуемый: в нём и квест, и фильм.</p>
      <div class="wizard-nav">
        <a class="btn btn-ghost" href="${esc(settings.whatsappUrl)}" rel="noopener">Не уверен — спросить</a>
        <button class="btn btn-blood" type="button" data-next="2">Дальше: дата и время</button>
      </div>
    </fieldset>

    <fieldset class="wizard-step" data-step="2">
      <legend class="wizard-legend">Шаг 2 из 3. Дата и время</legend>

      <div class="field">
        <label for="date">Игровой день</label>
        <select id="date" name="date" required aria-required="true" data-date-select>
          ${days
            .map(
              (day) =>
                `<option value="${esc(day.businessDate)}"${day.businessDate === initialDate ? ' selected' : ''}>${esc(
                  day.label
                )}${day.availableCount ? ` — свободно ${day.availableCount}` : ' — нет свободного времени'}</option>`
            )
            .join('')}
        </select>
        <p class="field-hint">График ${esc(settings.hours.label)}. Ночные сеансы после 00:00 помечены «после полуночи» и относятся к выбранному игровому дню.</p>
      </div>

      <div class="field">
        <span class="field-label" id="slots-label">Свободное время</span>
        <div class="slot-picker" role="radiogroup" aria-labelledby="slots-label" data-slot-picker>
          <p class="slot-hint">Загружаем свободные слоты…</p>
        </div>
        <p class="field-hint" data-slot-status aria-live="polite"></p>
      </div>
      <input type="hidden" name="time" id="time" required>

      <div class="wizard-nav">
        <button class="btn btn-ghost" type="button" data-back="1">Назад</button>
        <button class="btn btn-blood" type="button" data-next="3" data-requires-slot>Дальше: контакты</button>
      </div>
    </fieldset>

    <fieldset class="wizard-step" data-step="3">
      <legend class="wizard-legend">Шаг 3 из 3. Контакты</legend>

      <div class="field">
        <label for="guests">Сколько вас будет</label>
        <input id="guests" name="guests" type="number" inputmode="numeric" min="1" max="30" step="1" value="4" required
               aria-required="true" aria-describedby="guests-hint">
        <p class="field-hint" id="guests-hint">Точную доплату за дополнительных игроков подтвердит администратор.</p>
      </div>

      <div class="field">
        <label for="name">Имя</label>
        <input id="name" name="name" type="text" autocomplete="name" maxlength="80" required aria-required="true" aria-describedby="name-hint">
        <p class="field-hint" id="name-hint">Как к вам обращаться при подтверждении.</p>
      </div>

      <div class="field">
        <label for="phone">Телефон</label>
        <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required
               aria-required="true" placeholder="+7 700 000 00 00" aria-describedby="phone-hint">
        <p class="field-hint" id="phone-hint">Формат Казахстана: +7 XXX XXX XX XX. Вставить номер из буфера можно — мы сами расставим пробелы.</p>
      </div>

      <div class="field">
        <span class="field-label" id="messenger-label">Куда написать</span>
        <div class="radio-row" role="radiogroup" aria-labelledby="messenger-label">
          <label class="radio"><input type="radio" name="messenger" value="whatsapp" checked><span>WhatsApp</span></label>
          <label class="radio"><input type="radio" name="messenger" value="telegram"><span>Telegram</span></label>
          <label class="radio"><input type="radio" name="messenger" value="call"><span>Звонок</span></label>
        </div>
      </div>

      <div class="field">
        <label for="comment">Комментарий <span class="optional">необязательно</span></label>
        <textarea id="comment" name="comment" rows="3" maxlength="600"
                  placeholder="День рождения, нужен детский режим, во сколько удобно позвонить"></textarea>
      </div>

      <div class="field field--consent">
        <label class="checkbox">
          <input type="checkbox" id="consent" name="consent" required aria-required="true" aria-describedby="consent-hint">
          <span>Согласен на обработку персональных данных по <a href="/privacy" target="_blank" rel="noopener">политике</a>.</span>
        </label>
        <p class="field-hint" id="consent-hint">Храним имя, телефон и комментарий. Больше ничего не запрашиваем.</p>
      </div>

      <div class="hp-field" aria-hidden="true">
        <label for="website">Не заполняйте это поле</label>
        <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
      </div>

      <p class="wizard-error" data-form-error role="alert" aria-live="assertive" hidden></p>

      <div class="wizard-nav">
        <button class="btn btn-ghost" type="button" data-back="2">Назад</button>
        <button class="btn btn-blood btn-xl" type="submit" data-submit>Забронировать</button>
      </div>
      <p class="wizard-hint">
        Кнопка отправляет заявку, а не оплату: сайт не принимает платежи.
      </p>
    </fieldset>
  </form>

  <aside class="wizard-summary" aria-live="polite">
    <div class="summary-card">
      <p class="summary-title">Ваша заявка</p>
      <ul class="summary-list">
        <li><span>Пакет</span><b data-summary-package>—</b></li>
        <li><span>Длительность</span><b data-summary-duration>—</b></li>
        <li><span>Дата</span><b data-summary-date>—</b></li>
        <li><span>Время</span><b data-summary-time>—</b></li>
        <li><span>Игроков</span><b data-summary-guests>—</b></li>
        <li><span>Цена</span><b data-summary-price class="pending-value">уточнит администратор</b></li>
      </ul>
      <p class="summary-note">Оплата на месте: наличные, перевод с карты или QR-код.</p>
    </div>
  </aside>
</div>`;
}

function bookingSuccess({ settings }) {
  return `<section class="success" data-success hidden tabindex="-1" role="status">
  <p class="eyebrow">Заявка принята</p>
  <h2 class="success-title">Мы получили вашу заявку</h2>
  <ul class="summary-list">
    <li><span>Номер заявки</span><b data-success-ref>—</b></li>
    <li><span>Пакет</span><b data-success-package>—</b></li>
    <li><span>Дата</span><b data-success-date>—</b></li>
    <li><span>Время</span><b data-success-time>—</b></li>
    <li><span>Игроков</span><b data-success-guests>—</b></li>
    <li><span>Цена</span><b class="pending-value">уточнит администратор</b></li>
  </ul>
  <p class="success-note" data-success-note></p>
  <div class="success-actions">
    <a class="btn btn-blood" data-success-whatsapp href="${esc(settings.whatsappUrl)}" rel="noopener">Написать в WhatsApp</a>
    <a class="btn btn-outline" href="tel:${esc(settings.phoneE164)}">${esc(settings.phone)}</a>
    <a class="btn btn-ghost" href="/booking/status">Проверить статус</a>
  </div>
</section>`;
}

module.exports = {
  money,
  sectionHead,
  pending,
  sourceTag,
  icon,
  hero,
  trust,
  packagesSection,
  packageCard,
  questSection,
  storySection,
  featuresSection,
  gallerySection,
  reviewsSection,
  reviewCard,
  howSection,
  locationSection,
  faqSection,
  faqItem,
  finalCtaSection,
  bookingWizard,
  bookingSuccess,
  formatRuDate
};
