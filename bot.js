const express = require('express');
const { Telegraf, Markup } = require('telegraf');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '1005867951';
const WEB_APP_URL =
  process.env.WEB_APP_URL || 'https://krakenlab.vercel.app';
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

if (!BOT_TOKEN) {
  throw new Error('Не задан BOT_TOKEN в Render');
}

if (!GOOGLE_SCRIPT_URL) {
  throw new Error('Не задан GOOGLE_SCRIPT_URL в Render');
}

const bot = new Telegraf(BOT_TOKEN);
const waitingForCost = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '⏳ В обробці',
        `status_proc_${orderId}`
      ),
      Markup.button.callback(
        '✅ Виконано',
        `status_done_${orderId}`
      )
    ],
    [
      Markup.button.callback(
        '❌ Скасувати',
        `status_canc_${orderId}`
      )
    ],
    [
      Markup.button.callback(
        '💸 Вказати собівартість',
        `cost_${orderId}`
      )
    ]
  ]);
}

async function postToSheet(payload) {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  if (!response.ok || !text.toLowerCase().includes('success')) {
    throw new Error(
      `Google Apps Script: HTTP ${response.status}; ${text}`
    );
  }

  return text;
}

function formatItems(items) {
  return items.map((item, index) => {
    const flavor = item.flavor
      ? ` (${item.flavor})`
      : '';

    return (
      `${index + 1}. ${item.title}${flavor} — ` +
      `${item.quantity} шт. х ${item.price} ₴`
    );
  }).join('\n');
}

function makeOrderId() {
  return 'ORD-' + Math.floor(100000 + Math.random() * 900000);
}

app.get('/', (req, res) => {
  res.send('🐙 Kraken Lab API працює');
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Kraken Lab',
    status: 'online'
  });
});

// Отримання статусу замовлення для історії на сайті.
app.get('/api/order/status/:orderId', async (req, res) => {
  try {
    const url = new URL(GOOGLE_SCRIPT_URL);

    url.searchParams.set('action', 'status');
    url.searchParams.set('order_id', req.params.orderId);

    const response = await fetch(url.toString());
    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        success: false,
        status: 'В обробці'
      };
    }

    res.status(response.ok ? 200 : 502).json(data);

  } catch (error) {
    console.error('Помилка отримання статусу:', error);

    res.status(500).json({
      success: false,
      status: 'В обробці'
    });
  }
});

