'use strict';

const { esc } = require('../lib/validate');
const { page } = require('./layout');
const c = require('./components');
const jsonld = require('./jsonld');

function crumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Хлебные крошки"><div class="wrap">${items
    .map((item, i) =>
      i === items.length - 1
        ? `<span aria-current="page">${esc(item.name)}</span>`
        : `<a href="${esc(item.path)}">${esc(item.name)}</a>`
    )
    .join(' <span aria-hidden="true">/</span> ')}</div></nav>`;
}

function howItWorks({ settings, location, quest, days }) {
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Как это работает', path: '/how-it-works' }])}
    <section class="section">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Формат',
          title: 'Как проходит игра',
          text: 'Подтверждённые шаги и честные пометки там, где правила должен подтвердить владелец.'
        })}
        <ol class="steps steps--vertical">
          <li class="step"><span class="step-num">01</span><h3>Приезжаете к локации</h3>
            <p>${esc(location.fullAddress)}. Ориентир — парк «Металлургов», около 3 минут пешком (~250 м). Локация на цокольном этаже.</p>
            <p class="step-note">${c.unconfirmed('Как найти вход — уточняется')} Фото входа добавим после подтверждения.</p>
          </li>
          <li class="step"><span class="step-num">02</span><h3>Инструктаж администратора</h3>
            <p>Перед игрой объясняют правила и технику безопасности. Точные формулировки подтверждает владелец.</p>
            <p class="step-note">${c.unconfirmed('Правила инструктажа')} ${c.unconfirmed('Стоп-слово')}</p>
          </li>
          <li class="step"><span class="step-num">03</span><h3>60 минут игры</h3>
            <p>Длительность подтверждена Instagram бренда: 60 минут для сценария «Заклятия-Проклятия Монахини».</p>
          </li>
          <li class="step"><span class="step-num">04</span><h3>Выход и обсуждение</h3>
            <p>После игры администратор проводит вас и ответит на вопросы.</p>
          </li>
          <li class="step"><span class="step-num">05</span><h3>Фото и обратная связь</h3>
            <p class="step-note">${c.unconfirmed(
              'Фото после игры — уточняется'
            )} Не обещаем фотосессию, пока владелец не подтвердил. Правила съёмки внутри локации тоже нужно подтвердить.</p>
          </li>
        </ol>
      </div>
    </section>

    <section class="section section--alt">
      <div class="wrap two-col">
        <div class="panel">
          <p class="panel-title">Слоты и ночной график</p>
          <p>
            Смена идёт ежедневно ${esc(settings.hours.label)}. Игровой день начинается в
            ${esc(settings.hours.shiftStart)} и заканчивается в ${esc(settings.hours.shiftEnd)} следующих суток.
            Слоты после полуночи относятся к предыдущему игровому дню — в форме и в подтверждении они помечены
            «после полуночи», чтобы никто не приехал не в ту дату.
          </p>
          <ul class="slot-list slot-list--demo">
            ${(days[0] ? days[0].slots : [])
              .filter((s) => s.status !== 'unavailable')
              .map(
                (slot) =>
                  `<li class="slot slot--${esc(slot.status)}"><span>${esc(slot.time)}${
                    slot.crossesMidnight ? '<i class="slot-mid">+1д</i>' : ''
                  }</span></li>`
              )
              .join('')}
          </ul>
          <p class="panel-note">Пример сетки на ${esc(days[0] ? days[0].dateLabel : 'ближайший день')}. Шаг слотов настраивается в админке.</p>
        </div>
        <div class="panel">
          <p class="panel-title">Что подготовить</p>
          <ul class="plain-list">
            <li>Приехать за 10–15 минут до начала.</li>
            <li>${c.unconfirmed('Одежда и обувь — уточняется')} Рекомендации подтвердит владелец.</li>
            <li>${c.unconfirmed('Состав команды — уточняется')} Минимум и максимум игроков подтверждает администратор.</li>
            <li>Оплата: ${settings.payments.methods.map((m) => esc(m)).join(', ')} (по данным карточки 2ГИС).</li>
            <li>Заявка на сайте бесплатна и ничего не списывает.</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${c.sectionHead({ eyebrow: 'Дальше', title: 'Готовы выбрать время?' })}
        ${c.bookingCta(settings, { quest })}
      </div>
    </section>
  `;
  return page({
    title: 'Как проходит хоррор-квест Fantom — 5 шагов, 60 минут',
    description:
      'Что происходит на месте: встреча, инструктаж, 60 минут игры, выход. Адрес, ночной график и что подготовить перед визитом.',
    path: '/how-it-works',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Как это работает', path: '/how-it-works' }
      ])
    ]
  });
}

