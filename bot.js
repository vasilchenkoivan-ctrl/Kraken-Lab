const { Telegraf } = require('telegraf');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// Подключение к базе данных Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Инициализация бота и Express-сервера
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Веб-сервер для того, чтобы Render видел открытый порт
app.get('/', (req, res) => {
  res.send('Kraken Lab Bot is Live!');
});

// Команда /start в Telegram
bot.start((ctx) => {
  ctx.reply('Привет! Добро пожаловать в Kraken Lab 🛒', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛒 Открыть Магазин', web_app: { url: 'https://google.com' } }]
      ]
    }
  });
});

// ВАЖНО: добавляем '0.0.0.0', чтобы Render увидел порт снаружи
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is listening on port ${PORT}`);
});

// Запуск бота
bot.launch();
console.log('Kraken LAB Bot успешно запущен!');
