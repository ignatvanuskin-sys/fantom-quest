/* FANTOM — клиентский слой.
   Задачи: навигация, атмосферные эффекты, галерея, звук (выключен по умолчанию),
   мастер записи и аналитика событий.

   Правила: звук не стартует сам; при prefers-reduced-motion движение выключено;
   ни один эффект не блокирует контент и кнопку записи; при ошибке данные формы
   не теряются. */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Аналитика: только обезличенные события ───────────────────────────── */

  function track(event, payload) {
    var detail = Object.assign({ event: event }, payload || {});
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(detail);
    document.dispatchEvent(new CustomEvent('fantom:event', { detail: detail }));
  }

  /** Никогда не отправляем имя, телефон и комментарий. */
  var PII_KEYS = ['name', 'phone', 'comment', 'email'];

  function trackSafe(event, payload) {
    var safe = {};
    Object.keys(payload || {}).forEach(function (key) {
      if (PII_KEYS.indexOf(key) === -1) safe[key] = payload[key];
    });
    track(event, safe);
  }

  /* ── Навигация ────────────────────────────────────────────────────────── */

  function initNav() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) track('nav_opened');
    });

    nav.addEventListener('click', function (event) {
      if (event.target.tagName === 'A') {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Появление секций: как будто открывается дверь ───────────────────── */

  function initReveal() {
    var nodes = document.querySelectorAll('[data-reveal]');
    if (!nodes.length || reduceMotion || !('IntersectionObserver' in window)) return;

    nodes.forEach(function (node) {
      node.style.opacity = '0';
      node.style.transform = 'translateY(14px)';
      node.style.transition = 'opacity .7s cubic-bezier(.22,.61,.36,1), transform .7s cubic-bezier(.22,.61,.36,1)';
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'none';
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
    );

    nodes.forEach(function (node) {
      observer.observe(node);
    });
  }

  /* ── Hero: лёгкий отклик на курсор, только на десктопе ───────────────── */

  function initHero() {
    var hero = document.querySelector('[data-hero]');
    if (!hero || reduceMotion) return;
    if (!window.matchMedia('(hover: hover) and (min-width: 900px)').matches) return;

    var image = hero.querySelector('.hero-media img');
    if (!image) return;

    var targetX = 0;
    var targetY = 0;
    var currentX = 0;
    var currentY = 0;
    var raf = null;

    hero.addEventListener('mousemove', function (event) {
      var rect = hero.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 18;
      targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 12;
      if (!raf) raf = requestAnimationFrame(step);
    });

    function step() {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      image.style.transform = 'translate3d(' + currentX.toFixed(2) + 'px,' + currentY.toFixed(2) + 'px,0) scale(1.05)';
      if (Math.abs(targetX - currentX) > 0.2 || Math.abs(targetY - currentY) > 0.2) {
        raf = requestAnimationFrame(step);
      } else {
        raf = null;
      }
    }
  }

  /* ── Панель контактов и звук: не мешают контенту и клавиатуре ─────────── */

  function initContactBar() {
    var bar = document.querySelector('[data-contact-bar]');
    if (!bar) return;

    var lastY = window.scrollY;
    var hideTimer = null;

    function setHidden(hidden) {
      bar.classList.toggle('is-hidden', hidden);
    }

    window.addEventListener(
      'scroll',
      function () {
        var y = window.scrollY;
        if (y > lastY + 8 && y > 320) setHidden(true);
        else if (y < lastY - 8) setHidden(false);
        lastY = y;
      },
      { passive: true }
    );

    // Пока пользователь заполняет форму, панель убирается: она не должна
    // закрывать поля и мешать мобильной клавиатуре.
    document.addEventListener('focusin', function (event) {
      if (event.target.matches('input, textarea, select')) {
        setHidden(true);
        clearTimeout(hideTimer);
      }
    });

    document.addEventListener('focusout', function (event) {
      if (event.target.matches('input, textarea, select')) {
        hideTimer = setTimeout(function () {
          setHidden(false);
        }, 400);
      }
    });
  }

  /* ── Звук: WebAudio, только по явному нажатию ─────────────────────────── */

  function initSound() {
    var button = document.querySelector('[data-sound-toggle]');
    if (!button || !window.AudioContext) return;
    button.hidden = false;

    var ctx = null;
    var master = null;
    var label = button.querySelector('[data-sound-label]');

    function build() {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtor();

      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // Низкий гул подвала.
      var drone = ctx.createOscillator();
      drone.type = 'sawtooth';
      drone.frequency.value = 41;
      var droneGain = ctx.createGain();
      droneGain.gain.value = 0.05;

      // Шум вентиляции через низкочастотный фильтр.
      var size = 2 * ctx.sampleRate;
      var buffer = ctx.createBuffer(1, size, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * 0.5;
      var noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      var noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.032;

      drone.connect(droneGain).connect(master);
      noise.connect(filter).connect(noiseGain).connect(master);
      drone.start();
      noise.start();
    }

    button.addEventListener('click', function () {
      var pressed = button.getAttribute('aria-pressed') === 'true';
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();

      var next = !pressed;
      var now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.linearRampToValueAtTime(next ? 0.55 : 0, now + (reduceMotion ? 0.02 : 1.4));

      button.setAttribute('aria-pressed', next ? 'true' : 'false');
      if (label) label.textContent = next ? 'Звук включён' : 'Звук выключен';
      track('sound_toggled', { state: next ? 'on' : 'off' });
    });
  }

  /* ── Галерея: лента со свайпом + полноэкранный просмотр ───────────────── */

  function initGallery() {
    var dataNode = document.querySelector('[data-gallery-data]');
    var lightbox = document.querySelector('[data-lightbox]');
    if (!lightbox || !dataNode) return;

    var items = [];
    try {
      items = JSON.parse(dataNode.textContent);
    } catch (error) {
      return;
    }
    if (!items.length) return;

    var image = lightbox.querySelector('[data-lightbox-image]');
    var caption = lightbox.querySelector('[data-lightbox-caption]');
    var index = 0;
    var lastFocused = null;

    function show(next) {
      index = (next + items.length) % items.length;
      var item = items[index];
      image.src = item.src;
      image.alt = item.alt || item.caption || '';
      caption.textContent = item.caption + (item.author ? ' · ' + item.author : '');
      trackSafe('gallery_viewed', { index: index, caption: item.caption });
    }

    function open(startIndex) {
      lastFocused = document.activeElement;
      show(startIndex);
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
      lightbox.querySelector('[data-lightbox-close]').focus();
    }

    function close() {
      lightbox.hidden = true;
      document.body.style.overflow = '';
      if (lastFocused) lastFocused.focus();
    }

    document.querySelectorAll('[data-gallery-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        open(Number(button.dataset.galleryOpen) || 0);
      });
    });

    lightbox.querySelector('[data-lightbox-close]').addEventListener('click', close);
    lightbox.querySelector('[data-lightbox-prev]').addEventListener('click', function () {
      show(index - 1);
    });
    lightbox.querySelector('[data-lightbox-next]').addEventListener('click', function () {
      show(index + 1);
    });

    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) close();
    });

    document.addEventListener('keydown', function (event) {
      if (lightbox.hidden) return;
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') show(index - 1);
      if (event.key === 'ArrowRight') show(index + 1);
    });

    // Свайп на мобильном внутри просмотрщика.
    var startX = null;
    lightbox.addEventListener(
      'touchstart',
      function (event) {
        startX = event.touches[0].clientX;
      },
      { passive: true }
    );
    lightbox.addEventListener(
      'touchend',
      function (event) {
        if (startX === null) return;
        var delta = event.changedTouches[0].clientX - startX;
        if (Math.abs(delta) > 45) show(delta < 0 ? index + 1 : index - 1);
        startX = null;
      },
      { passive: true }
    );
  }

  /* ── Утилиты форм ─────────────────────────────────────────────────────── */

  function fieldError(input, message) {
    if (!input) return;
    var errorId = (input.id || input.name) + '-error';
    var node = document.getElementById(errorId);
    if (!message) {
      input.removeAttribute('aria-invalid');
      if (node) node.remove();
      return;
    }
    if (!node) {
      node = document.createElement('p');
      node.id = errorId;
      node.className = 'field-error';
      input.insertAdjacentElement('afterend', node);
      var described = input.getAttribute('aria-describedby') || '';
      input.setAttribute('aria-describedby', (described + ' ' + errorId).trim());
    }
    node.textContent = message;
    input.setAttribute('aria-invalid', 'true');
  }

  function clearErrors(form) {
    form.querySelectorAll('[aria-invalid="true"]').forEach(function (input) {
      fieldError(input, '');
    });
  }

  /** Форматирование казахстанского номера без блокировки вставки. */
  function formatPhone(value) {
    var digits = String(value).replace(/\D/g, '');
    if (digits.startsWith('8')) digits = '7' + digits.slice(1);
    if (!digits.startsWith('7')) digits = '7' + digits;
    digits = digits.slice(0, 11);

    var out = '+7';
    if (digits.length > 1) out += ' ' + digits.slice(1, 4);
    if (digits.length >= 5) out += ' ' + digits.slice(4, 7);
    if (digits.length >= 8) out += ' ' + digits.slice(7, 9);
    if (digits.length >= 10) out += ' ' + digits.slice(9, 11);
    return out;
  }

  function initPhoneMask() {
    document.querySelectorAll('input[type="tel"]').forEach(function (input) {
      input.addEventListener('input', function () {
        var caretAtEnd = input.selectionStart === input.value.length;
        input.value = formatPhone(input.value);
        if (caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
      });
      input.addEventListener('blur', function () {
        if (input.value.replace(/\D/g, '').length <= 1) input.value = '';
      });
    });
  }

  function formatDateRu(iso) {
    if (!iso) return '—';
    var parts = iso.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    try {
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });
    } catch (error) {
      return iso;
    }
  }

  /* ── Мастер записи ────────────────────────────────────────────────────── */

  function initBooking() {
    var form = document.getElementById('booking-form');
    if (!form) return;

    var state = {
      step: 1,
      packageId: form.dataset.initialPackage || '',
      slot: null,
      startedAt: Date.now(),
      busy: false,
      // Ключ идемпотентности: защищает от двойной заявки при двойном клике
      // и при повторной отправке после сетевой ошибки.
      idempotencyKey:
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : 'k' + Date.now() + Math.random().toString(16).slice(2)
    };
    var steps = Array.prototype.slice.call(form.querySelectorAll('[data-step]'));
    var indicators = Array.prototype.slice.call(form.querySelectorAll('[data-progress-step]'));
    var slotPicker = form.querySelector('[data-slot-picker]');
    var slotStatus = form.querySelector('[data-slot-status]');
    var errorBox = form.querySelector('[data-form-error]');
    var submitBtn = form.querySelector('[data-submit]');
    var packageInput = form.querySelector('#packageId');
    var dateSelect = form.querySelector('#date');
    var timeInput = form.querySelector('#time');
    var guestsInput = form.querySelector('#guests');
    var success = document.querySelector('[data-success]');

    var summaryNodes = {
      package: document.querySelector('[data-summary-package]'),
      duration: document.querySelector('[data-summary-duration]'),
      date: document.querySelector('[data-summary-date]'),
      time: document.querySelector('[data-summary-time]'),
      guests: document.querySelector('[data-summary-guests]')
    };

    var initialSlot = form.dataset.initialSlot || '';

    function showStep(step) {
      state.step = step;
      steps.forEach(function (panel) {
        panel.classList.toggle('is-active', Number(panel.dataset.step) === step);
      });
      indicators.forEach(function (item) {
        var index = Number(item.dataset.progressStep);
        item.classList.toggle('is-active', index === step);
        item.classList.toggle('is-done', index < step);
      });
      if (step > 1) {
        var field = form.querySelector('[data-step="' + step + '"] input, [data-step="' + step + '"] select');
        if (field) field.focus({ preventScroll: true });
      }
    }

    function setError(message) {
      if (!errorBox) return;
      errorBox.textContent = message || '';
      errorBox.hidden = !message;
    }

    function syncSummary() {
      var chosen = form.querySelector('[data-package="' + state.packageId + '"]');
      if (summaryNodes.package) {
        summaryNodes.package.textContent = chosen
          ? chosen.querySelector('.package-option-name').textContent
          : '—';
      }
      if (summaryNodes.duration) {
        summaryNodes.duration.textContent = chosen ? chosen.dataset.packageDuration || '—' : '—';
      }
      if (summaryNodes.date) {
        summaryNodes.date.textContent = dateSelect.value ? formatDateRu(dateSelect.value) : '—';
      }
      if (summaryNodes.time) {
        summaryNodes.time.textContent = state.slot
          ? timeInput.value + (state.slot.crossesMidnight ? ' (после полуночи)' : '')
          : '—';
      }
      if (summaryNodes.guests) {
        summaryNodes.guests.textContent = guestsInput.value ? guestsInput.value + ' чел.' : '—';
      }
    }

    function selectPackage(button) {
      form.querySelectorAll('.package-option').forEach(function (other) {
        other.setAttribute('aria-checked', other === button ? 'true' : 'false');
      });
      state.packageId = button.dataset.package;
      packageInput.value = state.packageId;
      setError('');
      syncSummary();
      track('quest_selected', { package: state.packageId });
    }

    form.querySelectorAll('.package-option').forEach(function (button) {
      button.addEventListener('click', function () {
        selectPackage(button);
      });
    });

    if (state.packageId) {
      var preset = form.querySelector('[data-package="' + state.packageId + '"]');
      if (preset) preset.setAttribute('aria-checked', 'true');
    }

    function validateStep1() {
      if (!packageInput.value) {
        setError('Выберите пакет — от него зависит время и цена.');
        return false;
      }
      setError('');
      return true;
    }

    function loadSlots(date) {
      slotPicker.innerHTML = '<p class="slot-hint">Загружаем свободные слоты…</p>';
      if (slotStatus) slotStatus.textContent = '';

      fetch('/api/availability?date=' + encodeURIComponent(date), { headers: { accept: 'application/json' } })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(renderSlots)
        .catch(function () {
          slotPicker.innerHTML =
            '<p class="slot-hint">Не удалось загрузить слоты. Данные формы сохранены — обновите страницу или напишите в WhatsApp.</p>';
          if (slotStatus) slotStatus.textContent = 'Ошибка сети.';
        });
    }

    function renderSlots(data) {
      var open = data.slots.filter(function (slot) {
        return slot.status === 'open' || slot.status === 'held';
      });

      if (!open.length) {
        slotPicker.innerHTML = '<p class="slot-hint">На этот день свободных слотов нет. Выберите другой игровой день.</p>';
        timeInput.value = '';
        state.slot = null;
        syncSummary();
        return;
      }

      slotPicker.innerHTML = open
        .map(function (slot) {
          return (
            '<button type="button" class="slot-btn" role="radio" aria-checked="false" data-slot="' +
            slot.time +
            '">' +
            '<span>' +
            slot.time +
            '</span>' +
            (slot.crossesMidnight ? '<small>после полуночи</small>' : '') +
            '</button>'
          );
        })
        .join('');

      if (slotStatus) {
        slotStatus.textContent =
          'Свободно: ' + open.filter(function (s) { return s.status === 'open'; }).length + '. Таймзона ' + data.timezone + '.';
      }

      var buttons = Array.prototype.slice.call(slotPicker.querySelectorAll('.slot-btn'));

      function select(button) {
        buttons.forEach(function (other) {
          other.setAttribute('aria-checked', other === button ? 'true' : 'false');
        });
        timeInput.value = button.dataset.slot;
        state.slot = open.filter(function (slot) { return slot.time === button.dataset.slot; })[0] || null;
        setError('');
        syncSummary();
        track('time_selected', { date: dateSelect.value, time: button.dataset.slot, crosses_midnight: Boolean(state.slot && state.slot.crossesMidnight) });
      }

      buttons.forEach(function (button, index) {
        button.setAttribute('tabindex', index === 0 ? '0' : '-1');
        button.addEventListener('click', function () {
          select(button);
        });
        button.addEventListener('keydown', function (event) {
          var keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
          if (keys.indexOf(event.key) === -1) return;
          event.preventDefault();
          var delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
          var target = buttons[(index + delta + buttons.length) % buttons.length];
          target.focus();
          select(target);
        });
      });

      if (initialSlot) {
        var wanted = buttons.filter(function (button) { return button.dataset.slot === initialSlot; })[0];
        if (wanted) {
          select(wanted);
          initialSlot = '';
        }
      } else if (state.slot) {
        var previous = buttons.filter(function (button) { return button.dataset.slot === state.slot.time; })[0];
        if (previous) select(previous);
      }
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
      var guests = Number(guestsInput.value);

      if (name.value.trim().length < 2) {
        fieldError(name, 'Укажите имя.');
        ok = false;
      }
      if (String(phone.value).replace(/\D/g, '').length < 11) {
        fieldError(phone, 'Телефон в формате +7 700 000 00 00.');
        ok = false;
      }
      if (!Number.isFinite(guests) || guests < 1 || guests > 30) {
        fieldError(guestsInput, 'Укажите количество гостей от 1 до 30.');
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
        track('booking_step', { step: target });
      }
      if (back) showStep(Number(back.dataset.back));
    });

    dateSelect.addEventListener('change', function () {
      state.slot = null;
      timeInput.value = '';
      syncSummary();
      loadSlots(dateSelect.value);
      track('date_selected', { date: dateSelect.value });
    });

    guestsInput.addEventListener('input', syncSummary);

    var submitted = false;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (state.busy || submitted) return;
      if (!validateStep2()) {
        showStep(2);
        return;
      }
      if (!validateStep3()) return;

      state.busy = true;
      setError('');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем…';
      }

      var payload = {
        packageId: packageInput.value,
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
        formStartedAt: state.startedAt,
        idempotencyKey: state.idempotencyKey
      };

      trackSafe('booking_submitted', { package: payload.packageId, date: payload.date, time: payload.time, guests: payload.guests });

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
            onFailure(result.data);
            return;
          }
          onSuccess(result.data);
        })
        .catch(function () {
          setError(
            'Не удалось отправить заявку: нет связи с сервером. Данные сохранены в форме — ' +
              'нажмите «Забронировать» ещё раз или напишите нам в WhatsApp.'
          );
          track('booking_error', { reason: 'network' });
          restore();
        });
    });

    function restore() {
      state.busy = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Забронировать';
      }
    }

    function onFailure(data) {
      var message = data.message || 'Не удалось отправить заявку.';
      if (data.errors) {
        Object.keys(data.errors).forEach(function (field) {
          var input = form.querySelector('#' + field) || form.querySelector('[name="' + field + '"]');
          if (input) fieldError(input, data.errors[field]);
        });
      }
      if (data.code === 'slot_taken' || data.code === 'slot_blocked') {
        message =
          data.code === 'slot_taken'
            ? 'Это время только что заняли. Выберите другое — данные формы сохранены.'
            : 'Это время закрыто. Выберите другое — данные формы сохранены.';
        showStep(2);
        loadSlots(dateSelect.value);
      } else if (data.code === 'rate_limited') {
        message = 'Слишком много заявок с одного адреса. Напишите в WhatsApp — ответим быстрее.';
      } else if (data.code === 'in_past' || data.code === 'off_grid' || data.code === 'outside_shift') {
        showStep(2);
        loadSlots(dateSelect.value);
      }
      setError(message);
      track('booking_error', { code: data.code || 'unknown' });
      restore();
    }

    function onSuccess(data) {
      submitted = true;
      state.busy = false;
      form.hidden = true;
      var card = document.querySelector('.summary-card');
      if (card) card.hidden = true;

      var booking = data.booking;
      function setText(selector, value) {
        var node = document.querySelector(selector);
        if (node) node.textContent = value == null ? '—' : String(value);
      }

      setText('[data-success-ref]', booking.reference);
      setText('[data-success-package]', booking.packageName || '—');
      setText('[data-success-date]', booking.dateLabel);
      setText('[data-success-time]', booking.startTime + (booking.crossesMidnight ? ' (после полуночи)' : ''));
      setText('[data-success-guests]', booking.guests + ' чел.');

      var note = document.querySelector('[data-success-note]');
      if (note) {
        note.textContent =
          'Администратор свяжется с вами в ' +
          (booking.messengerLabel || 'выбранном канале') +
          ' и подтвердит заявку. Номер — ' +
          booking.reference +
          '. Цену подтвердит администратор: на сайте она не фиксируется.' +
          (data.demoMode
            ? ' ВНИМАНИЕ: это демонстрационный стенд — заявка не сохранена и администратору не отправлена.'
            : '');
      }

      var wa = document.querySelector('[data-success-whatsapp]');
      if (wa && data.notification && data.notification.manualWhatsappLink) {
        wa.href = data.notification.manualWhatsappLink;
      }

      if (success) {
        success.hidden = false;
        success.focus();
        success.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      }
      track('booking_success', { package: booking.packageId, date: booking.businessDate, time: booking.startTime });
    }

    // Первичная синхронизация и загрузка слотов.
    if (dateSelect.value) loadSlots(dateSelect.value);
    if (!state.packageId) {
      var first = form.querySelector('.package-option');
      if (first) {
        state.packageId = first.dataset.package;
        packageInput.value = state.packageId;
        first.setAttribute('aria-checked', 'true');
      }
    }
    syncSummary();
    showStep(1);
  }

  /* ── Статус заявки ────────────────────────────────────────────────────── */

  function initStatus() {
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
        .then(function (payload) {
          if (payload.status >= 400 || !payload.data.ok) {
            errorBox.textContent = payload.data.message || 'Заявка не найдена.';
            errorBox.hidden = false;
            return;
          }
          var booking = payload.data.booking;
          function setText(selector, value) {
            var node = document.querySelector(selector);
            if (node) node.textContent = value == null ? '—' : String(value);
          }
          setText('[data-result-ref]', booking.reference);
          setText('[data-result-status]', booking.statusLabel);
          setText('[data-result-package]', booking.packageName);
          setText('[data-result-date]', booking.dateLabel);
          setText('[data-result-time]', booking.startTime + (booking.crossesMidnight ? ' (после полуночи)' : ''));
          setText('[data-result-guests]', booking.guests + ' чел.');
          if (result) result.hidden = false;
        })
        .catch(function () {
          errorBox.textContent = 'Ошибка сети. Попробуйте ещё раз.';
          errorBox.hidden = false;
        });
    });
  }

  /* ── Клики по контактам ───────────────────────────────────────────────── */

  function initCtaTracking() {
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href]');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      if (href.startsWith('tel:')) track('phone_clicked', { from: link.dataset.cta || 'link' });
      else if (/wa\.me|whatsapp/i.test(href)) track('whatsapp_clicked', { from: link.dataset.cta || 'link' });
      else if (/instagram\.com/i.test(href)) track('instagram_clicked', { from: link.dataset.cta || 'link' });
      else if (/2gis|directions/i.test(href)) track('route_clicked', { from: link.dataset.cta || 'link' });
      else if (href === '/booking') track('booking_started', { from: link.dataset.cta || 'link' });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    track('page_view', { path: location.pathname });
    // Отдельное событие для страницы локации — по списку из брифа.
    if (location.pathname === '/quests') track('quest_view', { path: location.pathname });
    initNav();
    initHero();
    initReveal();
    initGallery();
    initSound();
    initContactBar();
    initPhoneMask();
    initBooking();
    initStatus();
    initCtaTracking();
  });
})();