function safety({ settings, location, quest }) {
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Безопасность', path: '/safety' }])}
    <section class="section">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Безопасность и правила',
          title: 'Правила, которые должен подтвердить владелец',
          text:
            'Это самый ответственный раздел. Мы намеренно не придумываем стоп-слово, уровни контакта и медицинские ограничения: неверное правило опаснее, чем его отсутствие на сайте.'
        })}
        <div class="notice-grid">
          ${[
            { label: 'Стоп-слово', note: 'Точная формулировка и процедура немедленной остановки игры.' },
            { label: 'Уровни контакта', note: 'Можно ли играть без физического контакта с актёром и как это выбрать.' },
            { label: 'Ограничения по здоровью', note: 'Сердечно-сосудистые заболевания, эпилепсия, беременность, панические расстройства.' },
            { label: 'Возраст и сопровождение', note: 'С какого возраста допускаем самостоятельно и с взрослыми.' },
            { label: 'Аварийный выход', note: 'Где он находится и как им воспользоваться.' },
            { label: 'Опоздание', note: 'Сколько минут ждут и что происходит с броней.' },
            { label: 'Алкоголь и состояние', note: 'Допускаем ли гостей в состоянии опьянения.' },
            { label: 'Съёмка внутри', note: 'Можно ли проносить телефоны и снимать в локации.' }
          ]
            .map(
              (item) => `<article class="notice-card">
            <h3>${esc(item.label)}</h3>
            ${c.unconfirmed('Нужно подтвердить')}
            <p>${esc(item.note)}</p>
          </article>`
            )
            .join('')}
        </div>
        <div class="panel panel--wide">
          <p class="panel-title">Пока правило не подтверждено — спросите напрямую</p>
          <p>
            Это быстрее и надёжнее, чем действовать по предположению. Администратор ответит по правилам конкретного
            сценария${quest ? ` «${esc(quest.name)}»` : ''}.
          </p>
          <div class="cta-row">
            <a class="btn btn-wa" href="${esc(settings.whatsappUrl)}" rel="noopener">Спросить в WhatsApp</a>
            <a class="btn btn-ghost" href="tel:${esc(settings.phoneE164)}">${esc(settings.phone)}</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--alt">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Для владельца',
          title: 'Чек-лист публикации раздела',
          text: 'Раздел закрывается, когда все пункты подтверждены. До этого он остаётся с пометками — это защищает и гостей, и бизнес.'
        })}
        ${c.noticeList(settings.unconfirmedFields)}
      </div>
    </section>
  `;
  return page({
    title: 'Правила и безопасность хоррор-квеста Fantom',
    description:
      'Стоп-слово, уровни контакта, ограничения по здоровью, возраст и правила визита. Неподтверждённые правила помечены — уточните в WhatsApp до записи.',
    path: '/safety',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Безопасность', path: '/safety' }
      ])
    ]
  });
}

function reviews({ settings, location, reviews, published, pendingCount }) {
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Отзывы', path: '/reviews' }])}
    <section class="section">
      <div class="wrap">
        ${c.sectionHead({
          eyebrow: 'Отзывы',
          title: 'Что говорят гости',
          text: `По данным ${settings.rating.sourceLabel}: рейтинг ${c.ratingValue(settings.rating.value)} на основе ${settings.rating.reviewsCount} оценок, ${settings.rating.testimonialsCount} отзывов, ${
            settings.rating.photosCount
          } фото. Обновлено ${settings.rating.updatedAt}.`
        })}
        <div class="rating-panel">
          <div class="rating-value">${esc(c.ratingValue(settings.rating.value))}</div>
          <div class="rating-meta">
            <b>${esc(settings.rating.sourceLabel)}</b>
            <span>${esc(String(settings.rating.reviewsCount))} оценки · ${esc(
              String(settings.rating.testimonialsCount)
            )} отзыва · ${esc(String(settings.rating.photosCount))} фото</span>
            <span class="rating-updated">Динамические данные, обновлено ${esc(settings.rating.updatedAt)}</span>
          </div>
          <a class="btn btn-ghost" href="${esc(settings.rating.sourceUrl)}" rel="noopener nofollow" target="_blank">Все отзывы в ${esc(
            settings.rating.sourceLabel
          )}</a>
        </div>

        ${
          published.length
            ? `<div class="review-grid">${published.map((r) => c.reviewCard(r)).join('')}</div>`
            : `<div class="empty-state">
            <b>Подтверждённые отзывы пока не загружены</b>
            <p>
              Мы не публикуем выдуманные цитаты и не переписываем реальные отзывы. ${
                pendingCount ? `В админке подготовлено мест: ${pendingCount}.` : ''
              }
              Владелец добавляет реальные отзыва из ${esc(settings.rating.sourceLabel)} с датой и ссылкой — после этого
              они появятся здесь и уйдут в Schema.org как Review.
            </p>
            <a class="btn btn-primary" href="${esc(settings.rating.sourceUrl)}" rel="noopener nofollow" target="_blank">Читать отзывы в ${esc(
              settings.rating.sourceLabel
            )}</a>
          </div>`
        }

        <div class="panel panel--wide">
          <p class="panel-title">Как мы работаем с отзывами</p>
          <ul class="plain-list">
            <li>Публикуем только отзывы с указанием источника и даты.</li>
            <li>Цитаты не изменяем по смыслу — допускается только сокращение с многоточием.</li>
            <li>Schema.org Review добавляется только к подтверждённым отзывам; черновики не размечаются.</li>
            <li>Рейтинг и количество отзывов — живые данные ${esc(settings.rating.sourceLabel)}, их нельзя зашивать в вёрстку.</li>
          </ul>
        </div>
      </div>
    </section>
  `;
  return page({
    title: `Отзывы о хоррор-квесте Fantom — рейтинг ${settings.rating.sourceLabel}`,
    description: `Рейтинг ${c.ratingValue(settings.rating.value)} и ${settings.rating.testimonialsCount} отзывов о хоррор-квесте Fantom в Усть-Каменогорске. Источник данных — ${settings.rating.sourceLabel}.`,
    path: '/reviews',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Отзывы', path: '/reviews' }
      ]),
      ...(jsonld.verifiedReviews(reviews) || [])
    ]
  });
}

