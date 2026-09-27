'use strict';

const { esc } = require('../lib/validate');
const { page, abs } = require('./layout');
const c = require('./components');
const jsonld = require('./jsonld');

function home({ settings, location, quests, faq, reviews, nextSlot, days, mockMode }) {
  const primary = quests.find((q) => q.isPrimary) || quests[0];
  const placeholders = quests.filter((q) => q.isPlaceholder);

  const body = `
    <section class="hero">
      ${c.cctvStrip(settings)}
      <div class="wrap hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">Хоррор-квест · ${esc(settings.city)} · цокольный этаж</p>
          <h1>Хоррор-квест в Усть-Каменогорске</h1>
          <p class="lede">
            <b>60 минут</b> внутри сюжета «Заклятия-Проклятия Монахини». Реальная локация:
            ${esc(location.streetAddress)}, ${esc(location.floor)}. Работаем ежедневно
            <b>09:00–02:00</b> — есть ночные слоты.
          </p>
          <dl class="hero-facts">
            <div><dt>Адрес</dt><dd>${esc(location.fullAddress)}</dd></div>
            <div><dt>Длительность</dt><dd>60 минут</dd></div>
            <div><dt>График</dt><dd>${esc(settings.hours.label)}</dd></div>
            <div><dt>Ориентир</dt><dd>${esc(location.landmark)}</dd></div>
          </dl>
          <div class="cta-row">
            <a class="btn btn-primary btn-lg" href="/booking">Выбрать дату и время</a>
            <a class="btn btn-wa btn-lg" href="${esc(settings.whatsappUrl)}" rel="noopener">Написать в WhatsApp</a>
          </div>
          <p class="hero-hint">
            Заявка на сайте ничего не списывает: вы выбираете время, администратор подтверждает бронь.
            ${
              nextSlot
                ? `Ближайший свободный слот — <b>${esc(nextSlot.humanLabel)}</b>.`
                : 'Свободные слоты смотрите в форме записи.'
            }
          </p>
        </div>
        <aside class="hero-side" aria-label="Слоты на ближайшие дни">
          <div class="panel">
            <p class="panel-title">Свободное время</p>
            <p class="panel-sub">${esc(settings.hours.label)} · ${esc(settings.timezone)}</p>
            <ul class="mini-slots">
              ${days
                .slice(0, 5)
                .map(
                  (day) => `<li>
                <span class="mini-date">${esc(day.dateLabel)}</span>
                <span class="mini-count">${
                  day.isPast ? 'смена прошла' : `${day.openCount} свободно`
                }</span>
              </li>`
                )
                .join('')}
            </ul>
            <a class="btn btn-primary btn-block" href="/booking">Проверить свободное время</a>
            <p class="panel-note">
              Ночные слоты после полуночи относятся к игровому дню предыдущей календарной даты — в форме это подписано.
            </p>
          </div>
        </aside>
      </div>
    </section>

    ${c.proofStrip(settings, location)}

    <section class="section" id="quests">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Сценарий',
          title: 'Что здесь играют',
          text:
            'Подтверждён один хоррор-сценарий. Второй сценарий бренда QuestHouse Fantom пока не описан в публичных источниках — мы не выдумываем названия и цены.'
        })}
        <div class="quest-grid">
          ${c.questCard(primary, { location, nextSlot })}
          ${placeholders.map((quest) => c.questCard(quest, { location })).join('')}
        </div>
      </div>
    </section>

    <section class="section section--alt" id="how">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Процесс',
          title: 'Как проходит игра',
          text: 'Пять шагов от встречи до выхода. Точные правила инструктажа подтверждает владелец.'
        })}
        <ol class="steps">
          <li class="step">
            <span class="step-num">01</span>
            <h3>Встреча</h3>
            <p>Приходите к ${esc(location.streetAddress)} за 10–15 минут. Ориентир — парк «Металлургов», 250 м.</p>
          </li>
          <li class="step">
            <span class="step-num">02</span>
            <h3>Инструктаж</h3>
            <p>Администратор объясняет правила, отвечает на вопросы и фиксирует стоп-слово${' '}
              ${c.unconfirmed('Правила подтвердить', 'Точное стоп-слово и уровни контакта подтверждает владелец.')}
            </p>
          </li>
          <li class="step">
            <span class="step-num">03</span>
            <h3>60 минут игры</h3>
            <p>Это подтверждённая длительность основного сценария «Заклятия-Проклятия Монахини».</p>
          </li>
          <li class="step">
            <span class="step-num">04</span>
            <h3>Выход и разбор</h3>
            <p>После игры можно обсудить впечатления с командой и администратором.</p>
          </li>
          <li class="step">
            <span class="step-num">05</span>
            <h3>Фото и отзыв</h3>
            <p>${c.unconfirmed('Фото — уточняется', 'Не обещаем фотосессию, пока владелец не подтвердил.')}
              Правила съёмки внутри локации тоже нужно подтвердить.</p>
          </li>
        </ol>
        <p class="section-foot"><a class="link-arrow" href="/how-it-works">Подробнее о формате игры</a></p>
      </div>
    </section>

    <section class="section" id="safety">
      <div class="wrap safety-grid">
        <div>
          ${c.sectionHead({
            eyebrow: 'Безопасность',
            title: 'Что важно знать до игры',
            text: 'Хоррор-формат предполагает напряжение, но не риск. Часть правил мы не публикуем без подтверждения владельца.'
          })}
          <a class="btn btn-ghost" href="/safety">Все правила и ограничения</a>
        </div>
        <div class="panel">
          <p class="panel-title">Обязательно уточнить перед записью</p>
          ${c.noticeList(
            [
              { label: 'Стоп-слово', note: 'Точная формулировка и процедура остановки игры.' },
              { label: 'Уровни контакта', note: 'Можно ли играть без физического контакта с актёром.' },
              { label: 'Ограничения по здоровью', note: 'Противопоказания: сердце, эпилепсия, беременность.' },
              { label: 'Возраст', note: 'Возрастные ограничения и сопровождение взрослыми.' }
            ],
            4
          )}
          <a class="btn btn-wa btn-block" href="${esc(settings.whatsappUrl)}" rel="noopener">Спросить до записи</a>
        </div>
      </div>
    </section>

    <section class="section section--alt" id="reviews">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Отзывы',
          title: `Отзывы гостей`,
          text: `По данным ${settings.rating.sourceLabel}: рейтинг ${c.ratingValue(settings.rating.value)}, ${settings.rating.reviewsCount} оценки, ${settings.rating.testimonialsCount} отзывов.`
        })}
        <div class="review-grid">
          ${reviews.map((r) => c.reviewCard(r)).join('')}
        </div>
        <p class="section-foot">
          <a class="link-arrow" href="${esc(settings.rating.sourceUrl)}" rel="noopener nofollow" target="_blank">Все отзывы в ${esc(
            settings.rating.sourceLabel
          )}</a>
          <a class="link-arrow" href="/reviews">Как мы публикуем отзывы</a>
        </p>
      </div>
    </section>

    <section class="section" id="faq">
      <div class="wrap faq-layout">
        <div>
          ${c.sectionHead({
            eyebrow: 'FAQ',
            title: 'Частые вопросы',
            text: 'Отвечаем честно: где данных нет — помечаем их как неподтверждённые, а не придумываем.'
          })}
        </div>
        <div class="faq-list">
          ${faq.slice(0, 8).map((item, i) => c.faqItem(item, i)).join('')}
          <p class="section-foot"><a class="link-arrow" href="/faq">Все вопросы и ответы</a></p>
        </div>
      </div>
    </section>

    <section class="section section--alt" id="contacts">
      <div class="wrap contacts-grid">
        <div>
          ${c.sectionHead({ eyebrow: 'Контакты', title: 'Как нас найти' })}
          <ul class="contact-list">
            <li><span>Адрес</span><b>${esc(location.fullAddress)}</b></li>
            <li><span>График</span><b>${esc(settings.hours.label)}</b></li>
            <li><span>Ориентир</span><b>${esc(location.landmark)}</b></li>
            <li><span>Телефон / WhatsApp</span><b><a href="tel:${esc(
              settings.phoneE164
            )}">${esc(settings.phone)}</a></b></li>
            <li><span>Instagram</span><b><a href="${esc(
              settings.instagramUrl
            )}" rel="noopener">@_fantom_uka_</a></b></li>
            <li><span>Оплата</span><b>${settings.payments.methods.map((m) => esc(m)).join(', ')}</b></li>
            <li><span>Вход</span><b>${c.unconfirmed('Как найти вход — уточняется')}</b></li>
          </ul>
          <div class="cta-row">
            <a class="btn btn-ghost" href="${esc(location.routeUrl)}" rel="noopener">Маршрут в 2ГИС</a>
            <a class="btn btn-wa" href="${esc(settings.whatsappUrl)}" rel="noopener">WhatsApp</a>
          </div>
        </div>
        <div class="map-frame">
          <div class="map-placeholder">
            <b>Карта 2ГИС</b>
            <span>Интерактивная карта подключается после согласования ключа API. Сейчас — прямая ссылка на маршрут.</span>
            <a class="btn btn-ghost" href="${esc(location.mapUrl)}" rel="noopener" target="_blank">Открыть карточку и маршрут</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="transparency">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Прозрачность',
          title: 'Что ещё должен подтвердить владелец',
          text:
            'Мы собрали это из публичных источников и намеренно не выдумывали цены, правила и слоты. Ниже — список открытых данных.'
        })}
        ${c.noticeList(settings.unconfirmedFields, 8)}
        <p class="section-foot">
          ${
            mockMode
              ? '<span class="badge badge-mock">Тестовый режим: заявки не уходят бизнесу</span>'
              : ''
          }
        </p>
      </div>
    </section>
  `;

  return page({
    title: settings.seo.defaultTitle,
    description: settings.seo.defaultDescription,
    path: '/',
    body,
    settings,
    location,
    jsonLd: [jsonld.webSite(), jsonld.localBusiness(settings, location), jsonld.faqPage(faq)]
  });
}

module.exports = { home };
