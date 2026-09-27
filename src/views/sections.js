'use strict';

/**
 * Секции страниц.
 *
 * Каждая секция имеет собственный характер, чтобы страница читалась как
 * последовательность сцен, а не как однообразный список блоков:
 * hero — полноэкранный кадр, бегущая строка — тонкая полоса, каталог —
 * крупные карточки, персонажи — тёмная сетка, страх — шкала, сюжет —
 * редакционная вёрстка в две колонки, цифры — крупные числа, отзывы — цитаты,
 * запись — контрастный интерфейс.
 *
 * В публичном интерфейсе нет ни одного слова о хранилище, mock-режиме,
 * уведомлениях и прочей внутренней технике: посетитель видит продукт.
 */

const config = require('../config');
const { esc } = require('../lib/validate');
const { brandMark } = require('./layout');

const money = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString('ru-RU') + ' ₸' : null);

/**
 * Согласование числа с существительным.
 * plural(1, 'отзыв', 'отзыва', 'отзывов') → «отзыв», plural(3, …) → «отзыва».
 *
 * Нужна именно функция: рейтинг и число отзывов в 2ГИС живые, их обновляет
 * владелец. Вписанное руками «343 отзыва» превращается в «341 отзыва», как
 * только счётчик меняется. То же с числом режимов, персонажей и пунктов.
 */
function plural(count, one, few, many) {
  const value = Math.abs(Number(count) || 0);
  const hundred = value % 100;
  const tail = value % 10;
  if (hundred > 10 && hundred < 20) return many;
  if (tail > 1 && tail < 5) return few;
  if (tail === 1) return one;
  return many;
}

function sectionHead({ eyebrow, title, lead, id, align = '', as = 'h2' }) {
  const Tag = as;
  // data-fx="signal": заголовок секции появляется как переключение канала —
  // короткая потеря строки, потом резкий кадр. См. effects.css.
  return `<div class="section-head${align ? ' section-head--' + align : ''}" data-fx="signal">
  ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
  <${Tag}${id ? ` id="${esc(id)}"` : ''}>${esc(title)}</${Tag}>
  ${lead ? `<p class="section-lead">${esc(lead)}</p>` : ''}
</div>`;
}

/**
 * Заголовок внутренней страницы.
 *
 * До этого на внутренних страницах первый заголовок в разметке был H2:
 * визуально заголовок есть, а для поисковика и для навигации скринридером
 * по заголовкам страница оставалась безымянной. Здесь ровно один H1 на
 * страницу, заголовки секций ниже остаются H2.
 */
function pageHead({ eyebrow, title, lead }) {
  return `<div class="page-head">
  <div class="wrap page-head-inner">
    ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
    <h1>${esc(title)}</h1>
    ${lead ? `<p class="section-lead">${esc(lead)}</p>` : ''}
  </div>
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
  pin: '<path d="M12 2c3.9 0 7 3.1 7 7 0 5-7 13-7 13S5 14 5 9c0-3.9 3.1-7 7-7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/>',
  clock2: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2"/>'
};

function icon(name) {
  const path = ICONS[name] || ICONS.star;
  return `<svg class="icon" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">${path}</svg>`;
}

/* ── HERO ───────────────────────────────────────────────────────────────── */

function hero({ settings, location, quest, packages }) {
  const confirmed = packages.filter((item) => item.confirmed && item.priceFrom);
  const from = confirmed.slice().sort((a, b) => a.priceFrom - b.priceFrom)[0];
  const r = settings.rating;

  return `<section class="hero" data-hero>
  <div class="hero-media fx-corners fx-corners--lg" aria-hidden="true">
    <img src="/images/quests/nun-hood-900.webp" srcset="/images/quests/nun-hood-900.webp 900w, /images/quests/nun-hood-1440.webp 1440w" sizes="100vw" alt="" width="1440" height="2636" fetchpriority="high" decoding="async">
    <canvas class="fx-ink" data-fx-ink width="240" height="240"></canvas>
    <span class="hero-veil"></span>
    <span class="hero-grain"></span>
    <span class="fx-scanlines"></span>
    <span class="fx-sweep"></span>
    <span class="fx-osd">
      <span class="fx-osd-rec"></span>
      <span>Камера 02</span>
      <span class="fx-osd-sep">·</span>
      <span class="fx-osd-time" data-fx-clock>00:00:00</span>
    </span>
  </div>

  <div class="wrap hero-inner">
    <p class="hero-kicker">
      <span class="pulse" aria-hidden="true"></span>
      Хоррор-квесты · ${esc(settings.city)}
    </p>

    <h1 class="hero-title">
      <span class="hero-title-brand">${brandMark(52)} Fantom</span>
      <span class="hero-title-line">Ты уверен, что хочешь войти?</span>
    </h1>

    <p class="hero-lead">
      Локация «${esc(quest.name)}»: <b>${esc(String(quest.durationMinutes))} минут</b> внутри сюжета,
      ${esc(String(quest.characters.length))} ${plural(quest.characters.length, 'персонаж', 'персонажа', 'персонажей')}
      и ${esc(String(quest.modes.list.length))} ${plural(quest.modes.list.length, 'режим', 'режима', 'режимов')} страха.
      Уровень выбираешь ты — от детского до харда 18+.
    </p>

    <dl class="hero-facts">
      <div><dt>Оценка игроков</dt><dd>${esc(String(r.value).replace('.', ','))} / 5 · ${esc(String(r.reviewsCount))} ${plural(r.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}</dd></div>
      <div><dt>Длительность</dt><dd>${esc(String(quest.durationMinutes))} ${plural(quest.durationMinutes, 'минута', 'минуты', 'минут')}</dd></div>
      <div><dt>Режимы</dt><dd>${esc(String(quest.modes.list.length))} ${plural(quest.modes.list.length, 'уровень', 'уровня', 'уровней')} страха</dd></div>
      ${from ? `<div><dt>Стоимость</dt><dd>от ${esc(money(from.priceFrom))}</dd></div>` : ''}
    </dl>

    <div class="hero-actions">
      <a class="btn btn-blood btn-xl fx-beam" href="/booking" data-cta="hero" data-fx-magnetic>Забронировать</a>
      <a class="btn btn-outline btn-xl" href="#quests" data-cta="catalog">Выбрать квест</a>
    </div>

    <p class="hero-note">
      ${esc(location.streetAddress)} · ${esc(settings.hours.label)} · оплата на месте
    </p>
  </div>

  <a class="hero-scroll" href="#trust" aria-label="Листать вниз"><span aria-hidden="true"></span></a>
</section>`;
}

