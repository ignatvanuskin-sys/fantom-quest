/* FANTOM — движок появления блоков.

   Отдельно от app.js: здесь только движение. Прикладная логика (навигация,
   галерея, запись) лежит в app.js и работает независимо — если этот файл не
   загрузится, все блоки останутся видимыми и читаемыми, потому что скрытое
   состояние включается классом .fx-on только отсюда.

   Что делает:
     1) появление блоков при прокрутке (rise / fade / signal);
     2) ставит .fx-lite на экономном режиме, чтобы движение не тратило батарею.

   Чего не делает: не запускает звук, не следит за курсором, не рисует canvas,
   не меняет данные, не пишет в разметку ничего, кроме классов и одной
   CSS-переменной. */

(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function motionAllowed() {
    return !reduceQuery.matches;
  }

  /* ── Экономный режим ──────────────────────────────────────────────────────
     Экономия трафика и слабые устройства не получают движение вовсе:
     блоки просто появляются, без задержек и сдвигов. */

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
      var index = counter.get(parent) || 0;
      counter.set(parent, index + 1);
      node.style.setProperty('--fx-i', String(Math.min(index, 6)));
    });
  }

  function show(node) {
    node.classList.add('is-in');
  }

  function initReveal() {
    var nodes = doc.querySelectorAll('[data-fx]');
    if (!nodes.length) return;

    if (!motionAllowed() || isLite()) {
      for (var i = 0; i < nodes.length; i += 1) show(nodes[i]);
      return;
    }

    root.classList.add('fx-on');
    setStagger(nodes);

    if (!('IntersectionObserver' in window)) {
      for (var n = 0; n < nodes.length; n += 1) show(nodes[n]);
      return;
    }

    revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          show(entry.target);
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.05 }
    );

    for (var m = 0; m < nodes.length; m += 1) revealObserver.observe(nodes[m]);
  }

  /* ── Запуск ───────────────────────────────────────────────────────────── */

  function boot() {
    if (isLite()) root.classList.add('fx-lite');
    initReveal();
  }

  /* Системная настройка может измениться на ходу. Показываем всё, что было
     скрыто, и снимаем .fx-on, чтобы скрытое состояние перестало действовать. */
  function applyPreference() {
    if (motionAllowed()) return;
    root.classList.remove('fx-on');
    var hidden = doc.querySelectorAll('[data-fx]:not(.is-in)');
    for (var i = 0; i < hidden.length; i += 1) show(hidden[i]);
  }

  if (typeof reduceQuery.addEventListener === 'function') {
    reduceQuery.addEventListener('change', applyPreference);
  } else if (typeof reduceQuery.addListener === 'function') {
    reduceQuery.addListener(applyPreference);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();