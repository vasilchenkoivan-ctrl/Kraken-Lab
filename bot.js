// bot.js
const express = require('express');
const { Telegraf, Markup } = require('telegraf');

const app = express();
app.use(express.json({ limit: '1mb' }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '1005867951');
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://krakenlab.vercel.app';
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

if (!BOT_TOKEN) throw new Error('Set BOT_TOKEN in Render environment variables');
if (!GOOGLE_SCRIPT_URL) throw new Error('Set GOOGLE_SCRIPT_URL in Render environment variables');

const bot = new Telegraf(BOT_TOKEN);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const waitingForCost = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function postToSheet(payload) {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });

  const result = await response.text();

  if (!response.ok || !/success/i.test(result)) {
    throw new Error(`Google Sheets error: HTTP ${response.status}: ${result}`);
  }

  return result;
}

function formatItems(items) {
  return items.map((item, index) => {
    const title = String(item.title || item.name || 'Товар');
    const flavor = item.flavor ? ` (${item.flavor})` : '';
    const quantity = Number(item.quantity);
    const price = Number(item.price);

    return `${index + 1}. ${title}${flavor} — ${quantity} шт. х ${price} ₴`;
  }).join('\n');
}

function orderKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⏳ В обробці', `status_proc_${orderId}`),
      Markup.button.callback('✅ Виконано', `status_done_${orderId}`)
    ],
    [
      Markup.button.callback('❌ Скасувати', `status_canc_${orderId}`),
      Markup.button.callback('💸 Собівартість', `cost_${orderId}`)
    ]
  ]);
}

app.get('/', (_req, res) => {
  res.status(200).send('Kraken Lab API працює.');
});

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'Kraken Lab', status: 'online' });
});

app.get('/api/order/status/:orderId', async (req, res) => {
  try {
    const url = new URL(GOOGLE_SCRIPT_URL);
    url.searchParams.set('action', 'status');
    url.searchParams.set('order_id', req.params.orderId);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000)
    });
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid status response: ${text}`);
    }

    res.status(response.ok ? 200 : 502).json(data);
  } catch (error) {
    console.error('Status lookup error:', error.message);
    res.status(502).json({
      success: false,
      error: 'Не вдалося отримати статус замовлення.'
    });
  }
});

app.post('/api/order', async (req, res) => {
  try {
    const data = req.body?.order || req.body || {};
    const user = data.user || data.userInfo || {};

    const name = String(
      data.name ||
      data.customer_name ||
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      'Покупець'
    ).trim();

    const userId = String(data.userId || data.user_id || user.id || '');
    const usernameRaw = String(data.username || user.username || '').replace(/^@/, '');
    const username = usernameRaw ? `@${usernameRaw}` : '';
    const phone = String(data.phone || data.userPhone || '').trim();

    const deliveryRaw = String(
      data.deliveryType || data.deliveryMethod || data.delivery || 'Самовивіз'
    );

    const isPickup = /самовивіз|pickup/i.test(deliveryRaw);
    const delivery = isPickup ? 'Самовивіз' : 'Нова Пошта';

    const address = String(
      data.deliveryDetails || data.address || data.comment || ''
    ).trim();

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Вкажіть ім’я та номер телефону.'
      });
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Кошик порожній.'
      });
    }

    const items = data.items.map(item => {
      const title = String(item.title || item.name || '').trim();
      const flavor = String(item.flavor || item.taste || '').trim();
      const price = Number(item.price);
      const quantity = Number(item.quantity || item.count || 1);

      if (!title || !Number.isFinite(price) || price < 0) {
        throw new Error('Некоректні дані товару.');
      }

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new Error('Некоректна кількість товару.');
      }

      return { title, flavor, price, quantity };
    });

    const total = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    if (total <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Не вдалося визначити суму замовлення.'
      });
    }

    const orderId = `ORD-${String(
      Math.floor(100000 + Math.random() * 900000)
    )}`;

    const itemsText = formatItems(items);
    const createdAt = new Date().toISOString();

    await postToSheet({
      action: 'new_order',
      order_id: orderId,
      orderId,
      customer_name: name,
      name,
      user_id: userId,
      username,
      phone,
      delivery_method: delivery,
      delivery_details: address,
      items,
      items_formatted: itemsText,
      total_price: total,
      totalPrice: total,
      status: 'В обробці',
      created_at: createdAt
    });

    const adminMessage =
      `🛍 <b>НОВЕ ЗАМОВЛЕННЯ #${escapeHtml(orderId)}</b>\n\n` +
      `👤 <b>Покупець:</b> ${escapeHtml(name)} ${escapeHtml(username)}\n` +
      `🆔 <b>ID:</b> ${escapeHtml(userId || 'Не вказано')}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
      `🚚 <b>Спосіб:</b> ${escapeHtml(delivery)}\n` +
      `📍 <b>Деталі:</b> ${escapeHtml(address || 'Не вказано')}\n\n` +
      `📦 <b>Товари:</b>\n${escapeHtml(itemsText)}\n\n` +
      `💰 <b>Сума:</b> ${total} грн\n\n` +
      `📌 <b>Поточний статус:</b> В обробці`;

    await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, {
      parse_mode: 'HTML',
      ...orderKeyboard(orderId)
    });

    if (userId) {
      try {
        let clientMessage =
          `✅ <b>Дякуємо за замовлення в KrakenLab!</b>\n\n` +
          `📦 Ваше замовлення <b>#${escapeHtml(orderId)}</b> успішно оформлено та передано менеджеру.\n\n` +
          `🛒 <b>Товари:</b>\n${escapeHtml(itemsText)}\n\n` +
          `💰 <b>Сума:</b> ${total} ₴\n\n` +
          `🕐 Очікуйте на підтвердження — менеджер зв’яжеться з вами найближчим часом.`;

        if (isPickup) {
          clientMessage +=
            '\n\n⏱ Оскільки це самовивіз, напишіть менеджеру @telleportt для узгодження часу!';
        }

        clientMessage += '\n\n💚 Дякуємо, що обираєте KrakenLab!';

        await bot.telegram.sendMessage(userId, clientMessage, {
          parse_mode: 'HTML'
        });
      } catch (error) {
        console.error('Customer notification failed:', error.message);
      }
    }

    res.json({
      success: true,
      orderId,
      total,
      status: 'В обробці'
    });
  } catch (error) {
    console.error('Order processing error:', error);

    res.status(500).json({
      success: false,
      error: 'Не вдалося оформити замовлення. Спробуйте пізніше.'
    });
  }
});