/* ── БЕГУЩАЯ СТРОКА ─────────────────────────────────────────────────────── */

function marquee({ settings, quest }) {
  /*
   * Строка не повторяет то, что уже сказано выше: рейтинг, число отзывов,
   * длительность и режимы стоят в hero и в блоке проверенных данных сразу под
   * лентой. Здесь — то, чего в первых двух экранах нет.
   */
  const items = [
    `${esc(settings.brand.tagline)}`,
    `${esc(String(settings.rating.photosCount))} фото локации в ${esc(settings.rating.sourceLabel)}`,
    `${esc(settings.hours.label)} ежедневно, есть ночные сеансы`,
    `видео моменты с игры включены в программы`,
    `кинорум KinoLand: фильмы, PlayStation, караоке`,
    `${esc(settings.brand.displayName)} — ${esc(settings.city)}`,
    `${esc(settings.brand.legalName)}`
  ];
  const run = items.map((item) => `<span class="marquee-item">${item}</span>`).join('<span class="marquee-dot" aria-hidden="true"></span>');

  return `<section class="marquee" aria-hidden="true">
  <div class="marquee-track">
    <div class="marquee-run">${run}</div>
    <div class="marquee-run">${run}</div>
  </div>
</section>`;
}

/* ── TRUST ──────────────────────────────────────────────────────────────── */

function trust({ settings, location, quest }) {
  const r = settings.rating;
  return `<section class="trust" id="trust" aria-label="Проверенные данные">
  <div class="wrap trust-grid">
    <div class="trust-item trust-item--rating">
      <b>${esc(String(r.value).replace('.', ','))}</b>
      <span class="trust-stars" aria-hidden="true">★★★★★</span>
      <small>${esc(r.sourceLabel)} · ${esc(String(r.reviewsCount))} ${plural(r.reviewsCount, 'отзыв', 'отзыва', 'отзывов')} · ${esc(String(r.ratingsCount))} ${plural(r.ratingsCount, 'оценка', 'оценки', 'оценок')}</small>
      ${sourceTag('Открыть отзывы', r.sourceUrl)}
    </div>
    <div class="trust-item">
      <b>${esc(String(r.photosCount))}</b>
      <small>фотографии локации в ${esc(r.sourceLabel)} — кадры на сайте оттуда</small>
    </div>
    <div class="trust-item">
      <b>${esc(settings.hours.shiftStart)}–${esc(settings.hours.shiftEnd)}</b>
      <small>работаем ежедневно, включая ночные сеансы</small>
    </div>
    <div class="trust-item">
      <b>${esc(String(quest.durationMinutes))} мин</b>
      <small>длится сам квест, 2–3 часа — программы с кинорумом</small>
    </div>
  </div>
  <p class="trust-updated">
    Данные ${esc(r.sourceLabel)} обновлены ${esc(r.updatedAt)}. Рейтинг живой: его обновляет владелец,
    поэтому он не зашит в вёрстку. Адрес: ${esc(location.fullAddress)}.
  </p>
</section>`;
}

/* ── БЛИЖАЙШИЕ ИГРЫ ─────────────────────────────────────────────────────── */

function slotsBoard({ days, quest, settings, limit = 6 }) {
  const now = new Date().toISOString();
  const open = [];
  for (const day of days) {
    for (const slot of day.slots) {
      if (slot.status !== 'open') continue;
      if (slot.startIso < now) continue;
      open.push({ day, slot });
    }
  }
  const rows = open.slice(0, limit);

  return `<section class="section section--slots" id="slots">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Занятость сейчас',
      title: 'Ближайшие игры',
      lead: 'Свободное время по игровым дням. Ночные сеансы после полуночи помечены отдельно.'
    })}

    ${
      rows.length
        ? `<ul class="slot-board">
      ${rows
        .map(
          (row) => `<li class="slot-row" data-fx="rise">
        <div class="slot-row-when">
          <b>${esc(row.slot.time)}</b>
          <span>${esc(row.day.label)}${row.slot.crossesMidnight ? ' · после полуночи' : ''}</span>
        </div>
        <div class="slot-row-quest">
          <span>${esc(quest.name)}</span>
          <small>${esc(settings.hours.label)}</small>
        </div>
        <a class="btn btn-blood" href="/booking?date=${esc(row.day.businessDate)}&time=${esc(row.slot.time)}">Забронировать</a>
      </li>`
        )
        .join('')}
    </ul>`
        : `<div class="empty-state">
        <b>Свободное время показывается в форме записи</b>
        <p>Выберите сценарий и дату — свободные слоты появятся сразу.</p>
        <a class="btn btn-blood" href="/booking">Перейти к записи</a>
      </div>`
    }

    ${
      /* Прямо говорим, что это витрина, а не полный список: раньше блок
         показывал 6 сеансов, а форма — 9, и разница выглядела как ошибка. */
      rows.length
        ? `<p class="section-note">
      Показаны ближайшие ${rows.length} ${plural(rows.length, 'слот', 'слота', 'слотов')}.
      Всего свободно ${esc(String(open.length))} ${plural(open.length, 'слот', 'слота', 'слотов')} —
      полный список открывается в форме записи. Свободное время не зависит от выбранной программы.
    </p>`
        : ''
    }
  </div>
</section>`;
}

/* ── КАТАЛОГ ────────────────────────────────────────────────────────────── */

