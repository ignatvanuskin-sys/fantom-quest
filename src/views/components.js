'use strict';

const { esc } = require('../lib/validate');
const time = require('../lib/time');

/** Рейтинг всегда с одним знаком после запятой: 5 → «5,0». */
function ratingValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(1).replace('.', ',');
}

function sectionHead({ eyebrow, title, text, id }) {
  return `<div class="section-head">
  ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
  <h2${id ? ` id="${esc(id)}"` : ''}>${esc(title)}</h2>
  ${text ? `<p class="section-text">${esc(text)}</p>` : ''}
</div>`;
}

/** Пометка «нужно подтвердить» — обязательна для всех непроверенных значений. */
function unconfirmed(label = 'Уточняется', note) {
  return `<span class="badge badge-unconfirmed" title="${esc(
    note || 'Данные должен подтвердить владелец перед публикацией'
  )}">${esc(label)}</span>`;
}

function sourceLink(label, url, checkedAt) {
  if (!url) return '';
  return `<a class="source-link" href="${esc(url)}" rel="noopener nofollow" target="_blank">${esc(label)}${
    checkedAt ? ` · проверено ${esc(checkedAt)}` : ''
  }</a>`;
}

/** CCTV/timecode-полоса: атмосфера, без блокировки контента. */
function cctvStrip(settings) {
  const cam = 'CAM-04';
  return `<div class="cctv" aria-hidden="true">
  <span class="cctv-rec"><i></i>REC</span>
  <span class="cctv-cam">${cam} · ${esc(settings.brand.displayName.toUpperCase())} BASEMENT</span>
  <span class="cctv-code" data-timecode>--:--:--:--</span>
</div>`;
}

function proofStrip(settings, location) {
  const r = settings.rating;
  return `<section class="proof-strip" aria-label="Проверенные данные">
  <div class="wrap proof-grid">
    <div class="proof">
      <b>${esc(ratingValue(r.value))}</b>
      <small>рейтинг ${esc(r.sourceLabel)} · ${esc(String(r.reviewsCount))} оценки</small>
      <a class="proof-source" href="${esc(r.sourceUrl)}" rel="noopener nofollow" target="_blank">Источник</a>
    </div>
    <div class="proof">
      <b>${esc(String(r.testimonialsCount))}</b>
      <small>отзыва в разделе отзывов ${esc(r.sourceLabel)}</small>
    </div>
    <div class="proof">
      <b>60 мин</b>
      <small>длительность игры</small>
    </div>
    <div class="proof">
      <b>09:00–02:00</b>
      <small>ежедневно, включая ночные слоты</small>
    </div>
    <div class="proof">
      <b>250 м</b>
      <small>от парка «Металлургов», ~3 минуты</small>
    </div>
  </div>
  <p class="proof-updated">Рейтинг и количество отзывов — динамические данные ${esc(
    r.sourceLabel
  )}, обновлено ${esc(r.updatedAt)}. Обновляются через админку, не зашиты в код.</p>
</section>`;
}

function questCard(quest, options = {}) {
  const location = options.location;
  const nextSlot = options.nextSlot;
  const href = `/quests/${quest.slug}`;

  if (quest.isPlaceholder) {
    return `<article class="quest-card quest-card--placeholder">
    <div class="quest-media placeholder-media">
      <span class="placeholder-label">Фото нужно добавить</span>
      <span class="placeholder-hint">Слот под реальный кадр. Стоковый хоррор не используем.</span>
    </div>
    <div class="quest-body">
      <p class="quest-genre">Каталог ${esc(quest.brandLabel || '')}</p>
      <h3>${esc(quest.name)}</h3>
      <p>${esc(quest.shortDescription || '')}</p>
      <ul class="quest-facts">
        <li><span>Жанр</span>${unconfirmed('Нужно подтвердить')}</li>
        <li><span>Длительность</span>${unconfirmed('Нужно подтвердить')}</li>
        <li><span>Цена</span>${unconfirmed('Нужно подтвердить')}</li>
      </ul>
      <p class="quest-note">${esc(quest.ownerAction || 'Нужны данные от владельца.')}</p>
      <button class="btn btn-disabled" type="button" disabled>Запись недоступна</button>
    </div>
  </article>`;
  }

  const facts = [
    { label: 'Жанр', value: quest.genre, confirmed: true },
    { label: 'Длительность', value: quest.durationConfirmed ? `${quest.durationMinutes} минут` : null },
    { label: 'Возраст', value: quest.ageLimit, confirmed: quest.ageConfirmed },
    {
      label: 'Состав команды',
      value:
        quest.teamSizeConfirmed && quest.minGuests && quest.maxGuests
          ? `${quest.minGuests}–${quest.maxGuests} человек`
          : null
    },
    { label: 'Интенсивность', value: quest.intensity, confirmed: quest.intensityConfirmed },
    { label: 'Цена', value: quest.priceFrom ? `от ${quest.priceFrom} ₸` : null, confirmed: quest.priceConfirmed }
  ];

  return `<article class="quest-card">
    <a class="quest-media" href="${esc(href)}" aria-label="${esc(quest.name)} — подробнее">
      <span class="placeholder-label">Фото нужно добавить</span>
      <span class="placeholder-hint">Реальный кадр локации</span>
    </a>
    <div class="quest-body">
      <p class="quest-genre">${esc(quest.brandLabel)} · ${esc(quest.genre || '')}</p>
      <h3><a href="${esc(href)}">${esc(quest.name)}</a></h3>
      <p>${esc(quest.shortDescription)}</p>
      <ul class="quest-facts">
        ${facts
          .map(
            (fact) => `<li><span>${esc(fact.label)}</span>${
              fact.value ? esc(fact.value) : unconfirmed('Уточняется')
            }</li>`
          )
          .join('')}
      </ul>
      ${
        location
          ? `<p class="quest-location">${esc(location.streetAddress)}, ${esc(location.floor)} · ${esc(
              location.landmark
            )}</p>`
          : ''
      }
      ${
        nextSlot
          ? `<p class="quest-slot">Ближайший свободный слот: <b>${esc(nextSlot.humanLabel)}</b></p>`
          : `<p class="quest-slot">Свободные слоты на ближайшие дни — в форме записи.</p>`
      }
      <div class="quest-actions">
        <a class="btn btn-primary" href="/booking?quest=${esc(quest.slug)}${
        nextSlot ? `&date=${esc(nextSlot.businessDate)}` : ''
      }">Забронировать</a>
        <a class="btn btn-ghost" href="${esc(href)}">Подробнее</a>
      </div>
    </div>
  </article>`;
}

