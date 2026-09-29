'use strict';

/**
 * Аудит записи: граничные случаи, которые не покрывают основные тесты.
 * Запуск: node tools/audit-booking.js
 */

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const time = require('../src/lib/time');
const results = [];

// Каждому сценарию — свой адрес. Иначе anti-spam считает их одним клиентом
// и через несколько POST отдаёт 429, из-за чего проверка падает не по делу.
let scenarioIp = 0;

function nextIp() {
  scenarioIp += 1;
  return '10.0.0.' + scenarioIp;
}

function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function api(path, options) {
  const res = await fetch(BASE + path, options);
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  return { status: res.status, json };
}

/** POST заявки от отдельного «клиента» — свой X-Forwarded-For на сценарий. */
function postBooking(body, ip) {
  return api('/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || nextIp() },
    body: JSON.stringify(body)
  });
}

function payload(overrides) {
  return Object.assign(
    {
      packageId: 'paket-horror',
      date: '',
      time: '',
      guests: 2,
      name: 'Тест Аудит',
      phone: '+7 700 111 22 33',
      messenger: 'whatsapp',
      comment: '',
      consent: true,
      source: 'audit',
      formStartedAt: Date.now() - 9000,
      idempotencyKey: 'audit-' + Math.random().toString(16).slice(2)
    },
    overrides
  );
}

async function firstOpen(date) {
  const r = await api('/api/availability?date=' + date);
  if (!r.json || !r.json.slots) return null;
  return r.json.slots.find((s) => s.available) || null;
}

async function anyOpen(cal) {
  for (const day of cal.json.days || []) {
    const slot = (day.slots || []).find((s) => s.available);
    if (slot) return { date: day.businessDate, time: slot.time };
  }
  return null;
}

module.exports = { api, payload, firstOpen, anyOpen, check, results, BASE };