function catalog({ packages, settings, quest }) {
  const confirmed = packages.filter((item) => item.confirmed);
  const durations = [...new Set(confirmed.map((item) => item.durationLabel).filter(Boolean))];

  return `<section class="section section--catalog" id="quests">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Каталог',
      title: 'Выбери свой страх',
      lead:
        'Четыре программы: короткая с кинорумом, две полные с пиццей и бургерами и «Пакет Хоррор» с фильмом «Проклятия Монахини». ' +
        'Цены — с прайс-листов локации.'
    })}

    ${
      durations.length > 1
        ? `<div class="chips" role="group" aria-label="Фильтр по длительности">
      <button class="chip is-active" type="button" data-filter="all" aria-pressed="true">Все программы</button>
      ${durations
        .map(
          (label) =>
            `<button class="chip" type="button" data-filter="${esc(label)}" aria-pressed="false">${esc(label)}</button>`
        )
        .join('')}
      <span class="chips-count" data-filter-count>Показано: ${confirmed.length} из ${confirmed.length}</span>
    </div>`
        : ''
    }

    <div class="catalog" data-catalog>
      ${confirmed.map((item) => catalogCard(item)).join('')}
    </div>

    ${
      packages.some((item) => !item.confirmed)
        ? `<p class="section-note">
      Ещё один пакет владелец пока не подтвердил — мы не публикуем его состав и цену.
      Уточнить можно в WhatsApp: <a href="${esc(settings.whatsappUrl)}" rel="noopener">${esc(settings.phone)}</a>.
    </p>`
        : ''
    }
  </div>
</section>`;
}

function catalogCard(item) {
  return `<article class="quest-card fx-beam" data-duration="${esc(item.durationLabel || '')}" id="${esc(item.id)}" data-fx="rise" data-fx-spot>
  <a class="quest-card-media" href="#${esc(item.id)}" aria-label="${esc(item.name)}">
    ${
      item.priceListImage
        ? `<img src="${esc(item.priceListImage)}" alt="${esc('Прайс-лист «' + item.name + '» в локации FANTOM')}" width="1000" height="1333" loading="lazy" decoding="async">`
        : `<span class="quest-card-blank">Фото программы</span>`
    }
    <span class="quest-card-badge">${esc(item.durationLabel || 'программа')}</span>
  </a>

  <div class="quest-card-body">
    <p class="quest-card-eyebrow">${esc(item.tagline)}</p>
    <h3>${esc(item.name)}</h3>

    <ul class="quest-card-meta">
      <li>${icon('clock2')}<span>${esc(item.durationLabel || '—')}</span></li>
      <li>${icon('mask')}<span>${esc(item.audienceLabel || '—')}</span></li>
      <li>${icon('star')}<span>${item.baseGuests ? esc(String(item.baseGuests)) + ' ' + plural(item.baseGuests, 'человек', 'человека', 'человек') + ' включено' : '—'}</span></li>
    </ul>

    <ul class="quest-card-list">
      ${item.includes.slice(0, 5).map((line) => `<li>${esc(line)}</li>`).join('')}
    </ul>
    ${
      item.includes.length > 5
        ? `<p class="quest-card-more">и ещё ${item.includes.length - 5} ${plural(item.includes.length - 5, 'пункт', 'пункта', 'пунктов')} в программе</p>`
        : ''
    }

    <p class="quest-card-price">
      <b>${item.priceLabel ? esc(item.priceLabel) : pending('цена уточняется')}</b>
      ${item.priceNote ? `<span>${esc(item.priceNote)}</span>` : ''}
    </p>

    <a class="btn btn-blood btn-block" href="/booking?package=${esc(item.id)}" data-cta="package">Выбрать время</a>
  </div>
</article>`;
}

/* ── ПЕРСОНАЖИ ──────────────────────────────────────────────────────────── */

function characters({ quest }) {
  return `<section class="section section--characters" id="characters">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Кто ждёт внутри',
      title: 'Внутри ждут не декорации',
      lead:
        'Игру ведут живые актёры. В сценарии их трое — и каждый работает по выбранному вами уровню страха.'
    })}

    <div class="characters">
      ${quest.characters
        .map(
          (character) => `<article class="character${character.image ? '' : ' character--noimage'}">
        ${
          character.image
            ? `<div class="character-media">
                <img src="${esc(character.image)}" alt="${esc(character.imageAlt)}" width="900" height="1600" loading="lazy" decoding="async">
              </div>`
            : `<div class="character-media character-media--empty"><span>Кадр персонажа</span></div>`
        }
        <div class="character-body">
          <span class="character-role">${esc(character.role === 'контакт' ? 'работает в контакте' : 'по сюжету')}</span>
          <h3>${esc(character.name)}</h3>
          <p>${esc(character.note)}</p>
        </div>
      </article>`
        )
        .join('')}
    </div>

    <div class="characters-note">
      <p>
        Состав, грим и детали ролей меняются от игры к игре — так задумано.
        Кадр третьего персонажа владелец ещё не передал, поэтому мы не подставляем чужое фото.
      </p>
      <p class="source-line">Подтверждено публикацией FANTOM: «В нашем квесте 3 персонажей — Самара, Монахиня и клоун Эдди».</p>
    </div>
  </div>
</section>`;
}

/* ── УРОВЕНЬ СТРАХА ─────────────────────────────────────────────────────── */

function fearScale({ quest }) {
  const modes = quest.modes.list;
  return `<section class="section section--fear" id="fear">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Уровень страха',
      title: 'Насколько жутко — решаете вы',
      lead:
        'У локации пять режимов: два детских, два средних и хард. Режим выбирается при записи, ' +
        'и администратор подтверждает его с командой до игры.'
    })}

    <ol class="fear-list" data-fear>
      ${modes
        .map(
          (mode, index) => `<li class="fear-item${mode.id === 'hard' ? ' fear-item--hard' : ''}" data-fear-item="${esc(mode.id)}">
        <span class="fear-num">${String(index + 1).padStart(2, '0')}</span>
        <div class="fear-body">
          <h3>${esc(mode.title)}</h3>
          <p>${esc(fearNote(mode.id))}</p>
        </div>
        <span class="fear-mark" aria-hidden="true"></span>
      </li>`
        )
        .join('')}
    </ol>

    <div class="fear-actions">
      <a class="btn btn-blood btn-xl" href="/booking">Забронировать с нужным режимом</a>
      <a class="btn btn-outline btn-xl" href="${esc(quest.modes.sourcePhoto)}" target="_blank" rel="noopener">Фото таблички режимов</a>
    </div>

    <p class="source-line">
      Табличка «Режимы игры» в локации. Возрастные границы для средних режимов владелец ещё не подтвердил —
      уточните у администратора до записи.
    </p>
  </div>
</section>`;
}

