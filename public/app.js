/* Fantom — клиентский слой.
   Задачи: навигация, timecode, опциональный звук (выключен по умолчанию),
   мастер записи, проверка статуса заявки.

   Правила, которые соблюдаются здесь:
   - звук никогда не стартует сам, только по явному клику;
   - при prefers-reduced-motion движение отключается;
   - ни одна анимация не перекрывает CTA и не блокирует скролл;
   - при ошибке данные формы не теряются. */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Мобильное меню ─────────────────────────────────────────────────── */

  function initNav() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (event) {
      if (event.target.tagName === 'A') {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── CCTV timecode ──────────────────────────────────────────────────── */

  function initTimecode() {
    var el = document.querySelector('[data-timecode]');
    if (!el) return;
    function pad(n) {
      return String(n).padStart(2, '0');
    }
    function tick() {
      var d = new Date();
      var ms = Math.floor(d.getMilliseconds() / 40);
      el.textContent =
        pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ':' + pad(ms);
    }
    tick();
    if (!reduceMotion) setInterval(tick, 120);
  }

  /* ── Звук: только по клику, эмбиент синтезируется, файлов нет ───────── */

  function initSound() {
    var button = document.querySelector('[data-sound-toggle]');
    if (!button || !window.AudioContext) return;
    button.hidden = false;

    var ctx = null;
    var nodes = null;
    var label = button.querySelector('[data-sound-text]');

    function build() {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtor();

      var master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // Низкий гул подвала.
      var osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 43;
      var oscGain = ctx.createGain();
      oscGain.gain.value = 0.045;

      // Шум вентиляции через низкочастотный фильтр.
      var bufferSize = 2 * ctx.sampleRate;
      var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i += 1) data[i] = (Math.random() * 2 - 1) * 0.5;
      var noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      var noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.035;

      osc.connect(oscGain).connect(master);
      noise.connect(filter).connect(noiseGain).connect(master);
      osc.start();
      noise.start();
      nodes = { master: master };
    }

    button.addEventListener('click', function () {
      var pressed = button.getAttribute('aria-pressed') === 'true';
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
      var next = !pressed;
      var now = ctx.currentTime;
      nodes.master.gain.cancelScheduledValues(now);
      nodes.master.gain.linearRampToValueAtTime(next ? 0.5 : 0, now + (reduceMotion ? 0.01 : 1.2));
      button.setAttribute('aria-pressed', next ? 'true' : 'false');
      if (label) label.textContent = next ? 'Звук включён' : 'Звук выключен';
    });
  }

  /* ── Утилиты форм ───────────────────────────────────────────────────── */

  function fieldError(input, message) {
    if (!input) return;
    var described = input.getAttribute('aria-describedby') || '';
    var errorId = (input.id || input.name) + '-error';
    var node = document.getElementById(errorId);
    if (!node) {
      node = document.createElement('p');
      node.id = errorId;
      node.className = 'field-error';
      input.insertAdjacentElement('afterend', node);
      input.setAttribute('aria-describedby', (described + ' ' + errorId).trim());
    }
    node.textContent = message || '';
    if (message) input.setAttribute('aria-invalid', 'true');
    else {
      input.removeAttribute('aria-invalid');
      node.remove();
    }
  }

  function clearErrors(form) {
    form.querySelectorAll('[aria-invalid="true"]').forEach(function (el) {
      el.removeAttribute('aria-invalid');
      var node = document.getElementById((el.id || el.name) + '-error');
      if (node) node.remove();
    });
  }

  function formatDateRu(iso) {
    try {
      var parts = iso.split('-').map(Number);
      var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        weekday: 'short',
        timeZone: 'UTC'
      });
    } catch (error) {
      return iso;
    }
  }

  /* ── Мастер записи ──────────────────────────────────────────────────── */

  function initBooking() {
    var form = document.getElementById('booking-form');
    if (!form) return;

    var state = {
      step: 1,
      slot: null,
      slotData: null,
      startedAt: Date.now(),
      submitting: false
    };

    var steps = Array.prototype.slice.call(form.querySelectorAll('[data-step]'));
    var indicators = Array.prototype.slice.call(form.querySelectorAll('[data-step-indicator]'));
    var slotPicker = form.querySelector('[data-slot-picker]');
    var slotStatus = form.querySelector('[data-slot-status]');
    var errorBox = form.querySelector('[data-form-error]');
    var submitBtn = form.querySelector('[data-submit]');
    var questSelect = form.querySelector('#questId');
    var dateSelect = form.querySelector('#date');
    var timeInput = form.querySelector('#time');
    var guestsInput = form.querySelector('#guests');
    var success = document.querySelector('[data-success]');
    // Сводка лежит вне <form> (на мобильном она идёт после формы),
    // поэтому ищем её в документе, а не внутри формы.
    var summary = {
      quest: document.querySelector('[data-summary-quest]'),
      date: document.querySelector('[data-summary-date]'),
      time: document.querySelector('[data-summary-time]'),
      guests: document.querySelector('[data-summary-guests]')
    };

    var initialSlot = form.dataset.initialSlot || '';
    var initialDate = form.dataset.initialDate || '';

    function showStep(step) {
      state.step = step;
      steps.forEach(function (panel) {
        var isActive = Number(panel.dataset.step) === step;
        panel.classList.toggle('is-active', isActive);
      });
      indicators.forEach(function (item) {
        var index = Number(item.dataset.stepIndicator);
        item.classList.toggle('is-active', index === step);
        item.classList.toggle('is-done', index < step);
      });
      var firstField = form.querySelector('[data-step="' + step + '"] input, [data-step="' + step + '"] select, [data-step="' + step + '"] textarea');
      if (firstField && step !== 1) firstField.focus({ preventScroll: false });
    }

    function setError(message) {
      if (!errorBox) return;
      errorBox.textContent = message || '';
      errorBox.hidden = !message;
    }

    function syncSummary() {
      var quest = questSelect.options[questSelect.selectedIndex];
      if (summary.quest) summary.quest.textContent = quest ? quest.textContent.split(' — ')[0] : '—';
      if (summary.date) summary.date.textContent = dateSelect.value ? formatDateRu(dateSelect.value) : '—';
      if (summary.time) {
        var suffix = state.slot && state.slot.crossesMidnight ? ' (после полуночи)' : '';
        summary.time.textContent = state.slot ? timeInput.value + suffix : '—';
      }
      if (summary.guests) summary.guests.textContent = guestsInput.value ? guestsInput.value + ' чел.' : '—';
    }

    function validateStep1() {
      clearErrors(form);
      var guests = Number(guestsInput.value);
      if (!Number.isFinite(guests) || guests < 1 || guests > 20) {
        fieldError(guestsInput, 'Укажите количество игроков от 1 до 20.');
        return false;
      }
      return true;
    }

    function loadSlots(date, questId) {
      if (!date) return;
      slotPicker.innerHTML = '<p class="slot-loading">Загружаем свободные слоты…</p>';
      if (slotStatus) slotStatus.textContent = '';
      var url = '/api/availability?date=' + encodeURIComponent(date);
      if (questId) url += '&questId=' + encodeURIComponent(questId);

      fetch(url, { headers: { accept: 'application/json' } })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(function (data) {
          state.slotData = data;
          renderSlots(data);
        })
        .catch(function () {
          slotPicker.innerHTML =
            '<p class="slot-empty">Не удалось загрузить слоты. Проверьте соединение или напишите в WhatsApp — администратор подберёт время вручную.</p>';
          if (slotStatus) slotStatus.textContent = 'Ошибка сети. Данные формы сохранены.';
        });
    }

    function renderSlots(data) {
      var available = data.slots.filter(function (slot) {
        return slot.status === 'open' || slot.status === 'held';
      });
      var past = data.slots.filter(function (slot) {
        return slot.status === 'past';
      });

      if (!available.length) {
        slotPicker.innerHTML =
          '<p class="slot-empty">На этот игровой день свободных слотов нет. Выберите другую дату' +
          (past.length ? ' — прошедшие часы скрыты.' : '.') +
          '</p>';
        if (slotStatus) slotStatus.textContent = 'Свободных слотов нет.';
        timeInput.value = '';
        state.slot = null;
        syncSummary();
        return;
      }

      var html = available
        .map(function (slot) {
          var label = slot.crossesMidnight ? '<small>после полуночи</small>' : '';
          var booked = slot.status !== 'open';
          return (
            '<button type="button" class="slot-btn" role="radio" aria-checked="false" ' +
            'data-slot="' +
            slot.time +
            '"' +
            (booked ? ' disabled aria-disabled="true"' : '') +
            '>' +
            '<span>' +
            slot.time +
            '</span>' +
            label +
            '</button>'
          );
        })
        .join('');

      slotPicker.innerHTML = html;
      if (slotStatus) {
        slotStatus.textContent =
          'Свободно слотов: ' + available.filter(function (s) { return s.status === 'open'; }).length + '. Таймзона ' + data.timezone + '.';
      }

      var buttons = Array.prototype.slice.call(slotPicker.querySelectorAll('.slot-btn'));

      function select(btn) {
        buttons.forEach(function (other) {
          other.setAttribute('aria-checked', 'false');
          other.classList.remove('is-selected');
        });
        btn.setAttribute('aria-checked', 'true');
        btn.classList.add('is-selected');
        timeInput.value = btn.dataset.slot;
        state.slot = available.find(function (s) { return s.time === btn.dataset.slot; }) || null;
        setError('');
        syncSummary();
      }

      buttons.forEach(function (btn, index) {
        btn.setAttribute('tabindex', index === 0 ? '0' : '-1');
        btn.addEventListener('click', function () {
          select(btn);
        });
        btn.addEventListener('keydown', function (event) {
          var keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
          if (keys.indexOf(event.key) === -1) return;
          event.preventDefault();
          var step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
          var target = buttons[(index + step + buttons.length) % buttons.length];
          target.focus();
          select(target);
        });
      });

      // Предвыбранный слот из ссылки (например, «ближайшее время» на карточке).
      if (initialSlot) {
        var preset = buttons.find(function (btn) { return btn.dataset.slot === initialSlot; });
        if (preset) {
          select(preset);
          initialSlot = null;
        }
      } else if (state.slot) {
        var previous = buttons.find(function (btn) { return btn.dataset.slot === state.slot.time; });
        if (previous) select(previous);
      }
      initialDate = '';
    }

    function validateStep2() {
      if (!timeInput.value) {
        if (slotStatus) slotStatus.textContent = 'Выберите свободное время — без него заявку отправить нельзя.';
        setError('Выберите свободное время.');
        return false;
      }
      setError('');
      return true;
    }

    function validateStep3() {
      clearErrors(form);
      var ok = true;
      var name = form.querySelector('#name');
      var phone = form.querySelector('#phone');
      var consent = form.querySelector('#consent');

      if (name.value.trim().length < 2) {
        fieldError(name, 'Укажите имя.');
        ok = false;
      }
      var digits = phone.value.replace(/\D/g, '');
      if (digits.length < 10) {
        fieldError(phone, 'Телефон укажите в формате +7 700 000 00 00.');
        ok = false;
      }
      if (!consent.checked) {
        fieldError(consent, 'Нужно согласие на обработку данных.');
        ok = false;
      }
      return ok;
    }

    form.addEventListener('click', function (event) {
      var next = event.target.closest('[data-next]');
      var back = event.target.closest('[data-back]');
      if (next) {
        var target = Number(next.dataset.next);
        if (state.step === 1 && !validateStep1()) return;
        if (state.step === 2 && !validateStep2()) return;
        showStep(target);
      }
      if (back) showStep(Number(back.dataset.back));
    });

    questSelect.addEventListener('change', function () {
      state.slot = null;
      timeInput.value = '';
      syncSummary();
      loadSlots(dateSelect.value, questSelect.value);
    });
    var guestsInputEl = guestsInput;
    guestsInputEl.addEventListener('input', syncSummary);

    dateSelect.addEventListener('change', function () {
      state.slot = null;
      timeInput.value = '';
      syncSummary();
      loadSlots(dateSelect.value, questSelect.value);
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (state.submitting) return;
      if (!validateStep2()) {
        showStep(2);
        return;
      }
      if (!validateStep3()) return;

      state.submitting = true;
      setError('');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем…';
      }

      var payload = {
        questId: questSelect.value,
        date: dateSelect.value,
        time: timeInput.value,
        guests: Number(guestsInput.value),
        name: form.querySelector('#name').value,
        phone: form.querySelector('#phone').value,
        messenger: (form.querySelector('input[name="messenger"]:checked') || {}).value || 'whatsapp',
        comment: form.querySelector('#comment').value,
        consent: form.querySelector('#consent').checked,
        source: 'website',
        website: form.querySelector('#website') ? form.querySelector('#website').value : '',
        formStartedAt: state.startedAt
      };

      fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { status: response.status, data: data };
          });
        })
        .then(function (result) {
          if (result.status >= 400 || !result.data.ok) {
            handleFailure(result.data);
            return;
          }
          showSuccess(result.data);
        })
        .catch(function () {
          setError(
            'Не удалось отправить заявку: нет связи с сервером. Данные сохранены в форме — ' +
              'нажмите «Отправить заявку» ещё раз или напишите в WhatsApp.'
          );
          restoreSubmit();
        });
    });

    function handleFailure(data) {
      var message = data.message || 'Не удалось отправить заявку.';
      if (data.errors) {
        Object.keys(data.errors).forEach(function (field) {
          var input = form.querySelector('#' + field) || form.querySelector('[name="' + field + '"]');
          if (input) fieldError(input, data.errors[field]);
        });
      }
      if (data.code === 'slot_taken') {
        message = 'Это время только что заняли. Выберите другой слот — форма сохранила ваши данные.';
        showStep(2);
        loadSlots(dateSelect.value, questSelect.value);
      } else if (data.code === 'slot_blocked') {
        message = 'Это время закрыто администратором. Выберите другой слот.';
        showStep(2);
        loadSlots(dateSelect.value, questSelect.value);
      } else if (data.code === 'rate_limited') {
        message = 'Слишком много заявок с одного адреса. Напишите в WhatsApp — ответим быстрее.';
      } else if (data.code === 'in_past' || data.code === 'off_grid' || data.code === 'outside_shift') {
        showStep(2);
        loadSlots(dateSelect.value, questSelect.value);
      }
      setError(message);
      restoreSubmit();
    }

    function restoreSubmit() {
      state.submitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить заявку';
      }
    }

    function showSuccess(data) {
      state.submitting = false;
      form.hidden = true;
      var summaryCard = document.querySelector('[data-sticky-summary]');
      if (summaryCard) summaryCard.hidden = true;

      var booking = data.booking;
      setText('[data-success-ref]', booking.reference);
      setText('[data-success-quest]', booking.questName);
      setText('[data-success-date]', booking.dateLabel);
      setText(
        '[data-success-time]',
        booking.startTime + (booking.crossesMidnight ? ' (после полуночи)' : '')
      );
      setText('[data-success-guests]', booking.guests + ' чел.');

      var note = document.querySelector('[data-success-note]');
      if (note) {
        var channel = booking.messengerLabel || 'выбранному каналу';
        note.textContent =
          'Администратор свяжется с вами в ' +
          channel +
          ' и подтвердит бронь. Номер заявки — ' +
          booking.reference +
          '. Цену подтвердит администратор: на сайте она помечена как «уточняется».' +
          (data.demoMode
            ? ' ВНИМАНИЕ: это демонстрационный стенд — заявка показана для примера, ' +
              'не сохранена и не отправлена администратору. Для реальной брони напишите в WhatsApp.'
            : data.notification && data.notification.mockMode
              ? ' ВНИМАНИЕ: сайт работает в тестовом режиме, заявка не отправлена реальному бизнесу.'
              : '');
      }

      if (success) {
        success.hidden = false;
        success.focus();
        success.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
      var wa = document.querySelector('[data-success-whatsapp]');
      if (wa && data.notification && data.notification.manualWhatsappLink) {
        wa.href = data.notification.manualWhatsappLink;
      }
    }

    function setText(selector, value) {
      var el = document.querySelector(selector);
      if (el) el.textContent = value == null ? '—' : String(value);
    }

    syncSummary();
    showStep(1);
    loadSlots(dateSelect.value, questSelect.value);
  }

  /* ── Статус заявки ──────────────────────────────────────────────────── */

  function initStatusForm() {
    var form = document.getElementById('status-form');
    if (!form) return;
    var errorBox = form.querySelector('[data-status-error]');
    var result = document.querySelector('[data-status-result]');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var ref = form.querySelector('#status-ref').value.trim();
      var phone = form.querySelector('#status-phone').value.trim();
      if (!ref || !phone) {
        errorBox.textContent = 'Заполните номер заявки и телефон.';
        errorBox.hidden = false;
        return;
      }
      errorBox.hidden = true;

      fetch('/api/bookings/' + encodeURIComponent(ref) + '?phone=' + encodeURIComponent(phone), {
        headers: { accept: 'application/json' }
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { status: response.status, data: data };
          });
        })
        .then(function (result2) {
          if (result2.status >= 400 || !result2.data.ok) {
            errorBox.textContent = result2.data.message || 'Заявка не найдена.';
            errorBox.hidden = false;
            return;
          }
          var b = result2.data.booking;
          setText('[data-result-ref]', b.reference);
          setText('[data-result-status]', b.statusLabel);
          setText('[data-result-quest]', b.questName);
          setText('[data-result-date]', b.dateLabel);
          setText('[data-result-time]', b.startTime + (b.crossesMidnight ? ' (после полуночи)' : ''));
          setText('[data-result-guests]', b.guests + ' чел.');
          if (result) result.hidden = false;
        })
        .catch(function () {
          errorBox.textContent = 'Ошибка сети. Попробуйте ещё раз.';
          errorBox.hidden = false;
        });
    });

    function setText(selector, value) {
      var el = document.querySelector(selector);
      if (el) el.textContent = value == null ? '—' : String(value);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    initTimecode();
    initSound();
    initBooking();
    initStatusForm();
  });
})();
