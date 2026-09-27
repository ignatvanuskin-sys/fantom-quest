'use strict';

const { esc } = require('../lib/validate');
const { page } = require('./layout');
const c = require('./components');
const jsonld = require('./jsonld');

function quests({ settings, location, quests, nextSlot }) {
  const body = `
    <nav class="breadcrumbs" aria-label="Хлебные крошки">
      <div class="wrap"><a href="/">Главная</a> <span aria-hidden="true">/</span> <span aria-current="page">Квесты</span></div>
    </nav>
    <section class="section">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Каталог',
          title: 'Сценарии Fantom',
          text:
            'Показываем только подтверждённые сценарии. Карточки без подтверждённых данных остаются выключенными — это честнее, чем выдуманный каталог.'
        })}
        <div class="quest-grid">
          ${quests
            .map((quest) => c.questCard(quest, { location, nextSlot: quest.isPrimary ? nextSlot : null }))
            .join('')}
        </div>
      </div>
    </section>
    <section class="section section--alt">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Запись',
          title: 'Как забронировать',
          text: 'Три шага, около минуты. Заявка не списывает деньги — администратор подтверждает время вручную.'
        })}
        <ol class="steps steps--compact">
          <li class="step"><span class="step-num">01</span><h3>Сценарий и состав</h3><p>Выберите сценарий и число игроков.</p></li>
          <li class="step"><span class="step-num">02</span><h3>Дата и время</h3><p>Свободные слоты на 30 дней, включая ночные.</p></li>
          <li class="step"><span class="step-num">03</span><h3>Контакты</h3><p>Имя, телефон и удобный канал связи.</p></li>
        </ol>
        ${c.bookingCta(settings)}
      </div>
    </section>
  `;
  return page({
    title: 'Сценарии хоррор-квеста Fantom — Усть-Каменогорск',
    description:
      'Каталог сценариев Fantom в Усть-Каменогорске. Подтверждён хоррор-сценарий «Заклятия-Проклятия Монахини», 60 минут. Запись по времени онлайн.',
    path: '/quests',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Квесты', path: '/quests' }
      ])
    ]
  });
}

