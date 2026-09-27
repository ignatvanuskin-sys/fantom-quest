'use strict';

/**
 * Уведомления администратору о новой заявке.
 *
 * MVP-каналы:
 *   1. Telegram Bot API — основной автоматический канал.
 *   2. Универсальный webhook (CRM / n8n / Make).
 *   3. E-mail через HTTP-релей (Resend / SendGrid / Mailgun) — SMTP без
 *      зависимостей не поддержать, см. README.
 *
 * WhatsApp: НЕ отправляем автоматически. Промпт прямо запрещает обещать
 * автоотправку без WhatsApp Business API / Twilio / 360dialog. Вместо этого
 * администратору отдаётся готовый deep link wa.me — подтверждение вручную.
 *
 * MOCK_MODE=true (по умолчанию): ничего не уходит наружу, все сообщения
 * пишутся в лог и возвращаются в ответе. Реальный бизнес не получает
 * тестовые заявки.
 */

const config = require('../config');

function bookingMessage(booking, siteUrl) {
  const lines = [
    `НОВАЯ ЗАЯВКА ${booking.reference}`,
    '',
    `Сценарий: ${booking.questName}`,
    `Игровой день: ${booking.businessDate}`,
    `Время: ${booking.startTime}${booking.startTime < '09:00' ? ' (после полуночи)' : ''} — ${booking.endTime}`,
    `Таймзона: ${booking.timezone}`,
    `Игроков: ${booking.guests}`,
    '',
    `Имя: ${booking.name}`,
    `Телефон: ${booking.phone}`,
    `Связь: ${booking.messengerLabel}`,
    booking.comment ? `Комментарий: ${booking.comment}` : null,
    '',
    `Цена: уточняется у администратора`,
    `Согласие на обработку данных: ${booking.consentAt}`,
    `Источник: ${booking.source}`,
    '',
    `Открыть в админке: ${siteUrl}/admin`
  ];
  return lines.filter((line) => line !== null).join('\n');
}

function whatsappLink(booking, whatsappE164) {
  const text = encodeURIComponent(
    `Здравствуйте, ${booking.name}! Заявка ${booking.reference} на ${booking.businessDate} в ${booking.startTime} принята. Подтверждаем?`
  );
  return `https://wa.me/${whatsappE164}?text=${text}`;
}

async function withTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.notifications.timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text().catch(() => '');
    return { ok: response.ok, status: response.status, body: text.slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}

async function sendTelegram(text) {
  const { telegramBotToken, telegramChatId } = config.notifications;
  if (!telegramBotToken || !telegramChatId) {
    return { channel: 'telegram', ok: false, skipped: 'credentials_missing' };
  }
  const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
  const result = await withTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramChatId, text, disable_web_page_preview: true })
  });
  return { channel: 'telegram', ok: result.ok, status: result.status, detail: result.ok ? undefined : result.body };
}

async function sendWebhook(payload) {
  const { webhookUrl } = config.notifications;
  if (!webhookUrl) return { channel: 'webhook', ok: false, skipped: 'credentials_missing' };
  const result = await withTimeout(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { channel: 'webhook', ok: result.ok, status: result.status, detail: result.ok ? undefined : result.body };
}

async function sendEmail(subject, text) {
  const { emailHttpEndpoint, emailHttpToken, emailTo, emailFrom } = config.notifications;
  if (!emailHttpEndpoint || !emailTo || !emailFrom) {
    return { channel: 'email', ok: false, skipped: 'credentials_missing' };
  }
  const result = await withTimeout(emailHttpEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(emailHttpToken ? { authorization: `Bearer ${emailHttpToken}` } : {})
    },
    body: JSON.stringify({ from: emailFrom, to: [emailTo], subject, text })
  });
  return { channel: 'email', ok: result.ok, status: result.status, detail: result.ok ? undefined : result.body };
}

/**
 * Отправка уведомления о заявке.
 * @returns {{ok:boolean, mockMode:boolean, channels:Array, manual:{whatsappLink:string}}}
 */
async function dispatchBooking(booking) {
  const data = await require('../store').read();
  const settings = data.settings || {};
  const text = bookingMessage(booking, config.siteUrl);
  const manual = { whatsappLink: whatsappLink(booking, settings.whatsappE164 || '77001538584') };

  if (config.mockMode) {
    console.log(`\n[notify:mock] заявка ${booking.reference} — реальная отправка отключена (MOCK_MODE=true)\n`);
    return {
      ok: true,
      mockMode: true,
      channels: [{ channel: 'mock', ok: true, skipped: 'mock_mode' }],
      manual
    };
  }

  const channels = await Promise.all([
    sendTelegram(text).catch((error) => ({ channel: 'telegram', ok: false, detail: error.message })),
    sendWebhook({ type: 'booking.created', booking, manual }).catch((error) => ({
      channel: 'webhook',
      ok: false,
      detail: error.message
    })),
    sendEmail(`Новая заявка ${booking.reference}`, text).catch((error) => ({
      channel: 'email',
      ok: false,
      detail: error.message
    }))
  ]);

  const delivered = channels.filter((c) => c.ok);
  const attempted = channels.filter((c) => !c.skipped);

  if (attempted.length === 0) {
    console.warn(
      '[notify] не настроен ни один канал доставки. Заявка сохранена в БД, ' +
        'но администратор не получит уведомление. Проверьте .env (README, «Уведомления»).'
    );
  }

  return { ok: delivered.length > 0 || attempted.length === 0, mockMode: false, channels, manual };
}

module.exports = { dispatchBooking, bookingMessage, whatsappLink };
