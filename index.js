const express  = require('express'); 
const axios    = require('axios');
const FormData = require('form-data');
const twilio   = require('twilio');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client        = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const OWNER_NUMBER  = 'whatsapp:+5519991104049'; // seu pai
const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const PIX_KEY       = '+55 19 99566-7073';
const RESTAURANT    = 'Cozinha Oriental e Pastelaria do Japonês';
const OPENAI_KEY    = process.env.OPENAI_API_KEY;

// ── Cardápio ──────────────────────────────────────────────────────────────────
const MENU = [
  { id: '1',  cat: 'Combinado', nome: 'Combinado 1', desc: '8 sushi + 5 sashimi + 5 nigiri + 5 jô', preco: 75 },
  { id: '2',  cat: 'Combinado', nome: 'Combinado 2', desc: '8 sushi + 4 jô ou 4 nigiri', preco: 55 },
  { id: '3',  cat: 'Combinado', nome: 'Mega Combo', desc: '8 sushi + 10 hot roll', preco: 70 },
  { id: '4',  cat: 'Combinado', nome: 'Combo Família', desc: '50 peças + 2 temakis ou entrada da semana', preco: 195 },
  { id: '5',  cat: 'Entrada', nome: 'Ceviche de Salmão', desc: '330g', preco: 45 },
  { id: '6',  cat: 'Entrada', nome: 'Guioza', desc: '12 un. — bovino ou suíno', preco: 30 },
  { id: '7',  cat: 'Temaki', nome: 'Temaki Fresco', desc: 'com arroz', preco: 27 },
  { id: '8',  cat: 'Temaki', nome: 'Temaki Fresco', desc: 'sem arroz', preco: 30 },
  { id: '9',  cat: 'Temaki', nome: 'Temaki Grelhado', desc: 'com arroz', preco: 29 },
  { id: '10', cat: 'Temaki', nome: 'Temaki Grelhado', desc: 'sem arroz', preco: 32 },
  { id: '11', cat: 'Temaki', nome: 'Temaki Hot', desc: 'com arroz', preco: 36 },
  { id: '12', cat: 'Temaki', nome: 'Temaki Hot', desc: 'sem arroz', preco: 39 },
  { id: '13', cat: 'Sushi', nome: 'Sushi Filadélfia', desc: '8 un.', preco: 36 },
  { id: '14', cat: 'Sushi', nome: 'Sushi Grelhado', desc: '8 un.', preco: 42 },
  { id: '15', cat: 'Sushi', nome: 'Nigiri', desc: '5 un.', preco: 25 },
  { id: '16', cat: 'Sushi', nome: 'Jô', desc: '5 un.', preco: 28 },
  { id: '17', cat: 'Hot Roll', nome: 'Hot Roll Tradicional', desc: '10 un.', preco: 40 },
  { id: '18', cat: 'Hot Roll', nome: 'Hot Roll Especial', desc: '10 un.', preco: 49 },
];

function findItem(id) { return MENU.find(i => i.id === String(id).trim()); }

// ── Sessions ──────────────────────────────────────────────────────────────────
const sessions = {};
function getSession(from) { if (!sessions[from]) sessions[from] = newSession(); return sessions[from]; }
function newSession() { return { step: 'start', name: '', address: '', cart: [], currentItemId: null, _pendingQty: 1, payment: '', orderId: null, pendingTranscription: null }; }
function resetSession(from) { sessions[from] = newSession(); }
function genOrderId() { return '#' + Math.floor(1000 + Math.random() * 9000); }

// ── Text builders ─────────────────────────────────────────────────────────────
function cardapioText() {
  const catEmoji = { Combinado: '🍱', Entrada: '🍋', Temaki: '🌯', Sushi: '🍣', 'Hot Roll': '🔥' };
  const cats = [...new Set(MENU.map(i => i.cat))];
  let txt = `📋 *CARDÁPIO — ${RESTAURANT}*\n\n`;
  cats.forEach(cat => {
    txt += `${catEmoji[cat] || ''} *${cat.toUpperCase()}*\n`;
    MENU.filter(i => i.cat === cat).forEach(i => {
      txt += `*${i.id}* – ${i.nome} (${i.desc}) — R$ ${i.preco.toFixed(2)}\n`;
    });
    txt += '\n';
  });
  txt += `━━━━━━━━━━━━━━━━━━━━━\n`;
  txt += `📌 *Como pedir:* Digite o número + quantidade\n`;
  txt += `Ex: *1 2* → 2x Combinado 1 | *7* → 1x Temaki Fresco\n\n`;
  txt += `Quando terminar, digite *FEITO* ✅\n`;
  txt += `*VER CARRINHO* para conferir | *LIMPAR* para esvaziar\n`;
  txt += `🎤 Pode mandar *áudio* também!`;
  return txt;
}

function cartSummary(cart) {
  if (!cart.length) return '_Carrinho vazio_';
  const lines = cart.map(i => `• ${i.qty}x ${i.nome} (${i.desc})${i.obs ? ' — _' + i.obs + '_' : ''} — R$ ${(i.preco * i.qty).toFixed(2)}`);
  const total = cart.reduce((s, i) => s + i.preco * i.qty, 0);
  return lines.join('\n') + `\n\n*Total: R$ ${total.toFixed(2)}*`;
}

