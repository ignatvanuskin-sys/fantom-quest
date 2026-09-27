/* Админка FANTOM — без фреймворков.
   Вход по паролю, сессия в HttpOnly-куке, все действия пишутся в журнал. */

(function () {
  'use strict';

  var state = { tab: 'overview', statuses: {}, slotsDate: '' };

  function $(selector) {
    return document.querySelector(selector);
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
      headers: Object.assign(
        { accept: 'application/json' },
        options && options.body ? { 'content-type': 'application/json' } : {}
      ),
      ...(options || {})
    }).then(function (response) {
      if (response.status === 401) {
        showLogin();
        throw new Error('Нужен вход');
      }
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.message || 'Ошибка запроса');
        return data;
      });
    });
  }

  function toast(message, kind) {
    var node = $('#toast');
    node.textContent = message;
    node.className = 'toast' + (kind === 'error' ? ' alert alert--error' : '');
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
      node.hidden = true;
    }, 4500);
  }

  function alertBox(target, message, kind) {
    var node = typeof target === 'string' ? $(target) : target;
    if (!node) return;
    node.innerHTML = message ? '<div class="alert alert--' + (kind || 'warn') + '">' + message + '</div>' : '';
  }

  function money(value) {
    return Number.isFinite(Number(value)) ? Number(value).toLocaleString('ru-RU') + ' ₸' : '—';
  }

  /* ── Вход ─────────────────────────────────────────────────────────────── */

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
    var password = $('#password').value;
    if (!password) return;
    api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: password }) })
      .then(function () {
        $('#password').value = '';
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

  /* ── Табы ─────────────────────────────────────────────────────────────── */

  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (button) {
    button.addEventListener('click', function () {
      state.tab = button.dataset.tab;
      Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (other) {
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
    if (tab === 'packages') return loadPackages();
    if (tab === 'settings') return loadSettings();
    if (tab === 'audit') return loadAudit();
  }

  /* ── Обзор ────────────────────────────────────────────────────────────── */

  function loadOverview() {
    return api('/api/admin/overview').then(function (data) {
      var notices = [];
      if (data.demoMode) {
        notices.push(
          '<b>Демонстрационный стенд.</b> Постоянное хранилище не подключено: заявки не сохраняются ' +
            'между запусками, изменение настроек отклоняется, а уведомления принудительно отключены.'
        );
      }
      if (data.mockMode) {
        notices.push('<b>MOCK_MODE включён.</b> Уведомления администратору не отправляются.');
      }
      if (data.defaultCredentials) {
        notices.push(
          '<b>Не заданы ADMIN_PASSWORD и собственный ADMIN_TOKEN.</b> До публикации обязательно задайте пароль — ' +
            'стандартный токен-заглушка лежит в открытом репозитории.'
        );
      }
      alertBox('#overview-notice', notices.length ? notices.map(function (line) { return '<p>' + line + '</p>'; }).join('') : '', data.demoMode ? 'error' : 'warn');

      var statuses = data.stats.byStatus;
      $('#overview-stats').innerHTML = [
        ['Всего заявок', data.stats.total],
        ['Сегодня', data.stats.today],
        ['Впереди', data.stats.upcoming],
        ['Новые', statuses.new || 0],
        ['Подтверждены', statuses.confirmed || 0],
        ['Отменены', (statuses.cancelled || 0) + (statuses.no_show || 0)],
        ['Гостей в базе', data.stats.customers]
      ]
        .map(function (pair) {
          return '<div class="stat"><b>' + esc(pair[1]) + '</b><small>' + esc(pair[0]) + '</small></div>';
        })
        .join('');

      $('#overview-health').innerHTML = [
        ['Хранилище', data.storage.driver + (data.storage.persistent ? ' · постоянное' : ' · ВРЕМЕННОЕ')],
        ['Уведомления', data.notificationsReady ? 'настроены' : 'не настроены'],
        ['Режим заявок', data.mockMode ? 'тестовый (не отправляются)' : 'боевой'],
        ['Таймзона', data.timezone],
        ['Время сервера', new Date(data.serverTime).toLocaleString('ru-RU')]
      ]
        .map(function (pair) {
          return '<li><span>' + esc(pair[0]) + '</span><b>' + esc(pair[1]) + '</b></li>';
        })
        .join('');

      $('#today-label').textContent =
        'Игровой день ' + data.stats.todayDate + ' · свободно слотов: ' + data.todaySlots.openCount;
      $('#today-slots').innerHTML = renderSlots(data.todaySlots.slots, false);

      $('#overview-audit').textContent = data.recentAudit
        .map(function (entry) {
          return entry.at + '  ' + entry.action;
        })
        .join('\n');
    });
  }

  function renderSlots(slots, withActions) {
    return slots
      .filter(function (slot) {
        return slot.status !== 'unavailable';
      })
      .map(function (slot) {
        return (
          '<div class="slot-cell slot-cell--' + esc(slot.status) + '">' +
          esc(slot.time) +
          (slot.crossesMidnight ? ' <small>+1д</small>' : '') +
          '<small>' + esc(slot.status) + '</small>' +
          (withActions
            ? '<button class="btn btn-sm" data-block="' + esc(slot.businessDate) + '" data-time="' + esc(slot.time) +
              '" data-blocked="' + (slot.status === 'blocked' ? 'false' : 'true') + '">' +
              (slot.status === 'blocked' ? 'Открыть' : 'Закрыть') + '</button>'
            : '') +
          '</div>'
        );
      })
      .join('');
  }

  /* ── Заявки ───────────────────────────────────────────────────────────── */

  function loadBookings() {
    var params = [];
    var status = $('#filter-status').value;
    var query = $('#filter-q').value.trim();
    var from = $('#filter-from').value;
    var to = $('#filter-to').value;
    if (status) params.push('status=' + encodeURIComponent(status));
    if (query) params.push('q=' + encodeURIComponent(query));
    if (from) params.push('from=' + from);
    if (to) params.push('to=' + to);

    return api('/api/admin/bookings' + (params.length ? '?' + params.join('&') : '')).then(function (data) {
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
        $('#bookings-list').innerHTML = '<div class="card"><p class="muted">Заявок по фильтру нет.</p></div>';
        return;
      }

      $('#bookings-list').innerHTML = data.bookings
        .map(function (booking) {
          var options = Object.keys(state.statuses)
            .map(function (key) {
              return '<option value="' + key + '"' + (key === booking.status ? ' selected' : '') + '>' +
                esc(state.statuses[key]) + '</option>';
            })
            .join('');
          return (
            '<article class="booking booking--' + esc(booking.status) + '">' +
            '<div class="booking-head">' +
            '<span class="booking-ref">' + esc(booking.reference) + '</span>' +
            '<span class="status-pill status-pill--' + esc(booking.status) + '">' +
            esc(state.statuses[booking.status] || booking.status) + '</span>' +
            '<span class="booking-when">' + esc(booking.businessDate) + ' в ' + esc(booking.startTime) +
            (booking.startTime < '09:00' ? ' <small>(после полуночи)</small>' : '') + '</span>' +
            '</div>' +
            '<div class="booking-grid">' +
            '<div><span>Пакет</span><br>' + esc(booking.packageName || '—') + '</div>' +
            '<div><span>Гостей</span><br>' + esc(booking.guests) + '</div>' +
            '<div><span>Имя</span><br>' + esc(booking.name) + '</div>' +
            '<div><span>Телефон</span><br><a href="tel:' + esc(booking.phone) + '">' + esc(booking.phone) + '</a></div>' +
            // Ник — ссылкой: администратору нужен один клик до чата,
            // а не поиск человека по нику вручную.
            '<div><span>Канал</span><br>' + esc(booking.messengerLabel || booking.messenger) +
            (booking.messengerNick
              ? '<br><a target="_blank" rel="noopener" href="https://t.me/' +
                esc(String(booking.messengerNick).replace(/^@/, '')) + '">' +
                esc(booking.messengerNick) + '</a>'
              : '') +
            '</div>' +
            '<div><span>Создана</span><br>' + esc(String(booking.createdAt).slice(0, 16).replace('T', ' ')) + '</div>' +
            (booking.comment ? '<div><span>Комментарий</span><br>«' + esc(booking.comment) + '»</div>' : '') +
            '</div>' +
            '<div class="booking-actions">' +
            '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/' +
            esc(String(booking.phone).replace(/\D/g, '')) + '?text=' +
            encodeURIComponent('Заявка ' + booking.reference + ': подтверждаем время?') + '">WhatsApp</a>' +
            '<select data-status-select="' + esc(booking.id) + '" style="max-width:220px">' + options + '</select>' +
            '<button class="btn btn-sm btn-primary" data-status-apply="' + esc(booking.id) + '">Применить</button>' +
            '</div>' +
            '</article>'
          );
        })
        .join('');
    });
  }

  document.addEventListener('click', function (event) {
    var apply = event.target.closest('[data-status-apply]');
    if (apply) {
      var id = apply.dataset.statusApply;
      var select = document.querySelector('[data-status-select="' + id + '"]');
      api('/api/admin/bookings/' + id, { method: 'PATCH', body: JSON.stringify({ status: select.value }) })
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

  $('#apply-filters').addEventListener('click', loadBookings);

  /* ── Слоты ────────────────────────────────────────────────────────────── */

  function initSlots() {
    if (!$('#slots-date').value) {
      $('#slots-date').value = new Date().toISOString().slice(0, 10);
    }
    return loadSlots();
  }

  function loadSlots() {
    var date = $('#slots-date').value;
    if (!date) return Promise.resolve();
    return api('/api/admin/slots?date=' + encodeURIComponent(date)).then(function (data) {
      $('#slots-grid').innerHTML = renderSlots(data.slots, true);
    });
  }

  $('#load-slots').addEventListener('click', loadSlots);

  /* ── Пакеты ───────────────────────────────────────────────────────────── */

  function loadPackages() {
    return api('/api/admin/packages').then(function (data) {
      $('#packages-list').innerHTML = data.packages
        .map(function (item) {
          return (
            '<div class="package-card">' +
            '<h3>' + esc(item.name) + (item.confirmed ? '' : ' <span class="status-pill status-pill--pending_confirmation">не подтверждён</span>') + '</h3>' +
            '<div class="filters">' +
            '<label>Название<input type="text" data-pkg="' + esc(item.id) + '" data-key="name" value="' + esc(item.name) + '"></label>' +
            '<label>Цена (подпись)<input type="text" data-pkg="' + esc(item.id) + '" data-key="priceLabel" value="' + esc(item.priceLabel || '') + '"></label>' +
            '<label>Цена от, ₸<input type="number" min="0" data-pkg="' + esc(item.id) + '" data-key="priceFrom" value="' + esc(item.priceFrom || '') + '"></label>' +
            '<label>Длительность<input type="text" data-pkg="' + esc(item.id) + '" data-key="durationLabel" value="' + esc(item.durationLabel || '') + '"></label>' +
            '<label>Состав<input type="text" data-pkg="' + esc(item.id) + '" data-key="audienceLabel" value="' + esc(item.audienceLabel || '') + '"></label>' +
            '</div>' +
            '<div class="field" style="margin-top:10px">' +
            '<label>Примечание к цене</label>' +
            '<textarea data-pkg="' + esc(item.id) + '" data-key="priceNote">' + esc(item.priceNote || '') + '</textarea>' +
            '</div>' +
            '<div class="field">' +
            '<label>Что входит (по строке)</label>' +
            '<textarea data-pkg="' + esc(item.id) + '" data-key="includes">' + esc(item.includes.join('\n')) + '</textarea>' +
            '</div>' +
            '<div class="booking-actions">' +
            '<label class="muted"><input type="checkbox" data-pkg="' + esc(item.id) + '" data-key="confirmed" ' + (item.confirmed ? 'checked' : '') + '> Показывать на сайте</label>' +
            '<button class="btn btn-sm btn-primary" data-save-pkg="' + esc(item.id) + '">Сохранить</button>' +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    });
  }

  document.addEventListener('click', function (event) {
    var save = event.target.closest('[data-save-pkg]');
    if (!save) return;
    var id = save.dataset.savePkg;
    var payload = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-pkg="' + id + '"]'), function (input) {
      var key = input.dataset.key;
      if (key === 'confirmed') payload.confirmed = input.checked;
      else if (key === 'includes') payload.includes = input.value.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
      else if (key === 'priceFrom') payload.priceFrom = input.value === '' ? null : Number(input.value);
      else payload[key] = input.value;
    });
    api('/api/admin/packages/' + id, { method: 'PATCH', body: JSON.stringify(payload) })
      .then(function () {
        toast('Пакет сохранён. Изменения сразу на сайте.');
        loadPackages();
      })
      .catch(function (error) {
        toast(error.message, 'error');
      });
  });

  /* ── Настройки ────────────────────────────────────────────────────────── */

  function loadSettings() {
    return api('/api/admin/settings').then(function (data) {
      var s = data.settings;
      $('#shift-start').value = s.hours.shiftStart;
      $('#shift-end').value = s.hours.shiftEnd;
      $('#rating-value').value = s.rating.value;
      $('#rating-reviews').value = s.rating.reviewsCount;
      $('#rating-ratings').value = s.rating.ratingsCount;
      $('#rating-photos').value = s.rating.photosCount;

      $('#unconfirmed-list').innerHTML =
        (s.unconfirmedFields || [])
          .map(function (field) {
            return (
              '<div class="package-card"><b>' + esc(field.label) + '</b>' +
              '<p class="muted">' + esc(field.note || '') + '</p>' +
              '<button class="btn btn-sm" data-resolve="' + esc(field.key) + '">Отметить как подтверждённое</button></div>'
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
          ratingsCount: $('#rating-ratings').value,
          photosCount: $('#rating-photos').value
        }
      })
    })
      .then(function () {
        toast('Рейтинг обновлён.');
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
        toast('Пункт закрыт. Убедитесь, что данные подтвердил владелец.');
        loadSettings();
      })
      .catch(function (error) {
        toast(error.message, 'error');
      });
  });

  $('#test-notification').addEventListener('click', function () {
    api('/api/admin/test-notification', { method: 'POST' })
      .then(function (result) {
        $('#test-result').textContent = result.mockMode
          ? 'Тестовый режим: отправка отключена. Каналы не задействованы.'
          : 'Отправлено по каналам: ' + result.channels.map(function (c) { return c.channel + (c.ok ? ' ✓' : ' ✗'); }).join(', ');
        toast(result.ok ? 'Проверка выполнена' : 'Каналы не настроены');
      })
      .catch(function (error) {
        toast(error.message, 'error');
      });
  });

  /* ── Журнал ───────────────────────────────────────────────────────────── */

  function loadAudit() {
    return api('/api/admin/audit?limit=200').then(function (data) {
      $('#audit-log').textContent = data.entries
        .map(function (entry) {
          var extra = {};
          Object.keys(entry).forEach(function (key) {
            if (['at', 'action', 'ip', 'userAgent'].indexOf(key) === -1) extra[key] = entry[key];
          });
          return entry.at + '  ' + String(entry.action).padEnd(26, ' ') + '  ' + JSON.stringify(extra);
        })
        .join('\n');
    });
  }

  $('#reload-audit').addEventListener('click', loadAudit);

  /* ── Старт ────────────────────────────────────────────────────────────── */

  api('/api/admin/overview')
    .then(showApp)
    .catch(showLogin);
})();