function faqPageView({ settings, location, faq }) {
  const published = faq.filter((f) => f.status === 'published' && f.answer);
  const pending = faq.filter((f) => !(f.status === 'published' && f.answer));

  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'FAQ', path: '/faq' }])}
    <section class="section">
      <div class="wrap faq-layout">
        <div>
          ${c.sectionHead({
            eyebrow: 'FAQ',
            title: 'Частые вопросы',
            text: 'Сначала то, что мы знаем точно. Ниже — вопросы, по которым нужен ответ владельца: мы помечаем их, а не заполняем догадками.'
          })}
          <div class="panel">
            <p class="panel-title">Не нашли ответ?</p>
            <p>Напишите в WhatsApp — администратор ответит по вашему сценарию и дате.</p>
            <div class="cta-row">
              <a class="btn btn-wa btn-block" href="${esc(settings.whatsappUrl)}" rel="noopener">WhatsApp</a>
            </div>
          </div>
        </div>
        <div>
          <h2 class="faq-group-title">Подтверждённые ответы</h2>
          <div class="faq-list">${published.map((item, i) => c.faqItem(item, i)).join('')}</div>
          <h2 class="faq-group-title">Требует подтверждения владельца</h2>
          <div class="faq-list faq-list--pending">
            ${pending.map((item, i) => c.faqItem(item, published.length + i)).join('')}
          </div>
        </div>
      </div>
    </section>
  `;
  return page({
    title: 'FAQ — хоррор-квест Fantom в Усть-Каменогорске',
    description:
      'Цена, длительность, возраст, состав команды, предоплата, перенос, съёмка и безопасность. Подтверждённые ответы и открытые вопросы к владельцу.',
    path: '/faq',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'FAQ', path: '/faq' }
      ]),
      jsonld.faqPage(faq)
    ]
  });
}

function contacts({ settings, location, quest }) {
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Контакты', path: '/contacts' }])}
    <section class="section">
      <div class="wrap contacts-grid">
        <div>
          ${c.sectionHead({ eyebrow: 'Контакты', title: 'Fantom в Усть-Каменогорске' })}
          <ul class="contact-list">
            <li><span>Адрес</span><b>${esc(location.fullAddress)}</b></li>
            <li><span>Этаж</span><b>${esc(location.floor)}</b></li>
            <li><span>График</span><b>${esc(settings.hours.label)}</b></li>
            <li><span>Таймзона</span><b>${esc(settings.timezone)}</b></li>
            <li><span>Ориентир</span><b>${esc(location.landmark)}</b></li>
            <li><span>Телефон</span><b><a href="tel:${esc(settings.phoneE164)}">${esc(settings.phone)}</a></b></li>
            <li><span>WhatsApp</span><b><a href="${esc(settings.whatsappUrl)}" rel="noopener">Написать</a></b></li>
            <li><span>Instagram</span><b><a href="${esc(settings.instagramUrl)}" rel="noopener">@_fantom_uka_</a></b></li>
            <li><span>Оплата</span><b>${settings.payments.methods.map((m) => esc(m)).join(', ')}</b></li>
            <li><span>Категория</span><b>${esc(settings.rating.category)} по данным 2ГИС</b></li>
            <li><span>Вход</span><b>${c.unconfirmed('Уточняется')}</b></li>
          </ul>
          <div class="cta-row">
            <a class="btn btn-primary" href="/booking">Выбрать дату и время</a>
            <a class="btn btn-wa" href="${esc(settings.whatsappUrl)}" rel="noopener">Спросить в WhatsApp</a>
          </div>
        </div>
        <div>
          <div class="panel">
            <p class="panel-title">Как добраться</p>
            <ul class="plain-list">
              <li>От парка «Металлургов» — около 3 минут пешком, ~250 м.</li>
              <li>Координаты: ${esc(String(location.lat))}, ${esc(String(location.lng))}.</li>
              <li>Локация на цокольном этаже — вход уточняется у владельца.</li>
            </ul>
            <div class="cta-row">
              <a class="btn btn-ghost" href="${esc(location.routeUrl)}" rel="noopener">Маршрут</a>
              <a class="btn btn-ghost" href="${esc(location.mapUrl)}" rel="noopener" target="_blank">Карточка 2ГИС</a>
            </div>
          </div>
          <div class="map-frame">
            <div class="map-placeholder">
              <b>Карта</b>
              <span>Здесь будет интерактивная карта 2ГИС после подключения ключа API. Сейчас — прямые ссылки на маршрут и карточку.</span>
            </div>
          </div>
          <div class="panel">
            <p class="panel-title">Открытые вопросы к владельцу</p>
            ${c.noticeList(
              [
                { label: 'Как найти вход', note: 'Нужно фото и описание входа с цокольного этажа.' },
                { label: 'Парковка', note: 'Где оставить машину рядом.' },
                { label: 'Праздничные дни', note: 'Работаете ли 1 января и в другие праздники.' }
              ],
              3
            )}
          </div>
        </div>
      </div>
    </section>
  `;
  return page({
    title: 'Контакты Fantom — проспект Назарбаева, 50, Усть-Каменогорск',
    description:
      'Адрес: проспект Нурсултана Назарбаева, 50, цокольный этаж, Усть-Каменогорск, 070018. Телефон и WhatsApp +7 700 153 85 84. Ежедневно 09:00–02:00.',
    path: '/contacts',
    body,
    settings,
    location,
    jsonLd: [
      jsonld.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Контакты', path: '/contacts' }
      ]),
      jsonld.localBusiness(settings, location)
    ]
  });
}