/* Сценарии запускаются только при прямом вызове файла. */
if (require.main === module) {
  (async () => {
    console.log('\nFANTOM — аудит записи\n');

    const cal = await api('/api/calendar?days=10');
    const target = await anyOpen(cal);
    console.log(`  Свободный слот для тестов: ${target ? target.date + ' ' + target.time : 'НЕТ'}`);
    if (!target) {
      console.log('  Нет свободных слотов — аудит невозможен.\n');
      process.exit(1);
    }

    /* 1. endTime должен считаться по местному времени, а не в UTC. */
    {
      const r = await postBooking(payload(target));
      const b = r.json && r.json.booking;
      if (!b) {
        check('Бронь создаётся на свободный слот', false, 'статус ' + r.status);
      } else {
        const diffMin = Math.round((new Date(b.endIso) - new Date(b.startIso)) / 60000);
        check('Длительность брони совпадает с длительностью квеста', diffMin === b.durationMinutes, diffMin + ' мин');
        // Сравнивать endTime > startTime строкой нельзя: слот 23:00 заканчивается
        // в 00:00 следующих суток, и «00:00» меньше «23:00». Раньше такая проверка
        // объявляла исправный сервер сломанным. Ориентируемся на моменты времени.
        check(
          'endTime отражает местное время, а не UTC',
          new Date(b.endIso) > new Date(b.startIso) &&
            time.utcToZoned(b.timezone, new Date(b.endIso)).time === b.endTime,
          'startTime=' + b.startTime + ', endTime=' + b.endTime +
            (b.crossesMidnight ? ' (ночной слот)' : '')
        );
        console.log('    ответ сервера: ' + JSON.stringify({
          startTime: b.startTime, endTime: b.endTime, startIso: b.startIso, endIso: b.endIso
        }));
      }
    }

    /* 2. Второе бронирование с тем же ключом на другой слот. */
    {
      const cal2 = await api('/api/calendar?days=10');
      const others = (cal2.json.days || [])
        .flatMap((d) => d.slots.filter((s) => s.available).map((s) => ({ date: d.businessDate, time: s.time })));
      // Слот из сценария 1 уже занят, поэтому берём два свежих. Раньше здесь
      // использовался target, и первая заявка возвращала 409: инструмент
      // падал на undefined вместо проверки идемпотентности.
      const [firstSlot, secondSlot] = others.filter(
        (s) => !(s.date === target.date && s.time === target.time)
      );
      if (!firstSlot || !secondSlot) {
        check('Повтор с тем же idempotencyKey не создаёт вторую заявку', false, 'нет двух свободных слотов');
      } else {
        const key = 'audit-dup-' + Date.now();
        const ip = nextIp();
        const first = await postBooking(payload(Object.assign({ idempotencyKey: key }, firstSlot)), ip);
        const second = await postBooking(payload(Object.assign({ idempotencyKey: key }, secondSlot)), ip);
        // Ключ идемпотентности означает «тот же самый запрос»: повтор с тем же
        // ключом обязан вернуть первую заявку, даже если поля отличаются.
        // Раньше проверка утверждала обратное и «находила» ошибку в коде,
        // который работает правильно.
        const refA = first.json?.booking?.reference;
        const refB = second.json?.booking?.reference;
        check(
          'Повтор с тем же idempotencyKey возвращает первую заявку',
          Boolean(refA && refB && refA === refB) && second.json.duplicate === true,
          (refA || 'нет ответа ' + first.status) + ' / ' + (refB || 'нет ответа ' + second.status) +
            ', duplicate=' + second.json?.duplicate
        );
      }
    }

    /* 3. Гостей больше, чем разрешает сервер (клиент даёт до 30). */
    {
      const cal3 = await api('/api/calendar?days=10');
      const slot = await anyOpen(cal3);
      const r = await postBooking(payload(Object.assign({ guests: 25 }, slot)));
      check(
        'Лимит гостей проверяется сервером',
        r.status === 422,
        'гостей 25 → статус ' + r.status + (r.json && r.json.errors ? ', ' + r.json.errors.guests : '')
      );
    }

    /* 4. Ник в Telegram кириллицей: клиент пропустит, сервер отклонит. */
    {
      const cal4 = await api('/api/calendar?days=10');
      const slot = await anyOpen(cal4);
      const r = await postBooking(payload(Object.assign({ messenger: 'telegram', messengerNick: 'Иван_Петров' }, slot)));
      check('Кириллица в нике Telegram отклоняется сервером', r.status === 422, 'статус ' + r.status);
    }

    /* 5. Утренний слот сегодняшнего дня — в прошлом. */
    {
      const cal5 = await api('/api/calendar?days=1');
      const today = (cal5.json.days || [])[0];
      if (!today) {
        check('Прошедшее время отклоняется', false, 'календарь не вернул ни одного дня');
      } else {
        const r = await postBooking(payload({ date: today.businessDate, time: '09:00' }));
        check(
          'Прошедшее время отклоняется',
          r.status === 409,
          'статус ' + r.status + ', код ' + (r.json && r.json.code)
        );
      }
    }

    /* 6. Повторный клик «Забронировать» в рамках одной страницы. */
    {
      const cal6 = await api('/api/calendar?days=10');
      const slot = await anyOpen(cal6);
      const key = 'audit-same-' + Date.now();
      const ip = nextIp();
      const post = () => postBooking(payload(Object.assign({ idempotencyKey: key }, slot)), ip);
      const [a, b] = await Promise.all([post(), post()]);
      const refA = a.json?.booking?.reference;
      const refB = b.json?.booking?.reference;
      check(
        'Двойная отправка по одному клику создаёт одну заявку',
        Boolean(refA && refB && refA === refB),
        (refA || 'нет ответа ' + a.status) + ' / ' + (refB || 'нет ответа ' + b.status)
      );
    }

    console.log('\n' + '-'.repeat(72));
    const failed = results.filter((r) => !r.ok);
    console.log('  Проверок: ' + results.length + '   провалено: ' + failed.length);
    console.log('-'.repeat(72) + '\n');
    process.exit(failed.length ? 1 : 0);
  })();
}