function reviewCard(review) {
  if (!review.verified || !review.text) {
    return `<article class="review-card review-card--pending">
      <div class="review-head">
        <span class="badge badge-unconfirmed">Нужно подтвердить</span>
        <span class="review-source">${esc(review.sourceLabel || 'Источник')}</span>
      </div>
      <p class="review-text review-text--placeholder">${esc(review.placeholder || 'Место для реального отзыва.')}</p>
      ${
        review.sourceUrl
          ? `<a class="source-link" href="${esc(review.sourceUrl)}" rel="noopener nofollow" target="_blank">Открыть источник отзывов</a>`
          : ''
      }
    </article>`;
  }
  return `<article class="review-card">
    <div class="review-head">
      <span class="review-author">${esc(review.author || 'Гость Fantom')}</span>
      ${review.rating ? `<span class="review-rating">${esc(String(review.rating))}/5</span>` : ''}
    </div>
    <p class="review-text">${esc(review.text)}</p>
    <p class="review-meta">${esc(review.sourceLabel || '')}${
    review.publishedAt ? ` · ${esc(time.formatDateRu(review.publishedAt))}` : ''
  }</p>
  </article>`;
}

function faqItem(item, index) {
  const published = item.status === 'published' && item.answer;
  const open = index === 0 ? ' open' : '';
  return `<details class="faq-item"${open}>
  <summary>
    <span class="faq-q">${esc(item.question)}</span>
    ${published ? '' : unconfirmed('Нужно подтвердить')}
  </summary>
  <div class="faq-a">
    ${
      published
        ? `<p>${esc(item.answer)}</p>`
        : `<p class="faq-pending">${esc(
            item.placeholder || 'Ответ появится после подтверждения владельцем.'
          )}</p>`
    }
    ${
      item.source
        ? `<p class="faq-source">Источник: ${esc(
            item.source === 'src-2gis' ? 'карточка 2ГИС' : 'Instagram @_fantom_uka_'
          )}</p>`
        : ''
    }
  </div>
</details>`;
}

function bookingCta(settings, options = {}) {
  const variant = options.variant || 'primary';
  const quest = options.quest;
  const href = quest ? `/booking?quest=${esc(quest.slug)}` : '/booking';
  return `<div class="cta-row">
  <a class="btn btn-${variant === 'primary' ? 'primary' : 'ghost'}" href="${esc(href)}">Выбрать дату и время</a>
  <a class="btn btn-wa" href="${esc(settings.whatsappUrl)}" rel="noopener">${
    options.waLabel || 'Спросить в WhatsApp'
  }</a>
</div>`;
}

function noticeList(fields, limit = 0) {
  const items = limit ? fields.slice(0, limit) : fields;
  return `<ul class="notice-list">
    ${items
      .map(
        (field) =>
          `<li><b>${esc(field.label)}</b><span>${esc(field.note || 'Нужно подтвердить у владельца.')}</span></li>`
      )
      .join('')}
  </ul>`;
}

module.exports = {
  ratingValue,
  sectionHead,
  unconfirmed,
  sourceLink,
  cctvStrip,
  proofStrip,
  questCard,
  reviewCard,
  faqItem,
  bookingCta,
  noticeList
};