/** Пояснения к режимам: только то, что следует из названий на табличке. */
function fearNote(id) {
  if (id === 'kids-soft') return 'Без спецэффектов: атмосфера, декорации и сюжет. Подходит для первого знакомства с жанром.';
  if (id === 'kids-fx') return 'Со спецэффектами: свет, звук и работа актёров, но без жёсткого контакта.';
  if (id === 'mid-no-contact') return 'Актёры работают рядом, но не касаются игроков.';
  if (id === 'mid-contact') return 'Средний контакт: актёры могут разделить команду и взаимодействовать ближе.';
  if (id === 'hard') return 'Формат 18+ с полным контактом — для тех, кто уже был на хоррор-квестах.';
  return 'Режим игры.';
}

/* ── ИСТОРИЯ ────────────────────────────────────────────────────────────── */

function story({ content, quest }) {
  const story = content.story;
  const first = story.steps[0];
  const rest = story.steps.slice(1);

  return `<section class="section section--story" id="story">
  <div class="wrap">
    ${sectionHead({ eyebrow: story.eyebrow, title: story.title })}

    <div class="story-layout">
      <div class="story-lead">
        <p class="story-lead-num">${esc(first.num)}</p>
        <h3>${esc(first.title)}</h3>
        <p>${esc(first.text)}</p>
        ${first.source ? `<p class="source-line">${esc(first.source)}</p>` : ''}
        <p class="story-lead-meta">
          ${esc(quest.name)} · ${esc(String(quest.durationMinutes))} минут ·
          ${esc(String(quest.characters.length))} ${plural(quest.characters.length, 'персонаж', 'персонажа', 'персонажей')}
        </p>
      </div>

      <ol class="story-steps">
        ${rest
          .map(
            (step) => `<li class="story-step" data-reveal>
          <span class="story-num">${esc(step.num)}</span>
          <div>
            <h3>${esc(step.title)}</h3>
            <p>${esc(step.text)}</p>
            ${step.source ? `<p class="source-line">${esc(step.source)}</p>` : ''}
          </div>
        </li>`
          )
          .join('')}
      </ol>
    </div>

    <div class="story-actions">
      <a class="btn btn-blood btn-xl" href="/booking">Забронировать квест</a>
      <a class="btn btn-outline btn-xl" href="/quests">Все программы</a>
    </div>
  </div>
</section>`;
}

/* ── АТМОСФЕРА ──────────────────────────────────────────────────────────── */

function features({ content }) {
  return `<section class="section section--features" id="features">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Что внутри',
      title: 'Ты не просто решаешь загадки',
      lead:
        'Это не комната с замками. Каждый пункт ниже подтверждён источниками: вывеской, прайс-листом или публикацией FANTOM.'
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

function gallery({ gallery, settings, location, withViewer = true, limit = 0 }) {
  const items = limit ? gallery.slice(0, limit) : gallery;
  return `<section class="section section--gallery" id="gallery">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Изнутри',
      title: 'Кадры, снятые внутри',
      lead:
        'Фотографии локации, актёров и гостей из галереи FANTOM в 2ГИС. Нажмите на кадр — откроется на весь экран.'
    })}
  </div>

  <div class="gallery-strip" data-gallery>
    ${items
      .map(
        (item, index) => `<figure class="gallery-item" data-slot="${index % 7}" data-fx="fade">
      <button class="gallery-button" type="button" data-gallery-open="${index}"
              aria-label="Открыть фото: ${esc(item.caption)}">
        <img src="${esc(item.thumb)}" alt="${esc(item.alt)}" width="1000" height="1250"
             loading="lazy" decoding="async">
      </button>
      <figcaption class="gallery-caption">
        <b>${esc(item.caption)}</b>
        <small>${esc(item.author)}</small>
      </figcaption>
    </figure>`
      )
      .join('')}
  </div>

  <div class="wrap gallery-foot">
    <p class="gallery-hint">Свайп или прокрутка — ещё ${Math.max(items.length - 3, 0)} ${plural(Math.max(items.length - 3, 0), 'кадр', 'кадра', 'кадров')}</p>
    <div class="gallery-actions">
      <a class="btn btn-outline" href="/gallery">Вся галерея</a>
      <a class="btn btn-ghost" href="${esc(location ? location.galleryUrl : settings.rating.sourceUrl)}" rel="noopener" target="_blank">
        Все ${esc(String(settings.rating.photosCount))} фото в ${esc(settings.rating.sourceLabel)}
      </a>
    </div>
  </div>

  ${
    withViewer
      ? `<div class="lightbox" data-lightbox hidden role="dialog" aria-modal="true" aria-label="Просмотр фотографии">
    <button class="lightbox-close" type="button" data-lightbox-close aria-label="Закрыть">×</button>
    <button class="lightbox-nav lightbox-nav--prev" type="button" data-lightbox-prev aria-label="Предыдущее фото">‹</button>
    <figure class="lightbox-figure"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-lightbox-image><figcaption data-lightbox-caption></figcaption></figure>
    <button class="lightbox-nav lightbox-nav--next" type="button" data-lightbox-next aria-label="Следующее фото">›</button>
  </div>`
      : ''
  }
  <script type="application/json" data-gallery-data>${JSON.stringify(
    items.map((item) => ({ src: item.src, caption: item.caption, author: item.author, alt: item.alt }))
  ).replace(/</g, '\\u003c')}</script>
</section>`;
}

/* ── INSTAGRAM ──────────────────────────────────────────────────────────── */

function instagram({ settings, gallery }) {
  const shots = gallery.slice(0, 4);
  return `<section class="section section--instagram">
  <div class="wrap instagram-layout">
    <div class="instagram-copy">
      ${sectionHead({
        eyebrow: 'Instagram',
        title: 'Больше FANTOM',
        lead:
          'Реальные кадры из локации, реакции команд и объявления о ночных играх — в аккаунте площадки.'
      })}
      <ul class="instagram-facts">
        <li>${esc(settings.instagramHandle)} — основной аккаунт локации</li>
        <li>${esc(settings.instagramGisHandle)} — аккаунт, на который ссылается карточка 2ГИС</li>
        <li>Видео моменты с квеста входят в пакеты, Reels можно заказать отдельно</li>
      </ul>
      <a class="btn btn-blood btn-xl" href="${esc(settings.instagramUrl)}" rel="noopener" target="_blank" data-cta="instagram">
        Открыть Instagram
      </a>
    </div>
    <div class="instagram-grid">
      ${shots
        .map(
          (item) => `<a class="instagram-shot" href="${esc(settings.instagramUrl)}" rel="noopener" target="_blank" aria-label="${esc(item.caption)}">
        <img src="${esc(item.thumb)}" alt="${esc(item.alt)}" width="480" height="600" loading="lazy" decoding="async">
      </a>`
        )
        .join('')}
    </div>
  </div>