function ownerMsg(session, from, extra) {
  const total = session.cart.reduce((s, i) => s + i.preco * i.qty, 0);
  const itens = session.cart.map(i => `  • ${i.qty}x ${i.nome}${i.obs ? ' (' + i.obs + ')' : ''} — R$ ${(i.preco * i.qty).toFixed(2)}`).join('\n');
  const pgtoLabel = { pix: '✅ PIX — JÁ PAGO', credito: '💳 Crédito — COBRAR NA ENTREGA', debito: '💳 Débito — COBRAR NA ENTREGA', dinheiro: '💵 Dinheiro — COBRAR NA ENTREGA' };
  return (
    `🔔 *NOVO PEDIDO ${session.orderId}*\n\n` +
    `👤 *Cliente:* ${session.name}\n` +
    `📱 *WhatsApp:* ${from.replace('whatsapp:', '')}\n` +
    `📍 *Endereço:* ${session.address}\n` +
    `💰 *Pagamento:* ${pgtoLabel[session.payment] || session.payment}\n` +
    (extra ? `📎 ${extra}\n` : '') +
    `\n🛒 *Itens:*\n${itens}\n\n` +
    `💰 *Total: R$ ${total.toFixed(2)}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ Responda *OK* para confirmar\n` +
    `❌ Responda *NAO* para cancelar`
  );
}

async function send(to, body) {
  try { await client.messages.create({ from: TWILIO_NUMBER, to, body }); }
  catch (e) { console.error('Twilio error:', e.message); }
}