bot.action(/^status_(proc|done|canc)_(.+)$/, async ctx => {
  try {
    if (String(ctx.chat.id) !== ADMIN_CHAT_ID) {
      return ctx.answerCbQuery('Немає доступу', { show_alert: true });
    }

    const action = ctx.match[1];
    const orderId = ctx.match[2];

    const status = {
      proc: 'В обробці',
      done: 'Виконано',
      canc: 'Скасовано'
    }[action];

    await postToSheet({
      action: 'update_status',
      order_id: orderId,
      orderId,
      status
    });

    const oldText = ctx.callbackQuery.message.text || '';
    const baseText = oldText.replace(
      /\n📌 <b>Поточний статус:<\/b>.*$/s,
      ''
    );

    await ctx.editMessageText(
      `${baseText}\n📌 <b>Поточний статус:</b> ${escapeHtml(status)}`,
      {
        parse_mode: 'HTML',
        reply_markup: ctx.callbackQuery.message.reply_markup
      }
    );

    await ctx.answerCbQuery(`Статус: ${status}`);
  } catch (error) {
    console.error('Status update error:', error.message);
    await ctx.answerCbQuery('Не вдалося оновити статус.', {
      show_alert: true
    });
  }
});

bot.action(/^cost_(.+)$/, async ctx => {
  if (String(ctx.chat.id) !== ADMIN_CHAT_ID) {
    return ctx.answerCbQuery('Немає доступу', { show_alert: true });
  }

  const orderId = ctx.match[1];
  waitingForCost.set(String(ctx.chat.id), orderId);

  await ctx.answerCbQuery();
  await ctx.reply(
    `Введи загальну собівартість замовлення #${orderId} числом у гривнях.`
  );
});

bot.command('cancelcost', async ctx => {
  waitingForCost.delete(String(ctx.chat.id));
  await ctx.reply('Введення собівартості скасовано.');
});

bot.on('text', async (ctx, next) => {
  const chatId = String(ctx.chat.id);
  const orderId = waitingForCost.get(chatId);

  if (!orderId || chatId !== ADMIN_CHAT_ID) return next();

  const cost = Number(ctx.message.text.replace(',', '.').trim());

  if (!Number.isFinite(cost) || cost < 0) {
    return ctx.reply(
      'Введи суму числом, наприклад 350. Для скасування: /cancelcost'
    );
  }

  try {
    await postToSheet({
      action: 'update_cost',
      order_id: orderId,
      orderId,
      cost_price: cost
    });

    waitingForCost.delete(chatId);
    await ctx.reply(`✅ Собівартість замовлення #${orderId}: ${cost} грн.`);
  } catch (error) {
    console.error('Cost update error:', error.message);
    await ctx.reply('❌ Не вдалося зберегти собівартість.');
  }
});

bot.start(ctx => ctx.reply(
  '🐙 Вітаємо в Kraken Lab!\n\n' +
  '👥 Відгуки: @KRAKENOTZYVVL\n' +
  '💬 Менеджер: @telleportt\n\n' +
  '🛒 Відкривайте магазин за кнопкою нижче.',
  Markup.inlineKeyboard([[
    Markup.button.webApp('🛒 Відкрити магазин', WEB_APP_URL)
  ]])
));

bot.catch(error => console.error('Telegram error:', error));

const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kraken Lab server running on port ${PORT}`);
});

bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('Kraken Lab bot started'))
  .catch(error => console.error('Bot launch error:', error.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));