function questDetail({ settings, location, quest, nextSlot, days, quests }) {
  const facts = [
    { label: 'Жанр', value: quest.genre },
    { label: 'Длительность', value: quest.durationConfirmed ? `${quest.durationMinutes} минут` : null },
    { label: 'Возраст', value: quest.ageLimit },
    { label: 'Состав команды', value: quest.minGuests && quest.maxGuests ? `${quest.minGuests}–${quest.maxGuests} человек` : null },
    { label: 'Интенсивность', value: quest.intensity },
    { label: 'Уровень контакта', value: quest.contactLevel },
    { label: 'Стоп-слово', value: quest.stopWord },
    { label: 'Подойдёт кому', value: quest.suitedFor },
    { label: 'Цена', value: quest.priceFrom ? `от ${quest.priceFrom} ₸` : null }
  ];

  const body = `
    <nav class="breadcrumbs" aria-label="Хлебные крошки">
      <div class="wrap">
        <a href="/">Главная</a> <span aria-hidden="true">/</span>
        <a href="/quests">Квесты</a> <span aria-hidden="true">/</span>
        <span aria-current="page">${esc(quest.name)}</span>
      </div>
    </nav>

    <section class="section quest-hero">
      <div class="wrap quest-hero-grid">
        <div>
          <p class="eyebrow">${esc(quest.brandLabel)} · хоррор · ${esc(location.city)}</p>
          <h1>${esc(quest.name)}</h1>
          <p class="lede">${esc(quest.shortDescription)}</p>
          ${quest.longDescription ? `<p class="quest-long">${esc(quest.longDescription)}</p>` : ''}
          <div class="cta-row">
            <a class="btn btn-primary btn-lg" href="/booking?quest=${esc(quest.slug)}${
    nextSlot ? `&date=${esc(nextSlot.businessDate)}` : ''
  }">Забронировать Fantom</a>
            <a class="btn btn-wa btn-lg" href="${esc(settings.whatsappUrl)}" rel="noopener">Задать вопрос в WhatsApp</a>
          </div>
          ${
            nextSlot
              ? `<p class="hero-hint">Ближайшее свободное время: <b>${esc(nextSlot.humanLabel)}</b>.</p>`
              : '<p class="hero-hint">Свободные слоты — в форме записи.</p>'
          }
        </div>
        <aside class="panel fact-panel">
          <p class="panel-title">Параметры игры</p>
          <ul class="fact-table">
            ${facts
              .map(
                (fact) => `<li>
              <span>${esc(fact.label)}</span>
              <b${
                fact.value ? '' : ' class="fact-pending"'
              }>${fact.value ? esc(fact.value) : 'Уточняется'}</b>
            </li>`
              )
              .join('')}
          </ul>
          ${
            quest.priceNote
              ? `<p class="panel-note">${esc(quest.priceNote)}</p>`
              : ''
          }
          <p class="panel-note">
            Неподтверждённые параметры помечены как «Уточняется». Мы не публикуем выдуманные цифры — цену и правила подтверждает владелец.
          </p>
        </aside>
      </div>
    </section>

    <section class="section section--alt">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Расписание',
          title: 'Ближайшие свободные слоты',
          text: `${esc(settings.hours.label)} · таймзона ${esc(settings.timezone)}. Слоты после полуночи помечены отдельно.`
        })}
        <div class="day-grid">
          ${days
            .slice(0, 6)
            .map(
              (day) => `<article class="day-card${day.isPast ? ' day-card--past' : ''}">
            <header>
              <h3>${esc(day.dateLabel)}</h3>
              <span>${day.isPast ? 'смена прошла' : `${day.openCount} свободно`}</span>
            </header>
            <ul class="slot-list">
              ${day.slots
                .filter((s) => s.status !== 'unavailable')
                .slice(0, 12)
                .map(
                  (slot) =>
                    `<li class="slot slot--${esc(slot.status)}"><span>${esc(slot.time)}${
                      slot.crossesMidnight ? '<i class="slot-mid">+1д</i>' : ''
                    }</span></li>`
                )
                .join('')}
            </ul>
            ${
              day.openCount
                ? `<a class="btn btn-ghost btn-block" href="/booking?quest=${esc(quest.slug)}&date=${esc(
                    day.businessDate
                  )}">Выбрать время</a>`
                : '<span class="btn btn-disabled btn-block" aria-disabled="true">Нет свободных слотов</span>'
            }
          </article>`
            )
            .join('')}
        </div>
        <p class="section-foot"><a class="link-arrow" href="/booking?quest=${esc(quest.slug)}">Показать все слоты на 30 дней</a></p>
      </div>
    </section>

    <section class="section">
      <div class="wrap gallery-block">
        ${c.sectionHead({
          eyebrow: 'Фото',
          title: 'Кадры локации',
          text: 'Мы не подставляем стоковый хоррор. Слоты ниже зарезервированы под реальные фото бизнеса и помечены требованиями.'
        })}
        <div class="gallery">
          ${(quest.imageRequirements?.gallery || [])
            .map(
              (slot) => `<figure class="gallery-item">
            <div class="gallery-placeholder">
              <span class="placeholder-label">Фото нужно добавить</span>
            </div>
            <figcaption>
              <b>${esc(slot.label)}</b>
              <span>${esc(slot.note)}</span>
            </figcaption>
          </figure>`
            )
            .join('')}
        </div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="wrap">
        ${c.sectionHead({ eyebrow: 'Вопросы по сценарию', title: 'Что уточнить заранее' })}
        ${c.noticeList(settings.unconfirmedFields, 6)}
      </div>
    </section>
  `;

  return page({
    title: `${quest.name} — хоррор-квест в Усть-Каменогорске, 60 минут`,
    description: `${quest.shortDescription} Адрес: ${location.fullAddress}. ${settings.hours.label}. Запись онлайн.`,
    path: `/quests/${quest.slug}`,
    body,
    settings,
    location,
    ogType: 'article',
    jsonLd: [
      jsonld.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Квесты', path: '/quests' },
        { name: quest.name, path: `/quests/${quest.slug}` }
      ]),
      jsonld.service(quest, location)
    ]
  });
}