// ── Whisper transcription ─────────────────────────────────────────────────────
async function transcribeAudio(mediaUrl) {
  const audioResp = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    auth: { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN },
  });

  const form = new FormData();
  form.append('file', Buffer.from(audioResp.data), { filename: 'audio.ogg', contentType: 'audio/ogg' });
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  const whisperResp = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${OPENAI_KEY}` },
  });

  return whisperResp.data.text || '';
}

// ── Webhook completo ─────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const from      = req.body.From;
  const raw       = (req.body.Body || '').trim();
  const lower     = raw.toLowerCase();
  const upper     = raw.toUpperCase();
  const numMedia  = parseInt(req.body.NumMedia || '0');
  const mediaUrl  = req.body.MediaUrl0;
  const mediaType = (req.body.MediaContentType0 || '');

  // Owner pode testar como cliente
  let effectiveRaw = raw;
  if (from === OWNER_NUMBER && lower.startsWith('cliente ')) {
    effectiveRaw = raw.substring(8).trim();
  }

  // Comando reiniciar/menu
  if (lower === 'menu' || lower === 'reiniciar') {
    resetSession(from);
    const session = getSession(from);
    await processText(from, session, 'oi');
    return;
  }

  // Operador simplificado
  if (from === OWNER_NUMBER) {
    if (upper === 'OK') {
      const pendingClientEntry = Object.entries(sessions).find(([num, s]) => s.step === 'pending_approval');
      if (pendingClientEntry) {
        const [clientNum, s] = pendingClientEntry;
        s.step = 'done';
        await send(clientNum,
          `✅ *Pedido ${s.orderId} confirmado!* 🎉\n\n` +
          `Olá ${s.name}, seu pedido está sendo preparado! 🍣\n\n` +
          `${cartSummary(s.cart)}\n\n` +
          `Dúvidas? *${PIX_KEY}*\nObrigado! 🙏`
        );
        await send(OWNER_NUMBER, `✅ Confirmação enviada para ${s.name} (${s.orderId}).`);
        resetSession(clientNum);
      } else {
        await send(OWNER_NUMBER, `⚠️ Nenhum pedido pendente para confirmar.`);
      }
    } else if (upper === 'NAO') {
      const pendingClientEntry = Object.entries(sessions).find(([num, s]) => s.step === 'pending_approval');
      if (pendingClientEntry) {
        const [clientNum, s] = pendingClientEntry;
        s.step = 'done';
        await send(clientNum, `❌ Não conseguimos aceitar seu pedido agora.\nFale conosco: *${PIX_KEY}*`);
        await send(OWNER_NUMBER, `❌ Pedido de ${s.name} (${s.orderId}) cancelado.`);
        resetSession(clientNum);
      } else {
        await send(OWNER_NUMBER, `⚠️ Nenhum pedido pendente para cancelar.`);
      }
    }
    return;
  }

  const session = getSession(from);

  // Áudio
  if (numMedia > 0 && mediaType.includes('audio')) {
    await send(from, `🎤 Recebi seu áudio! Transcrevendo... um segundo ⏳`);
    let transcribed = '';
    try { transcribed = await transcribeAudio(mediaUrl); }
    catch (e) { console.error('Whisper error:', e.message); await send(from, `😕 Não consegui entender o áudio.`); return; }
    if (!transcribed || transcribed.length < 2) { await send(from, `😕 Não consegui transcrever o áudio.`); return; }
    session.pendingTranscription = transcribed;
    session._prevStep = session.step;
    session.step = 'confirm_transcription';
    await send(from, `🎤 *Entendi:* "${transcribed}"\nEstá correto? *SIM* ou *NÃO*`);
    return;
  }

  // Mídia não-áudio
  if (numMedia > 0 && !mediaType.includes('audio')) {
    if (session.step === 'await_pix') {
      const total = session.cart.reduce((s, i) => s + i.preco * i.qty, 0);
      await send(from,
        `✅ *Comprovante recebido!*\nVerificando pagamento de *R$ ${total.toFixed(2)}*.\nPedido *${session.orderId}* vai para a cozinha! 🍣`
      );
      await send(OWNER_NUMBER, ownerMsg(session, from, 'Comprovante PIX enviado pelo cliente — verificar antes de confirmar'));
      session.step = 'pending_approval';
    } else {
      await send(from, `😊 Recebi sua imagem! Se precisar de algo, digite normalmente.`);
    }
    return;
  }

  // Confirmar transcrição
  if (session.step === 'confirm_transcription') {
    if (lower === 'sim' || lower === 's') {
      session.step = session._prevStep || 'start';
      delete session._prevStep;
      const transcribed = session.pendingTranscription || '';
      session.pendingTranscription = null;
      await processText(from, session, transcribed);
    } else {
      session.step = session._prevStep || 'start';
      delete session._prevStep;
      session.pendingTranscription = null;
      await send(from, `Ok! Por favor, digite sua mensagem normalmente. 😊`);
    }
    return;
  }

  await processText(from, session, effectiveRaw);
});

// ── Core state machine ─────────────────────────────
async function processText(from, session, raw) {
  const lower = raw.toLowerCase();

  switch (session.step) {
    case 'start':
      await send(from,
        `Olá! Seja bem-vindo(a) ao *${RESTAURANT}* 🍣🔥\n\nTudo bem? 😊\n\n` +
        `Para começar, qual é o seu *nome completo*?\n\n_Dica: você também pode mandar áudios! 🎤_`
      );
      session.step = 'ask_name';
      break;

    case 'ask_name':
      if (raw.length < 2) { await send(from, `Por favor, informe seu nome completo 😊`); break; }
      session.name = raw;
      await send(from,
        `Prazer, *${session.name}*! 😊\nAgora me informe seu *endereço completo* para entrega:`
      );
      session.step = 'ask_address';
      break;

    case 'ask_address':
      if (raw.length < 5) { await send(from, `Por favor, informe o endereço completo 📍`); break; }
      session.address = raw;
      await send(from,
        `Perfeito! 📍\nO que gostaria de fazer?\n*1* — Novo pedido 🛒\n*2* — Checar status 📦`
      );
      session.step = 'main_menu';
      break;

    case 'main_menu':
      if (raw === '1') {
        await send(from, cardapioText());
        session.step = 'ordering';
      } else if (raw === '2') {
        await send(from, `📦 Status do pedido\nFale conosco: *${PIX_KEY}*\nOu digite *1* para novo pedido.`);
      } else {
        await send(from, `Escolha:\n*1* — Novo pedido 🛒\n*2* — Checar status 📦`);
      }
      break;

    case 'ordering': {
      if (lower === 'feito') {
        if (!session.cart.length) { await send(from, `⚠️ Carrinho vazio! Digite o número de um item.`); break; }
        await send(from,
          `🛒 *Resumo do pedido:*\n${cartSummary(session.cart)}\n\n` +
          `💳 Como vai pagar?\n*1* — PIX (${PIX_KEY})\n*2* — Cartão de crédito (na entrega)\n*3* — Cartão de débito (na entrega)\n*4* — Dinheiro (na entrega)`
        );
        session.step = 'ask_payment';
        break;
      }

      if (lower === 'ver carrinho' || lower === 'carrinho') {
        await send(from, session.cart.length
          ? `🛒 Carrinho:\n${cartSummary(session.cart)}\nContinue ou digite *FEITO* ✅`
          : `🛒 Carrinho vazio! Digite o número de um item.`
        );
        break;
      }

      if (lower === 'limpar') {
        session.cart = [];
        await send(from, `🗑️ Carrinho limpo!`);
        break;
      }

      const parts = raw.split(/\s+/);
      const item = findItem(parts[0]);
      const qty  = Math.max(1, parseInt(parts[1]) || 1);

      if (item) {
        session.currentItemId = item.id;
        session._pendingQty   = qty;
        session.step = 'ask_obs';
        await send(from,
          `✅ ${qty}x ${item.nome} — R$ ${(item.preco * qty).toFixed(2)}\nAlguma observação para este item?\nSe não tiver, responda *N*`
        );
      } else {
        await send(from,
          `❓ Código ${parts[0]} não encontrado.\nDigite *CARDAPIO* para ver o menu.`
        );
      }
      break;
    }

    case 'ask_obs': {
      const item = findItem(session.currentItemId);
      if (!item) { session.step = 'ordering'; break; }
      const obs = (