function privacy({ settings, location }) {
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Политика данных', path: '/privacy' }])}
    <section class="section">
      <div class="wrap prose">
        ${c.sectionHead({ eyebrow: 'Документы', title: 'Политика обработки персональных данных' })}
        <div class="legal-note">
          <b>Черновик. Требуется юридическая проверка.</b>
          <p>
            Текст ниже описывает то, как реально работает этот сайт, и служит основой для финального документа.
            Перед публикацией его должен проверить юрист на соответствие Закону Республики Казахстан
            «О персональных данных и их защите». Не публикуйте его как финальный без проверки.
          </p>
        </div>

        <h2>1. Какие данные мы собираем</h2>
        <ul>
          <li>Имя, по которому к вам обращаться.</li>
          <li>Номер телефона.</li>
          <li>Предпочтительный канал связи: WhatsApp, Telegram или звонок.</li>
          <li>Комментарий к заявке (необязательное поле).</li>
          <li>Дата и время согласия, источник заявки.</li>
        </ul>
        <p>Мы не собираем паспортные данные, адрес проживания, платёжные реквизиты и не запрашиваем данные детей.</p>

        <h2>2. Зачем</h2>
        <p>
          Единственная цель — подтвердить и провести вашу бронь, связаться с вами по выбранному каналу и, при
          необходимости, перенести игру. Данные не используются для рассылок без отдельного согласия.
        </p>

        <h2>3. Сколько храним</h2>
        <p>
          Заявки хранятся ${esc('12 месяцев')} после даты игры, затем удаляются. Факт согласия фиксируется и хранится
          тот же срок как доказательство законности обработки. Срок хранения настраивается владельцем и должен быть
          подтверждён в финальной версии документа.
        </p>

        <h2>4. Кто имеет доступ</h2>
        <p>
          Администраторы Fantom через защищённую панель. Доступ в панель — по токену, все действия пишутся в audit log
          без хранения лишних персональных данных.
        </p>

        <h2>5. Отзыв согласия</h2>
        <p>
          Напишите в WhatsApp <a href="${esc(settings.whatsappUrl)}" rel="noopener">${esc(settings.phone)}</a> или
          позвоните по телефону ${esc(settings.phone)} — удалим заявку и данные. Ответ — в течение рабочего дня.
        </p>

        <h2>6. Передача третьим лицам</h2>
        <p>
          Данные не продаются и не передаются третьим лицам, кроме технических сервисов доставки уведомлений
          администратору (мессенджер или e-mail провайдер) — и только в объёме текста заявки.
        </p>

        <h2>7. Технические данные</h2>
        <p>
          Сервер ведёт технический лог запросов (адрес, метод, код ответа) без тела заявок. В audit log телефоны и
          имена маскируются.
        </p>

        <h2>8. Контакты по вопросам данных</h2>
        <p>
          ${esc(settings.brand.legalName)}<br>
          ${esc(location.fullAddress)}<br>
          ${esc(settings.phone)} · <a href="${esc(settings.whatsappUrl)}" rel="noopener">WhatsApp</a>
        </p>

        <p class="legal-foot">Версия черновика 1.0 · составлена ${esc(settings.rating.updatedAt)} · требует проверки юристом.</p>
      </div>
    </section>
  `;
  return page({
    title: 'Политика обработки персональных данных — Fantom',
    description:
      'Какие данные собирает сайт Fantom, зачем, сколько хранит, кто имеет доступ и как отозвать согласие. Черновик, требует юридической проверки.',
    path: '/privacy',
    body,
    settings,
    location,
    noindex: true,
    jsonLd: [
      jsonld.breadcrumbs([
        { name: 'Главная', path: '/' },
        { name: 'Политика данных', path: '/privacy' }
      ])
    ]
  });
}

function bookingStatus({ settings, location }) {
  const body = `
    ${crumbs([{ name: 'Главная', path: '/' }, { name: 'Запись', path: '/booking' }, { name: 'Статус заявки', path: '/booking/status' }])}
    <section class="section">
      <div class="wrap narrow">
        ${c.sectionHead({
          eyebrow: 'Проверка брони',
          title: 'Статус заявки',
          text: 'Введите номер заявки и телефон, на который она оформлялась.'
        })}
        <form class="panel" id="status-form" novalidate>
          <div class="field">
            <label for="status-ref">Номер заявки</label>
            <input id="status-ref" name="ref" type="text" placeholder="F-XXXXXX" required autocomplete="off">
            <p class="field-hint">Номер показан на экране после отправки заявки.</p>
          </div>
          <div class="field">
            <label for="status-phone">Телефон</label>
            <input id="status-phone" name="phone" type="tel" inputmode="tel" placeholder="+7 700 000 00 00" required autocomplete="tel">
          </div>
          <p class="form-error" data-status-error role="alert" aria-live="assertive" hidden></p>
          <button class="btn btn-primary" type="submit">Проверить статус</button>
        </form>
        <div class="panel panel--result" data-status-result hidden aria-live="polite">
          <p class="panel-title">Заявка <span data-result-ref></span></p>
          <ul class="summary-list">
            <li><span>Статус</span><b data-result-status>—</b></li>
            <li><span>Сценарий</span><b data-result-quest>—</b></li>
            <li><span>Игровой день</span><b data-result-date>—</b></li>
            <li><span>Время</span><b data-result-time>—</b></li>
            <li><span>Состав команды</span><b data-result-guests>—</b></li>
            <li><span>Цена</span><b class="summary-pending">Уточняется у администратора</b></li>
          </ul>
          <div class="cta-row">
            <a class="btn btn-wa" href="${esc(settings.whatsappUrl)}" rel="noopener">Написать администратору</a>
          </div>
        </div>
      </div>
    </section>
  `;
  return page({
    title: 'Статус заявки — Fantom',
    description: 'Проверьте статус брони хоррор-квеста Fantom по номеру заявки и телефону.',
    path: '/booking/status',
    body,
    settings,
    location,
    noindex: true,
    jsonLd: []
  });
}

function notFound({ settings, location }) {
  const body = `
    <section class="section">
      <div class="wrap narrow error-page">
        <p class="eyebrow">404</p>
        <h1>Этой страницы нет</h1>
        <p>Возможно, ссылка устарела. Начните с записи или посмотрите контакты.</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="/booking">Выбрать дату и время</a>
          <a class="btn btn-ghost" href="/contacts">Контакты</a>
        </div>
      </div>
    </section>
  `;
  return page({
    title: 'Страница не найдена — Fantom',
    description: 'Такой страницы нет. Перейдите к записи на хоррор-квест Fantom.',
    path: '/404',
    body,
    settings,
    location,
    noindex: true,
    jsonLd: []
  });
}

module.exports = { howItWorks, safety, reviews, faqPageView, contacts, privacy, bookingStatus, notFound, crumbs };
