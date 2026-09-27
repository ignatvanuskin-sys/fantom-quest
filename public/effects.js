/* FANTOM — движок атмосферных эффектов.

   Отдельно от app.js: здесь только свет и движение. Прикладная логика
   (навигация, запись, галерея, звук) лежит в app.js и работает независимо —
   если этот файл не загрузится, все блоки останутся видимыми и читаемыми,
   потому что скрытое состояние включается классом .fx-on только отсюда.

   Что делает:
     1) появление блоков при прокрутке (rise / wipe / fade / signal);
     2) фонарь, следующий за курсором (только мышь, только десктоп);
     3) свет на карточках под курсором;
     4) магнит для главных кнопок;
     5) поле «чернил» под hero на canvas;
     6) табло времени кадра.

   Чего не делает: не запускает звук, не меняет данные, не пишет в разметку
   ничего, кроме классов и CSS-переменных, не трогает вёрстку. */

(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

  function motionAllowed() {
    return !reduceQuery.matches;
  }

  /* ── Экономный режим ──────────────────────────────────────────────────────
     Экономия трафика и слабые устройства не получают canvas и свет:
     анимаций вроде появления блоков достаточно. */

  function isLite() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection && connection.saveData) return true;
    var memory = navigator.deviceMemory;
    if (typeof memory === 'number' && memory <= 2) return true;
    return false;
  }

  /* ── Появление блоков ─────────────────────────────────────────────────── */

  var revealObserver = null;

  /**
   * Номер элемента внутри его группы. Нужен, чтобы блоки одной секции
   * появлялись по очереди, а не все одновременно: --fx-i попадает в
   * transition-delay (см. effects.css).
   */
  function setStagger(nodes) {
    var counter = new Map();
    nodes.forEach(function (node) {
      var parent = node.parentElement || doc.body;
      var key = parent;
      var index = counter.get(key) || 0;
      counter.set(key, index + 1);
      node.style.setProperty('--fx-i', String(Math.min(index, 6)));
    });
  }

  function initReveal() {
    var nodes = doc.querySelectorAll('[data-fx]');
    if (!nodes.length) return;

    root.classList.add('fx-on');
    setStagger(nodes);

    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < nodes.length; i += 1) nodes[i].classList.add('is-in');
      return;
    }

    revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );

    for (var n = 0; n < nodes.length; n += 1) revealObserver.observe(nodes[n]);
  }

  /* ── Фонарь за курсором ───────────────────────────────────────────────── */

  function initTorch() {
    if (!hoverQuery.matches) return;

    var torch = doc.createElement('div');
    torch.className = 'fx-torch';
    torch.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(torch);

    var x = -900;
    var y = -900;
    var pending = false;

    function apply() {
      pending = false;
      torch.style.setProperty('--fx-x', x.toFixed(1) + 'px');
      torch.style.setProperty('--fx-y', y.toFixed(1) + 'px');
    }

    window.addEventListener(
      'pointermove',
      function (event) {
        if (event.pointerType !== 'mouse') return;
        x = event.clientX;
        y = event.clientY;
        if (torch.classList.contains('is-live') === false) torch.classList.add('is-live');
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(apply);
      },
      { passive: true }
    );

    // Курсор ушёл за пределы окна — свет гаснет, чтобы не висел в углу.
    doc.addEventListener('mouseleave', function () {
      torch.classList.remove('is-live');
    });
  }

  /* ── Свет на карточках и магнит для кнопок ────────────────────────────── */

  function initSpotlight() {
    if (!hoverQuery.matches) return;

    var nodes = doc.querySelectorAll('[data-fx-spot]');
    for (var i = 0; i < nodes.length; i += 1) {
      (function (node) {
        var pending = false;
        var mx = 0;
        var my = 0;

        function apply() {
          pending = false;
          node.style.setProperty('--fx-mx', mx.toFixed(1) + 'px');
          node.style.setProperty('--fx-my', my.toFixed(1) + 'px');
        }

        node.addEventListener(
          'pointermove',
          function (event) {
            if (event.pointerType !== 'mouse') return;
            var rect = node.getBoundingClientRect();
            mx = event.clientX - rect.left;
            my = event.clientY - rect.top;
            if (pending) return;
            pending = true;
            window.requestAnimationFrame(apply);
          },
          { passive: true }
        );
      })(nodes[i]);
    }
  }

  function initMagnetic() {
    if (!hoverQuery.matches) return;

    var nodes = doc.querySelectorAll('[data-fx-magnetic]');
    var pull = 0.26;
    var limit = 7;

    for (var i = 0; i < nodes.length; i += 1) {
      (function (node) {
        var pending = false;
        var dx = 0;
        var dy = 0;

        function apply() {
          pending = false;
          node.style.transform = 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0)';
        }

        node.addEventListener(
          'pointermove',
          function (event) {
            if (event.pointerType !== 'mouse') return;
            var rect = node.getBoundingClientRect();
            dx = Math.max(-limit, Math.min(limit, (event.clientX - (rect.left + rect.width / 2)) * pull));
            dy = Math.max(-limit, Math.min(limit, (event.clientY - (rect.top + rect.height / 2)) * pull));
            if (!node.classList.contains('is-magnet')) node.classList.add('is-magnet');
            if (pending) return;
            pending = true;
            window.requestAnimationFrame(apply);
          },
          { passive: true }
        );

        node.addEventListener('pointerleave', function () {
          dx = 0;
          dy = 0;
          node.classList.remove('is-magnet');
          node.style.transform = '';
        });
      })(nodes[i]);
    }
  }

  /* ── Чернила под hero ─────────────────────────────────────────────────────
     Написано на canvas 2D, а не на WebGL: нужен ровно один медленный слой
     света, а шейдер с буферами и контекстом на слабом телефоне дороже, чем
     весь остальной сайт. Размытие делает CSS (filter: blur), поэтому canvas
     рисуется в половинном разрешении и почти ничего не стоит. */

  function initInk() {
    var canvas = doc.querySelector('[data-fx-ink]');
    if (!canvas || !canvas.getContext) return;

    var context = canvas.getContext('2d');
    if (!context) return;

    var host = canvas.parentElement;
    var BLOBS = 7;
    /*
     * Разрешение и частота зависят от экрана. На телефоне blur пересчитывается
     * каждый кадр, поэтому там canvas рисуется мельче (0.34) и реже (18 к/с):
     * пятно света всё равно размыто на десятки пикселей, разницы не видно,
     * а работа GPU падает примерно втрое.
     */
    var narrow = window.innerWidth < 700;
    var SCALE = narrow ? 0.34 : 0.5;
    var FPS = narrow ? 18 : 26;
    var blobs = [];
    var width = 0;
    var height = 0;
    var raf = null;
    var last = 0;
    var visible = true;

    function seed() {
      blobs = [];
      for (var i = 0; i < BLOBS; i += 1) {
        blobs.push({
          x: Math.random(),
          y: 0.2 + Math.random() * 0.6,
          r: 0.22 + Math.random() * 0.26,
          speed: 0.006 + Math.random() * 0.012,
          phase: Math.random() * Math.PI * 2,
          drift: 0.04 + Math.random() * 0.1,
          alpha: i === 0 ? 0.34 : 0.14 + Math.random() * 0.16,
          hot: i % 3 !== 2
        });
      }
    }

    function resize() {
      var rect = host.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width * SCALE));
      height = Math.max(1, Math.round(rect.height * SCALE));
      canvas.width = width;
      canvas.height = height;
    }

    function draw(time) {
      context.clearRect(0, 0, width, height);
      var radiusBase = Math.max(width, height);

      for (var i = 0; i < blobs.length; i += 1) {
        var blob = blobs[i];
        var angle = time * blob.speed + blob.phase;
        var cx = (blob.x + Math.cos(angle) * blob.drift) * width;
        var cy = (blob.y + Math.sin(angle * 0.7) * blob.drift * 0.8) * height;
        var radius = blob.r * radiusBase * (0.86 + Math.sin(angle * 1.3) * 0.14);
        var color = blob.hot ? '216, 31, 38' : '86, 92, 96';
        var gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, 'rgba(' + color + ',' + blob.alpha.toFixed(3) + ')');
        gradient.addColorStop(0.55, 'rgba(' + color + ',' + (blob.alpha * 0.32).toFixed(3) + ')');
        gradient.addColorStop(1, 'rgba(' + color + ',0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    function loop(time) {
      raf = null;
      if (!visible || doc.hidden) return;
      if (time - last < 1000 / FPS) {
        raf = window.requestAnimationFrame(loop);
        return;
      }
      last = time;
      draw(time / 1000);
      raf = window.requestAnimationFrame(loop);
    }

    function start() {
      if (raf === null && visible && !doc.hidden) raf = window.requestAnimationFrame(loop);
    }

    function stop() {
      if (raf !== null) {
        window.cancelAnimationFrame(raf);
        raf = null;
      }
    }

    seed();
    resize();
    draw(0);

    if ('ResizeObserver' in window) {
      var resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
    } else {
      window.addEventListener('resize', resize);
    }

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          visible = entries[0].isIntersecting;
          if (visible) start();
          else stop();
        },
        { threshold: 0.01 }
      );
      observer.observe(host);
    } else {
      visible = true;
    }

    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) stop();
      else start();
    });

    start();
  }

  /* ── Табло времени кадра ───────────────────────────────────────────────── */

  function initClock() {
    var nodes = doc.querySelectorAll('[data-fx-clock]');
    if (!nodes.length) return;

    function paint() {
      if (doc.hidden) return;
      var now = new Date();
      var text =
        String(now.getHours()).padStart(2, '0') +
        ':' +
        String(now.getMinutes()).padStart(2, '0') +
        ':' +
        String(now.getSeconds()).padStart(2, '0');
      for (var i = 0; i < nodes.length; i += 1) nodes[i].textContent = text;
    }

    paint();
    window.setInterval(paint, 1000);
  }

  /* ── Запуск ───────────────────────────────────────────────────────────── */

  function boot() {
    if (isLite()) root.classList.add('fx-lite');

    initReveal();
    initClock();

    // Свет и курсорные эффекты — только когда движение разрешено и это не
    // экономный режим. Остальное (появление блоков) остаётся.
    if (!motionAllowed() || root.classList.contains('fx-lite')) return;

    initInk();
    initTorch();
    initSpotlight();
    initMagnetic();
  }

  /* Системная настройка может измениться на ходу. Полностью переинициализировать
     движок дороже, чем переключить классы: показываем всё, что было скрыто. */
  function applyPreference() {
    if (motionAllowed()) return;
    var hidden = doc.querySelectorAll('[data-fx]:not(.is-in)');
    for (var i = 0; i < hidden.length; i += 1) hidden[i].classList.add('is-in');
    var torch = doc.querySelector('.fx-torch');
    if (torch) torch.classList.remove('is-live');
  }

  if (typeof reduceQuery.addEventListener === 'function') {
    reduceQuery.addEventListener('change', applyPreference);
  } else if (typeof reduceQuery.addListener === 'function') {
    reduceQuery.addListener(applyPreference);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
