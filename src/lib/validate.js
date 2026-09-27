'use strict';

const config = require('../config');

/** HTML-экранирование для серверного рендера. */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Экранирование для вставки в JSON внутри <script>. */
function escJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function stripControl(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function cleanString(value, maxLength = 200) {
  if (value === null || value === undefined) return '';
  return stripControl(String(value)).trim().slice(0, maxLength);
}

/**
 * Нормализация телефона Казахстана/России к формату +7XXXXXXXXXX.
 * Принимает +7..., 8..., с пробелами, скобками и дефисами.
 * @returns {{ok: boolean, value?: string, error?: string}}
 */
function normalizePhone(input) {
  const raw = cleanString(input, 40);
  if (!raw) return { ok: false, error: 'Укажите номер телефона.' };
  const digits = raw.replace(/\D/g, '');
  let national = null;
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    national = digits.slice(1);
  } else if (digits.length === 10 && digits.startsWith('7')) {
    national = digits;
  } else if (digits.length === 10) {
    national = digits;
  }
  if (!national || national.length !== 10) {
    return { ok: false, error: 'Телефон укажите в формате +7 700 000 00 00.' };
  }
  return { ok: true, value: '+7' + national };
}

function formatPhone(e164) {
  if (typeof e164 !== 'string' || !/^\+7\d{10}$/.test(e164)) return e164 || '';
  const n = e164.slice(2);
  return `+7 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8, 10)}`;
}

const MESSENGERS = ['whatsapp', 'telegram', 'call'];
const MESSENGER_LABELS = { whatsapp: 'WhatsApp', telegram: 'Telegram', call: 'Звонок' };

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

/**
 * Валидация заявки на бронирование.
 * Возвращает {ok, errors: {field: message}, value: очищенные данные}.
 */
function validateBooking(payload, options = {}) {
  const errors = {};
  const value = {};

  value.questId = cleanString(payload.questId, 80);
  if (!value.questId) errors.questId = 'Выберите сценарий.';

  value.date = cleanString(payload.date, 10);
  if (!value.date) errors.date = 'Выберите дату.';

  value.time = cleanString(payload.time, 5);
  if (!value.time) errors.time = 'Выберите время.';

  const guestsRaw = payload.guests;
  const guests = Number.parseInt(guestsRaw, 10);
  const { minGuestsPerBooking, maxGuestsPerBooking } = config.booking;
  if (!Number.isFinite(guests)) {
    errors.guests = 'Укажите количество игроков.';
  } else if (guests < minGuestsPerBooking || guests > maxGuestsPerBooking) {
    errors.guests = `Количество игроков — от ${minGuestsPerBooking} до ${maxGuestsPerBooking}. Точный состав подтвердит администратор.`;
  } else {
    value.guests = guests;
  }

  value.name = cleanString(payload.name, config.form.maxNameLength);
  if (value.name.length < 2) errors.name = 'Укажите имя, по которому к вам обращаться.';

  const phone = normalizePhone(payload.phone);
  if (!phone.ok) errors.phone = phone.error;
  else value.phone = phone.value;

  value.messenger = cleanString(payload.messenger, 20).toLowerCase();
  if (!MESSENGERS.includes(value.messenger)) {
    errors.messenger = 'Выберите удобный канал связи: WhatsApp, Telegram или звонок.';
  }

  value.comment = cleanString(payload.comment, config.form.maxCommentLength);

  const consent = payload.consent === true || payload.consent === 'true' || payload.consent === 'on';
  if (!consent) {
    errors.consent = 'Без согласия на обработку данных мы не можем принять заявку.';
  } else {
    value.consent = true;
  }

  value.source = cleanString(payload.source, 60) || 'website';
  value.formStartedAt = Number.isFinite(Number(payload.formStartedAt)) ? Number(payload.formStartedAt) : null;

  // Anti-spam: honeypot-поле должно остаться пустым.
  const honeypot = cleanString(payload.website || payload.company || '', 100);
  if (honeypot) {
    return { ok: false, spam: true, errors: { form: 'Заявка отклонена.' }, value };
  }

  // Anti-spam: слишком быстрое заполнение формы.
  if (options.enforceFillTime !== false && value.formStartedAt) {
    const seconds = (Date.now() - value.formStartedAt) / 1000;
    if (seconds >= 0 && seconds < config.form.minFillSeconds) {
      return { ok: false, spam: true, errors: { form: 'Форма отправлена слишком быстро. Попробуйте ещё раз.' }, value };
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, value };
}

module.exports = {
  esc,
  escJson,
  cleanString,
  stripControl,
  normalizePhone,
  formatPhone,
  isValidEmail,
  validateBooking,
  MESSENGERS,
  MESSENGER_LABELS
};
