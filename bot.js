const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

// Обязательный корень, чтобы Render видел, что сервер живой
app.get('/', (req, res) => {
  res.send('Kraken Lab Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// Хранилище сессий для ввода себестоимости
const userSessions = {};

// Функция отправки уведомления администратору
async function sendAdminOrderNotification(adminChatId, orderData) {
  const messageText = 
    `🛍️ **НОВЕ ЗАМОВЛЕННЯ #${orderData.order_id}**\n\n` +
    `👤 **Покупець:** ${orderData.customer_name}\n` +
    `📞 **Телефон:** ${orderData.phone || '-'}\n` +
    `🚚 **Спосіб:** ${orderData.delivery_method || '-'}\n\n` +
    `📦 **Товари:**\n${orderData.items}\n\n` +
    `💰 **Сума:** ${orderData.total_price} грн\n` +
    `📌 **Поточний статус:** В обробці`;

  const adminKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('⏳ В обробці', `status_processing_${orderData.order_id}`),
      Markup.button.callback('✅ Виконано', `status_completed_${orderData.order_id}`),
      Markup.button.callback('❌ Скасовано', `status_cancelled_${orderData.order_id}`)
    ],
    [
      Markup.button.callback('✏️ Собівартість', `edit_cost_${orderData.order_id}`)
    ]
  ]);

  await bot.telegram.sendMessage(adminChatId, messageText, { 
    parse_mode: 'Markdown', 
    ...adminKeyboard 
  });
}

// Обработка кнопки себестоимости
bot.action(/edit_cost_(.+)/, async (ctx) => {
  const orderId = ctx.match[1];
  userSessions[ctx.from.id] = { action: 'awaiting_cost', orderId: orderId };
  await ctx.reply(`Введіть нову собівартість (грн) для замовлення #${orderId}:`);
  await ctx.answerCbQuery();
});

// Перехват текста с суммой
bot.on('text', async (ctx, next) => {
  const session = userSessions[ctx.from.id];
  
  if (session && session.action === 'awaiting_cost') {
    const cost = parseFloat(ctx.message.text.replace(',', '.'));

    if (isNaN(cost)) {
      return ctx.reply('❌ Будь ласка, введіть число (наприклад, 210).');
    }

    delete userSessions[ctx.from.id];

    try {
      await axios.post(process.env.GOOGLE_SCRIPT_URL, {
        action: 'update_cost',
        order_id: session.orderId,
        cost_price: cost
      });

      await ctx.reply(`✅ Собівартість для замовлення #${session.orderId} оновлена: ${cost} грн!`);
    } catch (err) {
      await ctx.reply(`❌ Помилка оновлення в таблиці: ${err.message}`);
    }
    return;
  }

  return next();
});

// Запуск бота
bot.launch().then(() => {
  console.log('🤖 Bot Kraken Lab successfully started!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = { bot, sendAdminOrderNotification };