</section>`;
}

/* ── ПРОВЕРЯЕМЫЕ ЦИФРЫ ──────────────────────────────────────────────────── */

function numbers({ settings, quest, packages, location }) {
  const confirmedPackages = packages.filter((item) => item.confirmed).length;
  const sources = settings.sources || [];
  return `<section class="section section--numbers" id="numbers">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Проверяемые цифры',
      title: 'Ни одной цифры «из головы»',
      lead:
        'Всё, что есть на этой странице, можно проверить по ссылкам ниже. Мы намеренно не показываем счётчики вроде «10 000 игроков» и не запускаем таймеры — страх должен быть в локации, а не в интерфейсе.'
    })}

    <ul class="numbers">
      <li data-fx="rise"><b class="fx-dot">${esc(String(settings.rating.reviewsCount))}</b><span>${plural(settings.rating.reviewsCount, 'отзыв', 'отзыва', 'отзывов')} в ${esc(settings.rating.sourceLabel)}</span></li>
      <li data-fx="rise"><b class="fx-dot">${esc(String(settings.rating.photosCount))}</b><span>фото локации</span></li>
      <li data-fx="rise"><b class="fx-dot">${esc(String(quest.durationMinutes))}</b><span>${plural(quest.durationMinutes, 'минута', 'минуты', 'минут')} длится квест</span></li>
      <li data-fx="rise"><b class="fx-dot">${esc(String(quest.characters.length))}</b><span>${plural(quest.characters.length, 'персонаж', 'персонажа', 'персонажей')} в сценарии</span></li>
      <li data-fx="rise"><b class="fx-dot">${esc(String(quest.modes.list.length))}</b><span>${plural(quest.modes.list.length, 'режим', 'режима', 'режимов')} страха</span></li>
      <li data-fx="rise"><b class="fx-dot">${esc(String(confirmedPackages))}</b><span>${plural(confirmedPackages, 'программа', 'программы', 'программ')} с ценой</span></li>
    </ul>

    <div class="numbers-sources">
      <p class="numbers-sources-title">Источники</p>
      <ul>
        ${sources
          .map(
            (source) =>
              `<li><a href="${esc(source.url)}" rel="noopener" target="_blank">${esc(source.label)}</a><span>${esc(source.note || '')}</span></li>`
          )
          .join('')}
      </ul>
      <p class="source-line">
        Локация: ${esc(location.fullAddress)}. Данные собраны ${esc(settings.rating.updatedAt)}.
      </p>
    </div>
  </div>
</section>`;
}

/* ── ОТЗЫВЫ ─────────────────────────────────────────────────────────────── */

function reviews({ settings, reviews, limit = 6 }) {
  const list = limit ? reviews.slice(0, limit) : reviews;
  const r = settings.rating;
  return `<section class="section section--reviews" id="reviews">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Отзывы',
      title: 'Что говорят после игры',
      lead:
        'Отзывы приведены дословно: имя, дата, оценка и текст — как в ' + r.sourceLabel +
        '. Ответы организации тоже настоящие.'
    })}

    <div class="rating-row">
      <div class="rating-big">
        <b>${esc(String(r.value).replace('.', ','))}</b>
        <span class="rating-scale">из 5</span>
        <span class="trust-stars" aria-hidden="true">★★★★★</span>
      </div>
      <ul class="rating-facts">
        <li><b>${esc(String(r.reviewsCount))}</b><span>${plural(r.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}</span></li>
        <li><b>${esc(String(r.ratingsCount))}</b><span>${plural(r.ratingsCount, 'оценка', 'оценки', 'оценок')}</span></li>
        <li><b>${esc(String(r.photosCount))}</b><span>фото</span></li>
        <li><b>${esc(String(r.photosWithReviewsCount))}</b><span>${plural(r.photosWithReviewsCount, 'отзыв', 'отзыва', 'отзывов')} с фото</span></li>
      </ul>
      <a class="btn btn-outline" href="${esc(r.sourceUrl)}" rel="noopener nofollow" target="_blank" data-cta="reviews">
        Смотреть все отзывы
      </a>
    </div>

    <div class="review-grid">
      ${list.map((review) => reviewCard(review)).join('')}
    </div>

    <p class="source-line">
      Подборка составлена по прочитанным отзывам, а не по нашей оценке. Мы не публикуем отзывы без источника.
    </p>
  </div>
</section>`;
}

function reviewCard(review) {
  return `<article class="review" data-fx="rise">
  <header class="review-head">
    <b class="review-author">${esc(review.author)}</b>
    <span class="review-rating" aria-label="Оценка ${review.rating} из 5">${'★'.repeat(review.rating || 5)}</span>
  </header>
  <p class="review-text">${esc(review.text)}</p>
  ${
    review.answer
      ? `<div class="review-answer"><b>Ответ FANTOM</b><p>${esc(review.answer)}</p></div>`
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

/* ── КАК ЭТО ПРОИСХОДИТ ─────────────────────────────────────────────────── */

function howItWorks({ content, quest, settings }) {
  const steps = [
    { num: '01', title: 'Выбираете программу', text: 'Просто квест с кинорумом или полная программа с фильмом, пиццей и бургерами.', time: '2 минуты' },
    { num: '02', title: 'Выбираете дату и время', text: `Свободные слоты видны сразу. Работаем ${settings.hours.label.toLowerCase()} — есть ночные сеансы.`, time: '1 минута' },
    { num: '03', title: 'Оставляете контакты', text: 'Имя и телефон. Регистрация не нужна, оплата на сайте не проводится.', time: '30 секунд' },
    { num: '04', title: 'Приходите на Назарбаева, 50', text: 'Вход с улицы: белая кирпичная стена и чёрная вывеска QUEST ROOM FANTOM. Мы на цокольном этаже.', time: 'за 15 минут' },
    { num: '05', title: 'Пытаетесь выйти', text: `${quest.durationMinutes} минут внутри сюжета: задания, актёры и выбранный вами режим страха.`, time: `${quest.durationMinutes} минут` }
  ];

  return `<section class="section section--how" id="how">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Как это работает',
      title: 'Пять шагов — и вы внутри',
      lead: 'Ничего не нужно приносить, знать заранее или готовить.'
    })}
    <ol class="how-list">
      ${steps
        .map(
          (step, index) => `<li class="how-step" data-reveal>
        <span class="how-num">${esc(step.num)}</span>
        <h3>${esc(step.title)}</h3>
        <p>${esc(step.text)}</p>
        <span class="how-time">${esc(step.time)}</span>
        ${index === steps.length - 1 ? '<span class="how-final" aria-hidden="true">дверь закрывается</span>' : ''}
      </li>`
        )
        .join('')}
    </ol>
    <div class="how-actions">
      <a class="btn btn-blood btn-xl" href="/booking">Забронировать</a>
    </div>
  </div>
</section>`;
}

/* ── ПЕРЕД ИГРОЙ ────────────────────────────────────────────────────────── */

function beforeYouGo({ settings, location, quest }) {
  const items = [
    {
      title: 'Режим и уровень страха',
      text:
        'Пять режимов: два детских, два средних и хард 18+. Выбираете при записи — администратор подтвердит его с командой до игры.'
    },
    {
      title: 'Как найти вход',
      text: location.entranceNote
    },
    {
      title: 'График и ночные сеансы',
      text: `Работаем ${settings.hours.label.toLowerCase()}. Сеансы после полуночи относятся к предыдущему игровому дню — администратор подскажет точное время.`
    },
    {
      title: 'Оплата',
      text: `На месте: ${settings.payments.methods.join(', ').toLowerCase()}. Сайт не принимает платежи и не запрашивает данные карты.`
    },
    {
      title: 'Дети и взрослые',
      text:
        'Есть два детских режима — со спецэффектами и без. Для взрослых — средние режимы и хард 18+. Точные возрастные границы для средних режимов уточняйте у администратора.'
    }
  ];

  return `<section class="section section--before" id="before">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Перед игрой',
      title: 'Что нужно знать заранее',
      lead: 'Пять пунктов без кликов — всё, о чём чаще всего спрашивают перед первой игрой.'
    })}
    <ul class="before-list">
      ${items
        .map(
          (item) => `<li class="before-item" data-reveal>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.text)}</p>
      </li>`
        )
        .join('')}
      <li class="before-item before-item--ask">
        <h3>Остались вопросы</h3>
        <p>Стоп-слово, противопоказания, парковку и перенос брони подтвердит администратор — напишите или позвоните.</p>
        <div class="before-actions">
          <a class="btn btn-outline" href="${esc(settings.whatsappUrl)}" rel="noopener" data-cta="whatsapp">Написать в WhatsApp</a>
          <a class="btn btn-ghost" href="tel:${esc(settings.phoneE164)}" data-cta="phone">${esc(settings.phone)}</a>
        </div>
      </li>
    </ul>
  </div>
</section>`;
}

