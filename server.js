const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// 1. CONFIGURACIÓN DE BASE DE DATOS SUPABASE
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. CONFIGURACIÓN DE TELEGRAM BOT
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8665762438:AAFbEge-A9RioFs2hDEz1zgqVBFWYH43ksA';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '6664386870';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// -------------------------------------------------------------
// ENDPOINTS DE LA API
// -------------------------------------------------------------

// Recibir reporte de pago desde la Web
app.post('/api/report-payment', (req, res) => {
  const { username, amount, reference, method } = req.body;

  if (!username || !amount || !reference) {
    return res.status(400).json({ success: false, message: 'Faltan datos obligatorios' });
  }

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Aprobar', callback_data: `approve:${username}:${amount}` },
          { text: '❌ Rechazar', callback_data: `reject:${username}:${amount}` }
        ]
      ]
    }
  };

  const message = `🚨 *NUEVO DEPÓSITO REPORTADO*\n\n` +
                  `👤 *Usuario:* \`${username}\`\n` +
                  `💰 *Monto:* $${amount}\n` +
                  `📌 *Referencia:* \`${reference}\`\n` +
                  `🏦 *Método:* ${method || 'Pago Móvil'}\n\n` +
                  `¿Deseas verificar y acreditar este pago?`;

  bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown', ...opts });

  res.json({ success: true, message: 'Reporte recibido y enviado a revisión' });
});

// Consultar saldo del usuario desde la Web (Supabase)
app.get('/api/balance/:username', async (req, res) => {
  const { username } = req.params;

  try {
    let { data: jugador, error } = await supabase
      .from('jugadores')
      .select('saldo')
      .eq('id', username)
      .single();

    // Si el usuario no existe en la base de datos, lo registramos con $0.00
    if (!jugador) {
      const { data: nuevoJugador } = await supabase
        .from('jugadores')
        .insert([{ id: username, saldo: 0.00 }])
        .select()
        .single();

      return res.json({ username, balance: 0.00 });
    }

    res.json({ username, balance: parseFloat(jugador.saldo) });
  } catch (err) {
    console.error('Error al obtener saldo:', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Modificar saldo desde los juegos (Descontar apuestas / Sumar premios)
app.post('/api/update-balance', async (req, res) => {
  const { username, amount } = req.body;

  if (!username || amount === undefined) {
    return res.status(400).json({ success: false, message: 'Parámetros incompletos' });
  }

  try {
    // 1. Obtener saldo actual del usuario
    let { data: jugador } = await supabase
      .from('jugadores')
      .select('saldo')
      .eq('id', username)
      .single();

    let saldoActual = jugador ? parseFloat(jugador.saldo) : 0.00;
    let nuevoSaldo = saldoActual + parseFloat(amount);

    if (nuevoSaldo < 0) nuevoSaldo = 0; // Evitar saldos negativos

    // 2. Guardar el nuevo saldo en Supabase
    await supabase
      .from('jugadores')
      .upsert({ id: username, saldo: nuevoSaldo });

    res.json({ success: true, username, newBalance: nuevoSaldo });
  } catch (err) {
    console.error('Error al actualizar saldo:', err);
    res.status(500).json({ success: false, message: 'Error al procesar la transacción' });
  }
});

// -------------------------------------------------------------
// ESCUCHADOR DE BOT DE TELEGRAM (Aprobar / Rechazar)
// -------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data; // Formato: "approve:google_user_252:1000"

  const [action, username, amountStr] = data.split(':');
  const amount = parseFloat(amountStr);

  if (action === 'approve') {
    try {
      // 1. Consultar saldo actual en Supabase
      let { data: jugador } = await supabase
        .from('jugadores')
        .select('saldo')
        .eq('id', username)
        .single();

      let saldoActual = jugador ? parseFloat(jugador.saldo) : 0.00;
      let nuevoSaldo = saldoActual + amount;

      // 2. Acreditar saldo en Supabase
      await supabase
        .from('jugadores')
        .upsert({ id: username, saldo: nuevoSaldo });

      // 3. Confirmar en Telegram
      bot.editMessageText(
        `✅ *ESTADO: APROBADO*\n\nSe acreditaron *$${amount}* al usuario \`${username}\`.\nNuevo saldo total: *$${nuevoSaldo.toFixed(2)}*`,
        { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
      );

      bot.answerCallbackQuery(query.id, { text: `Pago de $${amount} aprobado para ${username}` });
    } catch (err) {
      console.error('Error aprobando en Supabase:', err);
      bot.answerCallbackQuery(query.id, { text: 'Error al actualizar base de datos' });
    }

  } else if (action === 'reject') {
    bot.editMessageText(
      `❌ *ESTADO: RECHAZADO*\n\nEl pago del usuario \`${username}\` por *$${amount}* fue rechazado.`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
    );

    bot.answerCallbackQuery(query.id, { text: 'Pago rechazado' });
  }
});

// -------------------------------------------------------------
// INICIO DEL SERVIDOR
// -------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