// Створення замовлення.
app.post('/api/order', async (req, res) => {
  try {
    const body = req.body || {};

    const user = body.user || {};
    const name = String(
      body.name ||
      body.customer_name ||
      user.first_name ||
      'Покупець'
    ).trim();

    const userId = String(
      body.userId ||
      body.user_id ||
      user.id ||
      ''
    );

    const rawUsername = String(
      body.username ||
      user.username ||
      ''
    );

    const username = rawUsername
      ? '@' + rawUsername.replace(/^@/, '')
      : '';

    const phone = String(body.phone || '').trim();

    const deliveryRaw = String(
      body.deliveryType ||
      body.deliveryMethod ||
      body.delivery ||
      ''
    );

    const isPickup = /самовивіз|pickup/i.test(deliveryRaw);
    const delivery = isPickup ? 'Самовивіз' : 'Нова Пошта';

    const address = String(
      body.deliveryDetails ||
      body.address ||
      ''
    ).trim();

    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!name || !phone || !deliveryRaw || !rawItems.length) {
      return res.status(400).json({
        success: false,
        error: 'Перевірте ім’я, телефон, доставку та товари.'
      });
    }

    const items = rawItems.map(item => ({
      title: String(item.title || item.name || 'Товар'),
      flavor: String(item.flavor || ''),
      quantity: Math.max(
        1,
        Math.min(99, Number(item.quantity || item.count) || 1)
      ),
      price: Math.max(0, Number(item.price) || 0)
    }));

    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Сайт передає вже розраховану суму з урахуванням знижки.
    const total = Math.max(
      0,
      Number(body.totalPrice || body.total_price || body.total || subtotal)
    );

    if (total <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Не вдалося визначити суму замовлення.'
      });
    }

    const orderId = makeOrderId();
    const itemsFormatted = formatItems(items);

    // Спочатку зберігаємо замовлення в таблиці.
    await postToSheet({
      action: 'new_order',
      order_id: orderId,
      orderId: orderId,
      customer_name: name,
      name: name,
      user_id: userId,
      username: username,
      phone: phone,
      delivery_method: delivery,
      delivery: delivery,
      delivery_details: address,
      address: address,
      items: items,
      items_formatted: itemsFormatted,
      total_price: total,
      totalPrice: total
    });

    const adminMessage =
      `🛍 <b>НОВЕ ЗАМОВЛЕННЯ #${orderId}</b>\n\n` +
      `👤 <b>Покупець:</b> ${escapeHtml(name)} ` +
      `${escapeHtml(username)}\n` +
      `🆔 <b>ID:</b> ${escapeHtml(userId || 'Не вказано')}\n` +
      `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
      `🚚 <b>Спосіб:</b> ${escapeHtml(delivery)}\n` +
      `📍 <b>Деталі:</b> ${escapeHtml(address || 'Не вказано')}\n\n` +
      `📦 <b>Товари:</b>\n${escapeHtml(itemsFormatted)}\n\n` +
      `💰 <b>Сума:</b> ${total} грн\n\n` +
      `📌 <b>Поточний статус:</b> В обробці`;

    await bot.telegram.sendMessage(
      ADMIN_CHAT_ID,
      adminMessage,
      {
        parse_mode: 'HTML',
        ...statusKeyboard(orderId)
      }
    );

    // Пишемо покупцю в Telegram, якщо він відкрив бота.
    if (userId) {
      try {
        let customerMessage =
          `✅ <b>Дякуємо за замовлення в KrakenLab!</b>\n\n` +
          `📦 Ваше замовлення успішно оформлено та передано менеджеру.\n\n` +
          `🛒 <b>Товари:</b>\n${escapeHtml(itemsFormatted)}\n\n` +
          `🕐 Очікуйте на підтвердження — менеджер зв’яжеться ` +
          `з вами найближчим часом для уточнення деталей.`;

        if (isPickup) {
          customerMessage +=
            '\n\n⏱ Оскільки це самовивіз, будь ласка, ' +
            'напишіть менеджеру @telleportt для узгодження часу!';
        }

        customerMessage += '\n\n💚 Дякуємо, що обираєте KrakenLab!';

        await bot.telegram.sendMessage(
          userId,
          customerMessage,
          { parse_mode: 'HTML' }
        );

      } catch (error) {
        console.error(
          'Не вдалося повідомити покупця:',
          error.message
        );
      }
    }

    return res.json({
      success: true,
      orderId: orderId,
      total: total
    });

  } catch (error) {
    console.error('Помилка оформлення замовлення:', error);

    return res.status(500).json({
      success: false,
      error: 'Не вдалося оформити замовлення. Перевірте сервер і Google Таблицю.'
    });
  }
});

// Зміна статусу менеджером.
bot.action(/^status_(proc|done|canc)_(.+)$/, async ctx => {
  if (String(ctx.chat.id) !== String(ADMIN_CHAT_ID)) {
    return ctx.answerCbQuery(
      'Ця дія доступна лише адміністратору',
      { show_alert: true }
    );
  }

  const action = ctx.match[1];
  const orderId = ctx.match[2];

  const status = action === 'done'
    ? 'Виконано'
    : action === 'canc'
      ? 'Скасовано'
      : 'В обробці';

  try {
    await postToSheet({
      action: 'update_status',
      order_id: orderId,
      status: status
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
        ...statusKeyboard(orderId)
      }
    );

    await ctx.answerCbQuery(`Статус: ${status}`);

  } catch (error) {
    console.error('Помилка зміни статусу:', error);

    await ctx.answerCbQuery(
      'Не вдалося змінити статус',
      { show_alert: true }
    );
  }
});

// Запит собівартості.
bot.action(/^cost_(.+)$/, async ctx => {
  if (String(ctx.chat.id) !== String(ADMIN_CHAT_ID)) {
    return ctx.answerCbQuery(
      'Ця дія доступна лише адміністратору',
      { show_alert: true }
    );
  }

  const orderId = ctx.match[1];

  waitingForCost.set(String(ctx.chat.id), orderId);

  await ctx.answerCbQuery();

  await ctx.reply(
    `Введи загальну собівартість замовлення #${orderId} числом у гривнях.`
  );
});

bot.on('text', async (ctx, next) => {
  const chatId = String(ctx.chat.id);
  const orderId = waitingForCost.get(chatId);

  if (!orderId) return next();
  if (chatId !== String(ADMIN_CHAT_ID)) return;

  if (ctx.message.text === '/cancelcost') {
    waitingForCost.delete(chatId);
    return ctx.reply('Введення собівартості скасовано.');
  }

  const cost = Number(
    String(ctx.message.text).replace(',', '.').trim()
  );

  if (!Number.isFinite(cost) || cost < 0) {
    return ctx.reply(
      'Введи число, наприклад 350. Для скасування: /cancelcost'
    );
  }

  try {
    await postToSheet({
      action: 'update_cost',
      order_id: orderId,
      cost_price: cost
    });

    waitingForCost.delete(chatId);

    await ctx.reply(
      `✅ Собівартість замовлення #${orderId} збережена: ${cost} грн.`
    );

  } catch (error) {
    console.error('Помилка собівартості:', error);

    await ctx.reply(
      'Не вдалося зберегти собівартість. Перевір GOOGLE_SCRIPT_URL.'
    );
  }
});

bot.command('cancelcost', async ctx => {
  waitingForCost.delete(String(ctx.chat.id));
  await ctx.reply('Введення собівартості скасовано.');
});

bot.start(async ctx => {
  await ctx.reply(
    '🐙 Вітаємо в Kraken Lab!\n\n' +
    '👥 Відгуки: @KRAKENOTZYVVL\n' +
    '💬 Менеджер: @telleportt\n\n' +
    '🛒 Відкривай магазин, обирай товари та оформлюй замовлення!',
    Markup.inlineKeyboard([
      [
        Markup.button.webApp(
          '🛒 Відкрити магазин',
          WEB_APP_URL
        )
      ]
    ])
  );
});

bot.catch(error => {
  console.error('Telegram bot error:', error);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kraken Lab server running on port ${PORT}`);
});

bot.launch()
  .then(() => console.log('Kraken Lab bot started'))
  .catch(error => console.error('Bot launch error:', error));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));