/* ── МАСТЕР ЗАПИСИ ──────────────────────────────────────────────────────── */

/**
 * Запись: шесть шагов вместо трёх — пакет, дата, время, гости, контакты,
 * подтверждение. Все решения видны в сводке, сервер всё перепроверяет.
 */
function bookingWizard({ settings, packages, days, quest, initialPackage, initialDate, preselectedSlot }) {
  const bookable = packages.filter((item) => item.confirmed);

  /*
   * Стартовое число гостей берётся из программы, на которую пришёл посетитель,
   * иначе — из основной программы. Раньше в форме стояло жёсткое «4» при цене
   * «2 человека — 17 500 ₸»: сводка противоречила сама себе и это выглядело как
   * ошибка расчёта. Ровно то, на что указал аудит.
   */
  const initialProgram =
    bookable.filter((item) => item.id === initialPackage)[0] ||
    bookable.filter((item) => item.primary)[0] ||
    bookable[0] ||
    null;
  const baseGuests = (initialProgram && initialProgram.baseGuests) || 4;

  return `<div class="booking-layout">
  <form class="wizard" id="booking-form" novalidate
        data-initial-package="${esc(initialPackage || '')}"
        data-initial-date="${esc(initialDate || '')}"
        data-initial-slot="${esc(preselectedSlot || '')}"
        data-whatsapp="${esc(settings.whatsappUrl)}"
        data-phone="${esc(settings.phone)}">

    <ol class="wizard-progress" data-progress>
      ${['Пакет', 'Дата', 'Время', 'Гости', 'Контакты', 'Проверка']
        .map(
          (label, index) =>
            `<li class="${index === 0 ? 'is-active' : ''}" data-progress-step="${index + 1}"><span>${index + 1}</span>${esc(label)}</li>`
        )
        .join('')}
    </ol>

    <fieldset class="fx-corners fx-corners--hot wizard-step is-active" data-step="1">
      <legend class="wizard-legend">Шаг 1 из 6. Выберите программу</legend>
      <div class="package-picker" role="radiogroup" aria-label="Программа">
        ${bookable
          .map(
            (item) => `<button class="package-option" type="button" role="radio"
              aria-checked="${item.id === initialPackage ? 'true' : 'false'}"
              data-package="${esc(item.id)}"
              data-package-name="${esc(item.name)}"
              data-package-duration="${esc(item.durationLabel || '')}"
              data-package-price="${esc(item.priceLabel || '')}"
              data-package-guests="${esc(String(item.baseGuests || ''))}"
              data-package-note="${esc(item.priceNote || '')}">
          <span class="package-option-name">${esc(item.name)}</span>
          <span class="package-option-price">${item.priceLabel ? esc(item.priceLabel) : pending('уточняется')}</span>
          <span class="package-option-meta">${esc(item.durationLabel || '')}${item.durationLabel && item.audienceLabel ? ' · ' : ''}${esc(item.audienceLabel || '')}</span>
        </button>`
          )
          .join('')}
      </div>
      <input type="hidden" name="packageId" id="packageId" value="${esc(initialPackage || '')}">
      <div class="wizard-nav">
        <a class="btn btn-ghost" href="${esc(settings.whatsappUrl)}" rel="noopener">Не уверен — спросить</a>
        <button class="btn btn-blood" type="button" data-next="2">Дальше: дата</button>
      </div>
    </fieldset>

    <fieldset class="fx-corners fx-corners--hot wizard-step" data-step="2">
      <legend class="wizard-legend">Шаг 2 из 6. Выберите дату</legend>
      <div class="date-strip" data-date-strip role="radiogroup" aria-label="Игровой день">
        ${days
          .slice(0, 21)
          .map(
            (day, index) => `<button class="date-chip${day.businessDate === initialDate ? ' is-active' : ''}" type="button"
          role="radio" aria-checked="${day.businessDate === initialDate ? 'true' : 'false'}"
          data-date="${esc(day.businessDate)}" data-date-label="${esc(day.label)}">
          <span class="date-chip-day">${esc(dayLabelShort(day, index))}</span>
          <span class="date-chip-num">${esc(dayNumber(day))}</span>
          <span class="date-chip-week">${esc(day.weekday)}</span>
          <span class="date-chip-count">${day.availableCount ? day.availableCount + ' св.' : 'нет'}</span>
        </button>`
          )
          .join('')}
      </div>
      <input type="hidden" name="date" id="date" value="${esc(initialDate || '')}">
      <div class="wizard-nav">
        <button class="btn btn-ghost" type="button" data-back="1">Назад</button>
        <button class="btn btn-blood" type="button" data-next="3" data-requires-date>Дальше: время</button>
      </div>
    </fieldset>

    <fieldset class="fx-corners fx-corners--hot wizard-step" data-step="3">
      <legend class="wizard-legend">Шаг 3 из 6. Выберите время</legend>
      <p class="wizard-hint" data-slot-day></p>
      <div class="slot-picker" role="radiogroup" aria-label="Свободное время" data-slot-picker>
        <p class="slot-hint">Загружаем свободные слоты…</p>
      </div>
      <p class="field-hint" data-slot-status aria-live="polite"></p>
      <input type="hidden" name="time" id="time" required>
      <div class="wizard-nav">
        <button class="btn btn-ghost" type="button" data-back="2">Назад</button>
        <button class="btn btn-blood" type="button" data-next="4" data-requires-slot>Дальше: гости</button>
      </div>
    </fieldset>

    <fieldset class="fx-corners fx-corners--hot wizard-step" data-step="4">
      <legend class="wizard-legend">Шаг 4 из 6. Сколько вас будет</legend>
      <div class="stepper" role="group" aria-label="Количество игроков">
        <button class="stepper-btn" type="button" data-guests-minus aria-label="Меньше">−</button>
        <span class="stepper-value" data-guests-value aria-live="polite">${esc(String(baseGuests))}</span>
        <button class="stepper-btn" type="button" data-guests-plus aria-label="Больше">+</button>
      </div>
      <input type="hidden" name="guests" id="guests" value="${esc(String(baseGuests))}">
      <p class="wizard-hint" data-guests-hint>
        В стоимость выбранной программы включено ${esc(String(baseGuests))}
        ${plural(baseGuests, 'человек', 'человека', 'человек')}. Число игроков можно менять: доплата за
        каждого следующего указана в карточке программы и в прайс-листе локации.
      </p>
      <div class="wizard-nav">
        <button class="btn btn-ghost" type="button" data-back="3">Назад</button>
        <button class="btn btn-blood" type="button" data-next="5">Дальше: контакты</button>
      </div>
    </fieldset>

    <fieldset class="fx-corners fx-corners--hot wizard-step" data-step="5">
      <legend class="wizard-legend">Шаг 5 из 6. Контакты</legend>
      <div class="field">
        <label for="name">Имя</label>
        <input id="name" name="name" type="text" autocomplete="name" maxlength="80" required aria-required="true" aria-describedby="name-hint">
        <p class="field-hint" id="name-hint">Как к вам обращаться при подтверждении.</p>
      </div>
      <div class="field">
        <label for="phone">Телефон</label>
        <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required
               aria-required="true" placeholder="+7 700 000 00 00" aria-describedby="phone-hint">
        <p class="field-hint" id="phone-hint">Формат Казахстана. Вставить номер можно — пробелы расставим сами.</p>
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
      <div class="wizard-nav">
        <button class="btn btn-ghost" type="button" data-back="4">Назад</button>
        <button class="btn btn-blood" type="button" data-next="6" data-requires-contacts>Дальше: проверить</button>
      </div>
    </fieldset>

    <fieldset class="fx-corners fx-corners--hot wizard-step" data-step="6">
      <legend class="wizard-legend">Шаг 6 из 6. Проверьте и подтвердите</legend>
      <dl class="confirm-list" data-confirm></dl>
      <p class="wizard-error" data-form-error role="alert" aria-live="assertive" hidden></p>
      <div class="wizard-nav">
        <button class="btn btn-ghost" type="button" data-back="5">Назад</button>
        <button class="btn btn-blood btn-xl" type="submit" data-submit>Забронировать</button>
      </div>
      <p class="wizard-hint">
        Кнопка отправляет заявку, а не оплату: сайт не принимает платежи. Администратор подтвердит время.
      </p>
    </fieldset>
  </form>

  <aside class="wizard-summary" aria-live="polite">
    <div class="summary-card fx-corners">
      <p class="summary-title">Ваша бронь</p>
      <ul class="summary-list">
        <li><span>Программа</span><b data-summary-package>—</b></li>
        <li><span>Длительность</span><b data-summary-duration>—</b></li>
        <li><span>Дата</span><b data-summary-date>—</b></li>
        <li><span>Время</span><b data-summary-time>—</b></li>
        <li><span>Гостей</span><b data-summary-guests>—</b></li>
        <li><span>Цена</span><b data-summary-price class="pending-value">—</b></li>
      </ul>
      <p class="summary-price-note" data-summary-note hidden></p>
      <p class="summary-note">
        Адрес: ${esc(settings.brand.displayName)}, ${esc(settings.city)}. Оплата на месте:
        ${esc(settings.payments.methods.join(', ').toLowerCase())}.
      </p>
    </div>
  </aside>
</div>`;
}