function booking({ settings, location, quests, initialQuest, initialDate, preselectedSlot, days }) {
  const body = `
    <nav class="breadcrumbs" aria-label="Хлебные крошки">
      <div class="wrap"><a href="/">Главная</a> <span aria-hidden="true">/</span> <span aria-current="page">Запись</span></div>
    </nav>
    <section class="section booking-section">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Бронирование',
          title: 'Выбрать квест и время',
          text: 'Три шага. Заявка ничего не оплачивает — администратор подтвердит время в выбранном канале.'
        })}

        <div class="booking-layout">
          <form class="booking-form" id="booking-form" novalidate
                data-initial-quest="${esc(initialQuest)}"
                data-initial-date="${esc(initialDate || '')}"
                data-initial-slot="${esc(preselectedSlot || '')}"
                data-whatsapp="${esc(settings.whatsappUrl)}">
            <ol class="wizard-steps" data-wizard-steps>
              <li class="wizard-step is-active" data-step-indicator="1"><span>1</span> Сценарий и состав</li>
              <li class="wizard-step" data-step-indicator="2"><span>2</span> Дата и время</li>
              <li class="wizard-step" data-step-indicator="3"><span>3</span> Контакты</li>
            </ol>

            <fieldset class="wizard-panel is-active" data-step="1">
              <legend class="sr-only">Шаг 1 — сценарий и количество игроков</legend>
              <div class="field">
                <label for="questId">Сценарий</label>
                <select id="questId" name="questId" required aria-required="true" aria-describedby="questId-hint">
                  ${quests
                    .filter((q) => q.active && q.bookingEnabled !== false)
                    .map(
                      (q) =>
                        `<option value="${esc(q.id)}"${q.id === initialQuest ? ' selected' : ''}>${esc(
                          q.name
                        )} — ${q.durationMinutes} мин</option>`
                    )
                    .join('')}
                  ${quests
                    .filter((q) => !q.active || q.bookingEnabled === false)
                    .map(
                      (q) =>
                        `<option value="${esc(q.id)}" disabled>${esc(q.name)} — недоступно (нужны данные)</option>`
                    )
                    .join('')}
                </select>
                <p class="field-hint" id="questId-hint">
                  Доступен только подтверждённый сценарий. Второй сценарий включится после подтверждения владельцем.
                </p>
              </div>
              <div class="field">
                <label for="guests">Количество игроков</label>
                <input id="guests" name="guests" type="number" inputmode="numeric" min="1" max="20" step="1"
                       value="4" required aria-required="true" autocomplete="off" aria-describedby="guests-hint">
                <p class="field-hint" id="guests-hint">
                  Точный минимальный и максимальный состав команды подтверждает администратор —
                  он проверит вашу заявку перед подтверждением.
                </p>
              </div>
              <div class="wizard-nav">
                <span></span>
                <button class="btn btn-primary" type="button" data-next="2">Дальше: дата и время</button>
              </div>
            </fieldset>

            <fieldset class="wizard-panel" data-step="2">
              <legend class="sr-only">Шаг 2 — дата и время</legend>
              <div class="field">
                <label for="date">Игровой день</label>
                <select id="date" name="date" required aria-required="true" aria-describedby="date-hint" data-date-select>
                  ${days
                    .map(
                      (day) =>
                        `<option value="${esc(day.businessDate)}"${day.isPast ? ' disabled' : ''}${
                          day.businessDate === initialDate ? ' selected' : ''
                        }>${esc(day.dateLabel)} — ${
                          day.isPast ? 'смена прошла' : `${day.openCount} свободно`
                        }</option>`
                    )
                    .join('')}
                </select>
                <p class="field-hint" id="date-hint">
                  Показаны игровые дни. Ночные слоты после 00:00 относятся к выбранному игровому дню
                  и помечены «после полуночи».
                </p>
              </div>
              <div class="field">
                <span class="field-label" id="slots-label">Свободное время</span>
                <div class="slot-picker" role="radiogroup" aria-labelledby="slots-label" data-slot-picker>
                  <p class="slot-loading" data-slot-loading>Загружаем свободные слоты…</p>
                </div>
                <p class="field-hint" data-slot-status aria-live="polite"></p>
              </div>
              <input type="hidden" name="time" id="time" required aria-required="true">
              <div class="wizard-nav">
                <button class="btn btn-ghost" type="button" data-back="1">Назад</button>
                <button class="btn btn-primary" type="button" data-next="3" data-requires-slot>Дальше: контакты</button>
              </div>
            </fieldset>

            <fieldset class="wizard-panel" data-step="3">
              <legend class="sr-only">Шаг 3 — контакты и согласие</legend>
              <div class="field">
                <label for="name">Имя</label>
                <input id="name" name="name" type="text" autocomplete="name" required aria-required="true"
                       maxlength="80" aria-describedby="name-hint">
                <p class="field-hint" id="name-hint">Как к вам обращаться при подтверждении брони.</p>
              </div>
              <div class="field">
                <label for="phone">Телефон</label>
                <input id="phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required
                       aria-required="true" placeholder="+7 700 000 00 00" aria-describedby="phone-hint">
                <p class="field-hint" id="phone-hint">Формат: +7 XXX XXX XX XX. Нужен для подтверждения брони.</p>
              </div>
              <div class="field">
                <span class="field-label" id="messenger-label">Удобный канал связи</span>
                <div class="radio-row" role="radiogroup" aria-labelledby="messenger-label">
                  <label class="radio"><input type="radio" name="messenger" value="whatsapp" checked required><span>WhatsApp</span></label>
                  <label class="radio"><input type="radio" name="messenger" value="telegram"><span>Telegram</span></label>
                  <label class="radio"><input type="radio" name="messenger" value="call"><span>Звонок</span></label>
                </div>
              </div>
              <div class="field">
                <label for="comment">Комментарий <span class="field-optional">необязательно</span></label>
                <textarea id="comment" name="comment" rows="3" maxlength="600"
                          placeholder="День рождения, нужен ли бесконтактный режим, во сколько удобно позвонить"
                          aria-describedby="comment-hint"></textarea>
                <p class="field-hint" id="comment-hint">Помогите администратору подготовиться к вашей игре.</p>
              </div>
              <div class="field field-consent">
                <label class="checkbox">
                  <input type="checkbox" id="consent" name="consent" required aria-required="true"
                         aria-describedby="consent-hint">
                  <span>Согласен на обработку персональных данных согласно <a href="/privacy" target="_blank" rel="noopener">политике</a>.</span>
                </label>
                <p class="field-hint" id="consent-hint">
                  Храним минимум: имя, телефон, комментарий и факт согласия. Текст политики требует проверки юристом
                  на соответствие законодательству Казахстана.
                </p>
              </div>
              <div class="hp-field" aria-hidden="true">
                <label for="website">Не заполняйте это поле</label>
                <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
              </div>
              <p class="form-error" data-form-error role="alert" aria-live="assertive" hidden></p>
              <div class="wizard-nav">
                <button class="btn btn-ghost" type="button" data-back="2">Назад</button>
                <button class="btn btn-primary btn-lg" type="submit" data-submit>Отправить заявку</button>
              </div>
              <p class="field-hint">
                Кнопка называется «Отправить заявку», а не «Оплатить»: сайт не принимает платежи.
              </p>
            </fieldset>
          </form>

          <aside class="booking-summary" data-summary aria-live="polite">
            <div class="summary-card" data-sticky-summary>
              <p class="panel-title">Ваша заявка</p>
              <ul class="summary-list">
                <li><span>Сценарий</span><b data-summary-quest>—</b></li>
                <li><span>Адрес</span><b>${esc(location.streetAddress)}, ${esc(location.floor)}</b></li>
                <li><span>Игровой день</span><b data-summary-date>—</b></li>
                <li><span>Время</span><b data-summary-time>—</b></li>
                <li><span>Состав команды</span><b data-summary-guests>—</b></li>
                <li><span>Длительность</span><b>60 минут</b></li>
                <li><span>Цена</span><b class="summary-pending">${c.unconfirmed(
                  'Уточняется у администратора'
                )}</b></li>
              </ul>
              <p class="panel-note">
                Заявка не списывает деньги. Слот закрепляется за вами на время подтверждения.
              </p>
              <a class="btn btn-wa btn-block" href="${esc(settings.whatsappUrl)}" rel="noopener">Спросить в WhatsApp</a>
            </div>
          </aside>
        </div>

        <div class="booking-success" data-success hidden role="status" tabindex="-1">
          <p class="eyebrow">Заявка принята</p>
          <h2 data-success-title>Готово</h2>
          <ul class="summary-list">
            <li><span>Номер заявки</span><b data-success-ref>—</b></li>
            <li><span>Сценарий</span><b data-success-quest>—</b></li>
            <li><span>Игровой день</span><b data-success-date>—</b></li>
            <li><span>Время</span><b data-success-time>—</b></li>
            <li><span>Состав команды</span><b data-success-guests>—</b></li>
            <li><span>Цена</span><b class="summary-pending">Уточняется у администратора</b></li>
          </ul>
          <p class="success-note" data-success-note></p>
          <div class="cta-row">
            <a class="btn btn-wa" data-success-whatsapp href="${esc(settings.whatsappUrl)}" rel="noopener">Написать в WhatsApp</a>
            <a class="btn btn-ghost" href="tel:${esc(settings.phoneE164)}">${esc(settings.phone)}</a>
            <a class="btn btn-ghost" href="/booking/status">Проверить статус заявки</a>
          </div>
        </div>
      </div>
    </section>
  `;

  return page({
    title: 'Запись на хоррор-квест Fantom — выбрать дату и время',
    description:
      'Выберите сценарий, дату и свободное время. Заявка бесплатна: администратор Fantom подтвердит бронь в WhatsApp, Telegram или звонком.',
    path: '/booking',
    body,
    settings,
    location,
    noindex: false,
    jsonLd: [
      jsonld.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Запись', path: '/booking' }
      ])
    ]
  });
}

module.exports = { quests, questDetail, booking };
