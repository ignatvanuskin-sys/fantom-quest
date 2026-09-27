/* Админка Fantom — без фреймворков.
   Авторизация: cookie fm_admin (HttpOnly), выставляется сервером при входе.
   Все запросы идут с credentials: same-origin. */

(function () {
  'use strict';

  var state = {
    tab: 'overview',
    statuses: {},
    bookings: [],
    slotsDate: '',
    quests: [],
    faq: [],
    reviews: [],
    settings: null,
    locations: []
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function api(path, options) {
    return fetch(path, {
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(options && options.body ? { 'content-type': 'application/json' } : {}) },
      ...options
    }).then(function (response) {
      if (response.status === 401) {
        showLogin();
        throw new Error('Не авторизован');
      }
      return response.json().then(function (data) {
        if (!response.ok) throw Object.assign(new Error(data.message || 'Ошибка'), { data: data });
        return data;
      });
    });
  }

  function toast(message, kind) {
    var el = $('#toast');
    el.textContent = message;
    el.className = 'toast' + (kind === 'error' ? ' alert alert--error' : '');
    el.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      el.hidden = true;
    }, 4200);
  }

  function alertBox(container, message, kind) {
    var el = typeof container === 'string' ? $(container) : container;
    if (!el) return;
    el.innerHTML = message ? '<div class="alert alert--' + (kind || 'warn') + '">' + message + '</div>' : '';
  }

  /* ── Вход ───────────────────────────────────────────────────────────── */

  function showLogin() {
    $('#login-view').hidden = false;
    $('#app-view').hidden = true;
  }

  function showApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    loadTab(state.tab);
  }

  $('#login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var token = $('#token').value.trim();
    if (!token) return;
    api('/api/admin/login', { method: 'POST', body: JSON.stringify({ token: token }) })
      .then(function () {
        alertBox('#login-alert', '');
        showApp();
      })
      .catch(function (error) {
        alertBox('#login-alert', esc(error.message), 'error');
      });
  });

  $('#logout').addEventListener('click', function () {
    api('/api/admin/logout', { method: 'POST' }).then(showLogin, showLogin);
  });

  /* ── Табы ───────────────────────────────────────────────────────────── */

  Array.prototype.forEach.call(document.querySelectorAll('#admin-tabs button'), function (button) {
    button.addEventListener('click', function () {
      state.tab = button.dataset.tab;
      Array.prototype.forEach.call(document.querySelectorAll('#admin-tabs button'), function (other) {
        other.setAttribute('aria-selected', other === button ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-panel]'), function (panel) {
        panel.hidden = panel.dataset.panel !== state.tab;
      });
      loadTab(state.tab);
    });
  });

  function loadTab(tab) {
    if (tab === 'overview') return loadOverview();
    if (tab === 'bookings') return loadBookings();
    if (tab === 'slots') return initSlots();
    if (tab === 'quests') return loadQuests();
    if (tab === 'faq') return loadFaq();
    if (tab === 'reviews') return loadReviews();
    if (tab === 'settings') return loadSettings();
    if (tab === 'audit') return loadAudit();
  }

  /* ── Обзор ──────────────────────────────────────────────────────────── */

  function loadOverview() {
    return api('/api/admin/overview').then(function (data) {
      if (data.mockMode) {
        alertBox(
          '#overview-mock',
          '<b>MOCK_MODE включён.</b> Заявки сохраняются в базу, но <b>не отправляются реальному бизнесу</b>. ' +
            'Перед публикацией заполните каналы уведомлений в <code>.env</code> и установите <code>MOCK_MODE=false</code>.',
          'warn'
        );
      } else {
        alertBox('#overview-mock', '');
      }
      if (data.defaultAdminToken) {
        alertBox(
          '#global-alert',
          'Используется стандартный <code>ADMIN_TOKEN</code>. Смените его в <code>.env</code> до публикации — это критично для безопасности.',
          'error'
        );
      } else {
        alertBox('#global-alert', '');
      }

      var stats = data.stats;
      $('#overview-stats').innerHTML = [
        ['Всего заявок', stats.total],
        ['На сегодня', stats.today],
        ['Активных впереди', stats.upcoming],
        ['Клиентов в базе', stats.customers],
        ['Новые (не обработаны)', stats.byStatus.new || 0],
        ['Ожидают подтверждения', stats.byStatus.pending_confirmation || 0],
        ['Подтверждены', stats.byStatus.confirmed || 0],
        ['Отменены', (stats.byStatus.cancelled || 0) + (stats.byStatus.no_show || 0)]
      ]
        .map(function (pair) {
          return '<div class="stat"><b>' + esc(pair[1]) + '</b><small>' + esc(pair[0]) + '</small></div>';
        })
        .join('');

      $('#overview-today-label').textContent =
        'Игровой день ' +
        stats.todayDate +
        ' · таймзона ' +
        data.timezone +
        ' · свободно слотов: ' +
        data.todaySlots.openCount;

      $('#overview-slots').innerHTML = renderSlotCells(data.todaySlots.slots, false);

      $('#overview-audit').textContent = data.recentAudit
        .map(function (entry) {
          return entry.at + '  ' + entry.action;
        })
        .join('\n');
    });
  }

  function renderSlotCells(slots, withActions) {
    return slots
      .filter(function (slot) {
        return slot.status !== 'unavailable';
      })
      .map(function (slot) {
        return (
          '<div class="slot-cell slot-cell--' +
          esc(slot.status) +
          '">' +
          esc(slot.time) +
          (slot.crossesMidnight ? '<small> (+1д)</small>' : '') +
          '<br><small>' +
          esc(slot.status) +
          '</small>' +
          (withActions
            ? '<button class="btn btn-ghost" data-block="' +
              esc(slot.businessDate) +
              '" data-time="' +
              esc(slot.time) +
              '" data-blocked="' +
              (slot.status === 'blocked' ? 'false' : 'true') +
              '">' +
              (slot.status === 'blocked' ? 'Открыть' : 'Закрыть') +
              '</button>'
            : '') +
          '</div>'
        );
      })
      .join('');
  }

  /* ── Заявки ─────────────────────────────────────────────────────────── */

  function loadBookings() {
    var params = [];
    var status = $('#filter-status').value;
    var q = $('#filter-q').value.trim();
    var from = $('#filter-from').value;
    var to = $('#filter-to').value;
    if (status) params.push('status=' + encodeURIComponent(status));
    if (q) params.push('q=' + encodeURIComponent(q));
    if (from) params.push('from=' + from);
    if (to) params.push('to=' + to);

    return api('/api/admin/bookings' + (params.length ? '?' + params.join('&') : '')).then(function (data) {
      state.bookings = data.bookings;
      state.statuses = data.statuses;
      var select = $('#filter-status');
      if (select.options.length <= 1) {
        Object.keys(data.statuses).forEach(function (key) {
          var option = document.createElement('option');
          option.value = key;
          option.textContent = data.statuses[key];
          select.appendChild(option);
        });
      }

      if (!data.bookings.length) {
        $('#bookings-table').innerHTML = '<p class="muted">Заявок по фильтру нет.</p>';
        return;
      }

      var rows = data.bookings
        .map(function (b) {
          var options = Object.keys(state.statuses)
            .map(function (key) {
              return (
                '<option value="' +
                key +
                '"' +
                (key === b.status ? ' selected' : '') +
                '>' +
                esc(state.statuses[key]) +
                '</option>'
              );
            })
            .join('');
          return (
            '<tr>' +
            '<td data-label="Номер"><span class="mono">' +
            esc(b.reference) +
            '</span><br><span class="tag tag--' +
            esc(b.status) +
            '">' +
            esc(state.statuses[b.status] || b.status) +
            '</span></td>' +
            '<td data-label="Когда">' +
            esc(b.businessDate) +
            ' ' +
            esc(b.startTime) +
            (b.startTime < '09:00' ? ' <span class="tag tag--warn">после полуночи</span>' : '') +
            '<br><span class="muted">создана ' +
            esc(String(b.createdAt).slice(0, 16).replace('T', ' ')) +
            '</span></td>' +
            '<td data-label="Гость">' +
            esc(b.name) +
            '<br><a href="tel:' +
            esc(b.phone) +
            '">' +
            esc(b.phone) +
            '</a><br><span class="muted">' +
            esc(b.messengerLabel || b.messenger) +
            '</span></td>' +
            '<td data-label="Детали">' +
            esc(b.guests) +
            ' чел. · ' +
            esc(b.durationMinutes) +
            ' мин<br><span class="muted">Цена: уточняется</span>' +
            (b.comment ? '<br><span class="muted">«' + esc(b.comment) + '»</span>' : '') +
            '</td>' +
            '<td data-label="Связь"><div class="actions">' +
            '<a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' +
            esc(String(b.phone).replace(/\D/g, '')) +
            '?text=' +
            encodeURIComponent('Заявка ' + b.reference + ': подтверждаем время?') +
            '">WhatsApp</a>' +
            '</div></td>' +
            '<td data-label="Статус"><div class="row">' +
            '<select data-status-select="' +
            esc(b.id) +
            '">' +
            options +
            '</select>' +
            '<button class="btn" data-status-apply="' +
            esc(b.id) +
            '">Применить</button>' +
            '</div></td>' +
            '</tr>'
          );
        })
        .join('');

      $('#bookings-table').innerHTML =
        '<table><thead><tr><th>Номер</th><th>Когда</th><th>Гость</th><th>Детали</th><th>Связь</th><th>Статус</th></tr></thead><tbody>' +
        rows +
        '</tbody></table>';
    });
  }

  document.addEventListener('click', function (event) {
    var apply = event.target.closest('[data-status-apply]');
    if (apply) {
      var id = apply.dataset.statusApply;
      var select = document.querySelector('[data-status-select="' + id + '"]');
      api('/api/admin/bookings/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status: select.value })
      })
        .then(function () {
          toast('Статус обновлён. Слот пересчитан.');
          loadBookings();
        })
        .catch(function (error) {
          toast(error.message, 'error');
        });
    }

    var block = event.target.closest('[data-block]');
    if (block) {
      api('/api/admin/slots/block', {
        method: 'POST',
        body: JSON.stringify({
          date: block.dataset.block,
          time: block.dataset.time,
          blocked: block.dataset.blocked === 'true'
        })
      })
        .then(function () {
          toast('Слот обновлён.');
          loadSlots();
        })
        .catch(function (error) {
          toast(error.message, 'error');
        });
    }
  });

  $('#reload-bookings').addEventListener('click', loadBookings);

  /* ── Слоты ──────────────────────────────────────────────────────────── */

  function initSlots() {
    if (!$('#slots-date').value) {
      var today = new Date();
      $('#slots-date').value = today.toISOString().slice(0, 10);
    }
    return loadSlots();
  }

  function loadSlots() {
    var date = $('#slots-date').value;
    if (!date) return Promise.resolve();
    return api('/api/admin/slots?date=' + encodeURIComponent(date)).then(function (data) {
      $('#slots-grid').innerHTML = renderSlotCells(data.slots, true);
      toast('Игровой день ' + data.businessDate + ': свободно ' + data.openCount + ' из ' + data.slots.length);
    });
  }

  $('#load-slots').addEventListener('click', loadSlots);

  /* ── Сценарии ───────────────────────────────────────────────────────── */

  function loadQuests() {
    return api('/api/admin/quests').then(function (data) {
      state.quests = data.quests;
      $('#quests-list').innerHTML = data.quests
        .map(function (quest) {
          var unconfirmed = (quest.unconfirmed || [])
            .map(function (field) {
              return '<span class="tag tag--warn">' + esc(field) + '</span>';
            })
            .join(' ');
          return (
            '<div class="panel">' +
            '<h3>' +
            esc(quest.name) +
            (quest.isPlaceholder ? ' <span class="tag tag--warn">заготовка</span>' : '') +
            '</h3>' +
            '<p class="muted">' +
            esc(quest.shortDescription || '') +
            '</p>' +
            (unconfirmed ? '<p>Неподтверждённые поля: ' + unconfirmed + '</p>' : '<p class="muted">Все поля заполнены.</p>') +
            '<div class="row">' +
            '<div><label>Название</label><input type="text" data-quest="' +
            esc(quest.id) +
            '" data-key="name" value="' +
            esc(quest.name) +
            '"></div>' +
            '<div><label>Жанр</label><input type="text" data-quest="' +
            esc(quest.id) +
            '" data-key="genre" value="' +
            esc(quest.genre || '') +
            '"></div>' +
            '<div><label>Длительность, мин</label><input type="number" min="1" data-quest="' +
            esc(quest.id) +
            '" data-key="durationMinutes" value="' +
            esc(quest.durationMinutes || '') +
            '"></div>' +
            '</div>' +
            '<div class="row">' +
            '<div><label>Цена от, ₸</label><input type="number" min="0" data-quest="' +
            esc(quest.id) +
            '" data-key="priceFrom" value="' +
            esc(quest.priceFrom || '') +
            '"></div>' +
            '<div><label>Возраст</label><input type="text" data-quest="' +
            esc(quest.id) +
            '" data-key="ageLimit" value="' +
            esc(quest.ageLimit || '') +
            '" placeholder="например 14+"></div>' +
            '<div><label>Мин. игроков</label><input type="number" min="1" data-quest="' +
            esc(quest.id) +
            '" data-key="minGuests" value="' +
            esc(quest.minGuests || '') +
            '"></div>' +
            '<div><label>Макс. игроков</label><input type="number" min="1" data-quest="' +
            esc(quest.id) +
            '" data-key="maxGuests" value="' +
            esc(quest.maxGuests || '') +
            '"></div>' +
            '</div>' +
            '<div class="row">' +
            '<div><label>Уровень контакта</label><input type="text" data-quest="' +
            esc(quest.id) +
            '" data-key="contactLevel" value="' +
            esc(quest.contactLevel || '') +
            '"></div>' +
            '<div><label>Стоп-слово</label><input type="text" data-quest="' +
            esc(quest.id) +
            '" data-key="stopWord" value="' +
            esc(quest.stopWord || '') +
            '"></div>' +
            '<div><label>Интенсивность</label><input type="text" data-quest="' +
            esc(quest.id) +
            '" data-key="intensity" value="' +
            esc(quest.intensity || '') +
            '"></div>' +
            '</div>' +
            '<div class="row">' +
            '<div><label>Включить онлайн-запись</label><select data-quest="' +
            esc(quest.id) +
            '" data-key="bookingEnabled"><option value="true"' +
            (quest.bookingEnabled !== false ? ' selected' : '') +
            '>Да</option><option value="false"' +
            (quest.bookingEnabled === false ? ' selected' : '') +
            '>Нет</option></select></div>' +
            '<div><label>Активен</label><select data-quest="' +
            esc(quest.id) +
            '" data-key="active"><option value="true"' +
            (quest.active ? ' selected' : '') +
            '>Да</option><option value="false"' +
            (!quest.active ? ' selected' : '') +
            '>Нет</option></select></div>' +
            '</div>' +
            '<button class="btn btn-primary" data-save-quest="' +
            esc(quest.id) +
            '">Сохранить сценарий</button>' +
            '</div>'
          );
        })
        .join('');
    });
  }

  document.addEventListener('click', function (event) {
    var save = event.target.closest('[data-save-quest]');
    if (!save) return;
    var id = save.dataset.saveQuest;
    var payload = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-quest="' + id + '"]'), function (input) {
      var key = input.dataset.key;
      var value = input.value;
      if (value === '') {
        payload[key] = null;
      } else if (input.type === 'number') {
        payload[key] = Number(value);
      } else if (value === 'true' || value === 'false') {
        payload[key] = value === 'true';
      } else {
        payload[key] = value;
      }
    });
    api('/api/admin/quests/' + id, { method: 'PATCH', body: JSON.stringify(payload) })
      .then(function () {
        toast('Сценарий сохранён. Пометки «Уточняется» сняты с заполненных полей.');
        loadQuests();
      })
      .catch(function (error) {
        toast(error.message, 'error');
      });
  });

  /* ── FAQ ────────────────────────────────────────────────────────────── */

  function loadFaq() {
    return api('/api/admin/faq').then(function (data) {
      state.faq = data.faq;
      $('#faq-list').innerHTML = data.faq
        .map(function (item) {
          return (
            '<div class="panel">' +
            '<div class="row">' +
            '<div><label>Вопрос</label><input type="text" data-faq="' +
            esc(item.id) +
            '" data-key="question" value="' +
            esc(item.question) +
            '"></div>' +
            '<div><label>Порядок</label><input type="number" data-faq="' +
            esc(item.id) +
            '" data-key="order" value="' +
            esc(item.order) +
            '"></div>' +
            '</div>' +
            '<div class="field"><label>Ответ (пусто = «нужно подтвердить»)</label><textarea data-faq="' +
            esc(item.id) +
            '" data-key="answer">' +
            esc(item.answer || '') +
            '</textarea></div>' +
            '<div class="field"><label>Заглушка</label><input type="text" data-faq="' +
            esc(item.id) +
            '" data-key="placeholder" value="' +
            esc(item.placeholder || '') +
            '"></div>' +
            '<p><span class="tag ' +
            (item.status === 'published' ? 'tag--confirmed' : 'tag--warn') +
            '">' +
            (item.status === 'published' ? 'опубликован' : 'нужно подтвердить') +
            '</span></p>' +
            '<div class="actions">' +
            '<button class="btn btn-primary" data-save-faq="' +
            esc(item.id) +
            '">Сохранить</button>' +
            '<button class="btn btn-ghost" data-delete-faq="' +
            esc(item.id) +
            '">Удалить</button>' +
            '</div></div>'
          );
        })
        .join('');
    });
  }

  $('#faq-add').addEventListener('click', function () {
    var question = $('#faq-new-q').value.trim();
    if (!question) return toast('Введите вопрос', 'error');
    api('/api/admin/faq', {
      method: 'POST',
      body: JSON.stringify({
        question: question,
        answer: $('#faq-new-a').value.trim(),
        placeholder: $('#faq-new-p').value.trim()
      })
    })
      .then(function () {
        $('#faq-new-q').value = '';
        $('#faq-new-a').value = '';
        $('#faq-new-p').value = '';
        toast('Вопрос добавлен.');
        loadFaq();
      })
      .catch(function (error) {
        toast(error.message, 'error');
      });
  });

  document.addEventListener('click', function (event) {
    var save = event.target.closest('[data-save-faq]');
    if (save) {
      var id = save.dataset.saveFaq;
      var payload = {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-faq="' + id + '"]'), function (input) {
        payload[input.dataset.key] = input.dataset.key === 'order' ? Number(input.value) : input.value;
      });
      api('/api/admin/faq/' + id, { method: 'PATCH', body: JSON.stringify(payload) })
        .then(function () {
          toast('Сохранено.');
          loadFaq();
        })
        .catch(function (error) {
          toast(error.message, 'error');
        });
    }

    var del = event.target.closest('[data-delete-faq]');
    if (del) {
      if (!window.confirm('Удалить вопрос? Действие попадёт в журнал.')) return;
      api('/api/admin/faq/' + del.dataset.deleteFaq, { method: 'DELETE' })
        .then(function () {
          toast('Удалено.');
          loadFaq();
        })
        .catch(function (error) {
          toast(error.message, 'error');
        });
    }
  });

  /* ── Отзывы ─────────────────────────────────────────────────────────── */

  function loadReviews() {
    return api('/api/admin/reviews').then(function (data) {
      state.reviews = data.reviews;
      $('#reviews-list').innerHTML = data.reviews
        .map(function (item) {
          return (
            '<div class="panel">' +
            '<p><span class="tag ' +
            (item.verified ? 'tag--confirmed' : 'tag--warn') +
            '">' +
            (item.verified ? 'подтверждён' : 'черновик — не публикуется') +
            '</span></p>' +
            '<div class="row">' +
            '<div><label>Автор</label><input type="text" data-rev="' +
            esc(item.id) +
            '" data-key="author" value="' +
            esc(item.author || '') +
            '"></div>' +
            '<div><label>Оценка</label><input type="number" min="1" max="5" data-rev="' +
            esc(item.id) +
            '" data-key="rating" value="' +
            esc(item.rating || '') +
            '"></div>' +
            '<div><label>Дата</label><input type="date" data-rev="' +
            esc(item.id) +
            '" data-key="publishedAt" value="' +
            esc(item.publishedAt || '') +
            '"></div>' +
            '</div>' +
            '<div class="row">' +
            '<div><label>Источник</label><input type="text" data-rev="' +
            esc(item.id) +
            '" data-key="sourceLabel" value="' +
            esc(item.sourceLabel || '') +
            '"></div>' +
            '<div><label>Ссылка на источник</label><input type="text" data-rev="' +
            esc(item.id) +
            '" data-key="sourceUrl" value="' +
            esc(item.sourceUrl || '') +
            '"></div>' +
            '</div>' +
            '<div class="field"><label>Текст отзыва (дословно)</label><textarea data-rev="' +
            esc(item.id) +
            '" data-key="text">' +
            esc(item.text || '') +
            '</textarea></div>' +
            '<div class="field"><label>Заглушка</label><input type="text" data-rev="' +
            esc(item.id) +
            '" data-key="placeholder" value="' +
            esc(item.placeholder || '') +
            '"></div>' +
            '<div class="actions">' +
            '<button class="btn btn-primary" data-save-rev="' +
            esc(item.id) +
            '">Сохранить</button>' +
            '<button class="btn btn-ghost" data-verify-rev="' +
            esc(item.id) +
            '" data-verified="' +
            (item.verified ? 'false' : 'true') +
            '">' +
            (item.verified ? 'Снять подтверждение' : 'Подтвердить и опубликовать') +
            '</button>' +
            '</div></div>'
          );
        })
        .join('');
    });
  }

  $('#rev-add').addEventListener('click', function () {
    var text = $('#rev-text').value.trim();
    if (!text) return toast('Нужен текст отзыва', 'error');
    api('/api/admin/reviews', {
      method: 'POST',
      body: JSON.stringify({
        author: $('#rev-author').value.trim(),
        rating: $('#rev-rating').value,
        publishedAt: $('#rev-date').value,
        sourceLabel: $('#rev-source').value.trim(),
        sourceUrl: $('#rev-url').value.trim(),
        text: text
      })
    })
      .then(function (result) {
        toast(
          result.item.verified
            ? 'Отзыв опубликован и добавлен в Schema.org Review.'
            : 'Отзыв сохранён как черновик: нужна ссылка на источник.'
        );
        $('#rev-text').value = '';
        loadReviews();
      })
      .catch(function (error) {
        toast(error.message, 'error');
      });
  });

  document.addEventListener('click', function (event) {
    var save = event.target.closest('[data-save-rev]');
    if (save) {
      var id = save.dataset.saveRev;
      var payload = {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-rev="' + id + '"]'), function (input) {
        var key = input.dataset.key;
        payload[key] = key === 'rating' && input.value !== '' ? Number(input.value) : input.value;
      });
      api('/api/admin/reviews/' + id, { method: 'PATCH', body: JSON.stringify(payload) })
        .then(function () {
          toast('Сохранено.');
          loadReviews();
        })
        .catch(function (error) {
          toast(error.message, 'error');
        });
    }

    var verify = event.target.closest('[data-verify-rev]');
    if (verify) {
      api('/api/admin/reviews/' + verify.dataset.verifyRev, {
        method: 'PATCH',
        body: JSON.stringify({ verified: verify.dataset.verified === 'true' })
      })
        .then(function () {
          toast('Статус публикации обновлён.');
          loadReviews();
        })
        .catch(function (error) {
          toast(error.message, 'error');
        });
    }
  });

  /* ── Настройки ──────────────────────────────────────────────────────── */

  function loadSettings() {
    return api('/api/admin/settings').then(function (data) {
      state.settings = data.settings;
      state.locations = data.locations;
      $('#shift-start').value = data.settings.hours.shiftStart;
      $('#shift-end').value = data.settings.hours.shiftEnd;
      $('#rating-value').value = data.settings.rating.value;
      $('#rating-reviews').value = data.settings.rating.reviewsCount;
      $('#rating-testimonials').value = data.settings.rating.testimonialsCount;
      $('#rating-photos').value = data.settings.rating.photosCount;

      $('#unconfirmed-list').innerHTML = (data.settings.unconfirmedFields || [])
        .map(function (field) {
          return (
            '<div class="panel"><b>' +
            esc(field.label) +
            '</b><p class="muted">' +
            esc(field.note || '') +
            '</p>' +
            '<button class="btn btn-ghost" data-resolve="' +
            esc(field.key) +
            '">Отметить как подтверждённое</button></div>'
          );
        })
        .join('') || '<p class="muted">Открытых вопросов нет.</p>';
    });
  }

  $('#save-hours').addEventListener('click', function () {
    api('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ hours: { shiftStart: $('#shift-start').value, shiftEnd: $('#shift-end').value } })
    })
      .then(function () {
        toast('Часы работы сохранены. Сетка слотов пересчитана.');
      })
      .catch(function (error) {
        toast(error.message, 'error');
      });
  });

  $('#save-rating').addEventListener('click', function () {
    api('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        rating: {
          value: $('#rating-value').value,
          reviewsCount: $('#rating-reviews').value,
          testimonialsCount: $('#rating-testimonials').value,
          photosCount: $('#rating-photos').value
        }
      })
    })
      .then(function () {
        toast('Рейтинг обновлён. На сайте появится новая дата обновления.');
      })
      .catch(function (error) {
        toast(error.message, 'error');
      });
  });

  document.addEventListener('click', function (event) {
    var resolve = event.target.closest('[data-resolve]');
    if (!resolve) return;
    api('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ resolveUnconfirmed: resolve.dataset.resolve })
    })
      .then(function () {
        toast('Пункт закрыт. Убедитесь, что данные действительно подтверждены владельцем.');
        loadSettings();
      })
      .catch(function (error) {
        toast(error.message, 'error');
      });
  });

  /* ── Журнал ─────────────────────────────────────────────────────────── */

  function loadAudit() {
    return api('/api/admin/audit?limit=200').then(function (data) {
      $('#audit-log').textContent = data.entries
        .map(function (entry) {
          return (
            entry.at +
            '  ' +
            String(entry.action).padEnd(26, ' ') +
            '  ' +
            JSON.stringify(
              Object.keys(entry)
                .filter(function (key) {
                  return ['at', 'action', 'ip', 'userAgent'].indexOf(key) === -1;
                })
                .reduce(function (acc, key) {
                  acc[key] = entry[key];
                  return acc;
                }, {})
            )
          );
        })
        .join('\n');
    });
  }

  $('#reload-audit').addEventListener('click', loadAudit);

  /* ── Старт ──────────────────────────────────────────────────────────── */

  api('/api/admin/overview')
    .then(function () {
      showApp();
    })
    .catch(function () {
      showLogin();
    });
})();
