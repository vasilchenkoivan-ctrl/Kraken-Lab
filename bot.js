const { Telegraf, Scenes, session } = require('telegraf');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// 1. Подключение к Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. ВСТАВЬ СЮДА СВОЙ TELEGRAM ID (Узнать можно в боте @userinfobot)
// Например: const ADMIN_ID = 123456789;
const ADMIN_ID = 1005867951; 

// 3. Сценарий пошагового добавления товара (Wizard Scene)
const addProductWizard = new Scenes.WizardScene(
  'ADD_PRODUCT_SCENE',
  
  // Шаг 1: Название
  async (ctx) => {
    ctx.wizard.state.product = {};
    await ctx.reply('📦 Введите название товара:');
    return ctx.wizard.next();
  },

  // Шаг 2: Описание
  async (ctx) => {
    ctx.wizard.state.product.title = ctx.message.text;
    await ctx.reply('📝 Введите описание товара:');
    return ctx.wizard.next();
  },

  // Шаг 3: Цена
  async (ctx) => {
    ctx.wizard.state.product.description = ctx.message.text;
    await ctx.reply('💰 Введите цену товара (только число, например: 500):');
    return ctx.wizard.next();
  },

  // Шаг 4: Ссылка на фото
  async (ctx) => {
    const price = parseFloat(ctx.message.text);
    if (isNaN(price)) {
      await ctx.reply('❌ Пожалуйста, введите корректное число для цены!');
      return; // Остаемся на этом же шаге, если ввели не число
    }
    ctx.wizard.state.product.price = price;
    await ctx.reply('🖼️ Вставьте прямую ссылку на картинку товара (URL):');
    return ctx.wizard.next();
  },

  // Шаг 5: Сохранение в Supabase
  async (ctx) => {
    ctx.wizard.state.product.image_url = ctx.message.text;
    const { title, description, price, image_url } = ctx.wizard.state.product;

    await ctx.reply('⏳ Сохраняю товар в базу данных...');

    const { data, error } = await supabase
      .from('products')
      .insert([{ title, description, price, image_url }]);

    if (error) {
      console.error('Ошибка Supabase:', error);
      await ctx.reply(`❌ Ошибка при сохранении: ${error.message}`);
    } else {
      await ctx.reply(`✅ Товар "${title}" успешно добавлен в базу!`);
    }

    return ctx.scene.leave();
  }
);

// 4. Инициализация бота и сцен
const stage = new Scenes.Stage([addProductWizard]);
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());
bot.use(stage.middleware());

// Команда /start
bot.start((ctx) => {
  ctx.reply('Привет! Добро пожаловать в Kraken Lab 🛒', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛒 Открыть Магазин', web_app: { url: 'https://google.com' } }]
      ]
    }
  });
});

// Команда /admin
bot.command('admin', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ У вас нет доступа к админ-панели.');
  }

  ctx.reply('👨‍💻 **Админ-панель Kraken Lab**\n\nДля добавления нового товара нажмите или напишите команду: /add', {
    parse_mode: 'Markdown'
  });
});

// Команда /add для старта заведения товара
bot.command('add', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ У вас нет доступа.');
  }
  return ctx.scene.enter('ADD_PRODUCT_SCENE');
});

// 5. Веб-сервер Express для прохождения Port Scan на Render
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Kraken Lab Bot is Live!');
});

// Запуск веб-сервера на 0.0.0.0 (КРИТИЧНО для Render)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is listening on port ${PORT}`);
});

// Запуск бота
bot.launch();
console.log('Kraken LAB Bot успешно запущен!');

// Корректная остановка при перезапусках Render
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