function dayLabelShort(day, index) {
  if (index === 0) return 'Сегодня';
  if (index === 1) return 'Завтра';
  return day.weekday;
}

function dayNumber(day) {
  return String(Number(day.businessDate.slice(-2)));
}

function bookingSuccess({ settings }) {
  return `<section class="success" data-success hidden tabindex="-1" role="status">
  <p class="success-kicker">Ты внутри</p>
  <h2 class="success-title">Бронь принята</h2>
  <ul class="summary-list">
    <li><span>Номер</span><b data-success-ref>—</b></li>
    <li><span>Программа</span><b data-success-package>—</b></li>
    <li><span>Дата</span><b data-success-date>—</b></li>
    <li><span>Время</span><b data-success-time>—</b></li>
    <li><span>Гостей</span><b data-success-guests>—</b></li>
  </ul>
  <p class="success-note" data-success-note></p>
  <div class="success-actions">
    <a class="btn btn-blood" data-success-whatsapp href="${esc(settings.whatsappUrl)}" rel="noopener">Написать в WhatsApp</a>
    <a class="btn btn-outline" href="tel:${esc(settings.phoneE164)}">${esc(settings.phone)}</a>
  </div>
  <p class="success-address">
    ${esc(settings.city)}, вход с улицы: белая кирпичная стена и чёрная вывеска QUEST ROOM FANTOM.
  </p>
</section>`;
}

/* ── ЛОКАЦИЯ ────────────────────────────────────────────────────────────── */

function locationSection({ settings, location }) {
  return `<section class="section section--location" id="location">
  <div class="wrap location-grid">
    <div>
      ${sectionHead({ eyebrow: 'Как добраться', title: 'Подвал на Назарбаева, 50' })}
      <ul class="location-list">
        <li><span>Адрес</span><b>${esc(location.fullAddress)}</b></li>
        <li><span>Этаж</span><b>${esc(location.floor)}</b></li>
        <li><span>Как найти вход</span><b>${esc(location.entranceNote)}</b></li>
        <li><span>График</span><b>${esc(settings.hours.label)}</b></li>
        <li><span>Телефон</span><b><a href="tel:${esc(settings.phoneE164)}" data-cta="phone">${esc(settings.phone)}</a></b></li>
        <li><span>Instagram</span><b><a href="${esc(settings.instagramUrl)}" rel="noopener" data-cta="instagram">${esc(settings.instagramHandle)}</a></b></li>
        <li><span>Оплата</span><b>${settings.payments.methods.map((method) => esc(method)).join(', ')}</b></li>
      </ul>
      <div class="location-actions">
        <a class="btn btn-blood" href="${esc(location.routeUrl)}" rel="noopener" data-cta="route">Построить маршрут</a>
        <a class="btn btn-outline" href="/contacts">Контакты</a>
      </div>
    </div>
    <div class="location-media">
      <a class="location-photo" href="${esc(location.galleryUrl)}" rel="noopener" target="_blank">
        <img src="/images/gallery/entrance-street-1000.webp" alt="Вход в локацию FANTOM: белая кирпичная стена с чёрной вывеской QUEST ROOM FANTOM"
             width="1000" height="750" loading="lazy" decoding="async">
        <span>Вход с улицы</span>
      </a>
      <div class="location-plan" aria-hidden="true">
        <span class="location-plan-step">Здание</span>
        <span class="location-plan-arrow">→</span>
        <span class="location-plan-step">Чёрная вывеска</span>
        <span class="location-plan-arrow">→</span>
        <span class="location-plan-step">Спуск в цоколь</span>
      </div>
      <p class="source-line">Координаты: ${esc(String(location.lat))}, ${esc(String(location.lng))} · фото входа из отзывов ${esc(settings.rating.sourceLabel)}</p>
    </div>
  </div>
</section>`;
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */

function faqItem(item, index) {
  const published = item.status === 'published' && item.answer;
  return `<details class="faq"${index === 0 ? ' open' : ''} data-fx="rise">
  <summary>
    <span class="faq-index">${String(index + 1).padStart(2, '0')}</span>
    <span class="faq-question">${esc(item.question)}</span>
    ${published ? '' : pending('Уточняется', 'Ответ появится после подтверждения владельцем')}
  </summary>
  <div class="faq-answer">
    ${
      published
        ? `<p>${esc(item.answer)}</p>`
        : `<p class="faq-pending">Уточните у администратора: <a href="#booking">форма записи</a> или WhatsApp.</p>`
    }
  </div>
</details>`;
}

function faq({ faq: items, limit = 0, title = 'Отвечаем прямо', lead }) {
  const published = items.filter((item) => item.status === 'published');
  const others = items.filter((item) => item.status !== 'published');
  const list = limit ? [...published, ...others].slice(0, limit) : [...published, ...others];
  return `<section class="section section--faq" id="faq">
  <div class="wrap">
    ${sectionHead({
      eyebrow: 'Вопросы',
      title,
      lead: lead || 'Собрали то, что чаще всего спрашивают перед первой игрой. Ответы, которых у нас нет, мы не придумываем — их подтвердит владелец.'
    })}
    <div class="faq-list">${list.map((item, index) => faqItem(item, index)).join('')}</div>
  </div>
</section>`;
}

/* ── ФИНАЛЬНЫЙ CTA ──────────────────────────────────────────────────────── */

function finalCta({ settings, content, location }) {
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
      <a class="btn btn-blood btn-xl fx-beam" href="/booking" data-cta="final" data-fx-magnetic>Забронировать квест</a>
      <a class="btn btn-outline btn-xl" href="tel:${esc(settings.phoneE164)}" data-cta="phone">${esc(settings.phone)}</a>
    </div>
    <p class="final-note">Заявка бесплатная. Администратор подтвердит время в WhatsApp — и всё.</p>
    <p class="final-address">${esc(location.fullAddress)} · ${esc(settings.hours.label)}</p>
  </div>
</section>`;
}

module.exports = {
  money,
  plural,
  sectionHead,
  pageHead,
  pending,
  sourceTag,
  icon,
  hero,
  marquee,
  trust,
  slotsBoard,
  catalog,
  catalogCard,
  characters,
  fearScale,
  story,
  features,
  gallery,
  instagram,
  numbers,
  reviews,
  reviewCard,
  howItWorks,
  beforeYouGo,
  bookingWizard,
  bookingSuccess,
  locationSection,
  faq,
  faqItem,
  finalCta,
  formatRuDate
};
