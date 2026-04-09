app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const from      = req.body.From;
  const raw       = (req.body.Body || '').trim();
  const lower     = raw.toLowerCase();
  const upper     = raw.toUpperCase();
  const numMedia  = parseInt(req.body.NumMedia || '0');
  const mediaUrl  = req.body.MediaUrl0;
  const mediaType = (req.body.MediaContentType0 || '');

  // ── Permite owner testar como cliente ─────────────
  let effectiveRaw = raw;
  if (from === OWNER_NUMBER && lower.startsWith('cliente ')) {
    effectiveRaw = raw.substring(8).trim();
  }

  // ── Comando reiniciar/menu ────────────────────────
  if (lower === 'menu' || lower === 'reiniciar') {
    resetSession(from);
    const session = getSession(from);
    await processText(from, session, 'oi'); // simula primeira mensagem
    return;
  }

  // ── Operador simplificado ─────────────────────────
  if (from === OWNER_NUMBER) {
    // Confirmar pedido com "OK"
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

        await send(OWNER_NUMBER,
          `✅ Confirmação enviada para ${s.name} (${s.orderId}).`
        );

        resetSession(clientNum);
      } else {
        await send(OWNER_NUMBER, `⚠️ Nenhum pedido pendente para confirmar.`);
      }

    // Cancelar pedido com "NAO"
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

    return; // não processa como cliente
  }

  const session = getSession(from);

  // ── Áudio: transcrever com Whisper ──────────────
  if (numMedia > 0 && mediaType.includes('audio')) {
    await send(from, `🎤 Recebi seu áudio! Transcrevendo... um segundo ⏳`);

    let transcribed = '';
    try { transcribed = await transcribeAudio(mediaUrl); }
    catch (e) {
      console.error('Whisper error:', e.message);
      await send(from, `😕 Não consegui entender o áudio desta vez. Por favor, tente digitar.`);
      return;
    }

    if (!transcribed || transcribed.length < 2) {
      await send(from, `😕 Não consegui transcrever o áudio. Pode tentar falar mais devagar ou digitar?`);
      return;
    }

    session.pendingTranscription = transcribed;
    session._prevStep = session.step;
    session.step = 'confirm_transcription';

    await send(from,
      `🎤 *Entendi o seguinte:*\n\n"${transcribed}"\n\n` +
      `Está correto?\n*SIM* — usar este texto\n*NÃO* — cancelar e digitar manualmente`
    );
    return;
  }

  // ── Mídia não-áudio (imagem, vídeo, doc) ───────
  if (numMedia > 0 && !mediaType.includes('audio')) {
    if (session.step === 'await_pix') {
      const total = session.cart.reduce((s, i) => s + i.preco * i.qty, 0);
      await send(from,
        `✅ *Comprovante recebido!*\n\n` +
        `Estamos verificando o pagamento de *R$ ${total.toFixed(2)}*.\n` +
        `Seu pedido *${session.orderId}* vai para a cozinha assim que confirmado! 🍣`
      );
      await send(OWNER_NUMBER, ownerMsg(session, from, 'Comprovante PIX enviado pelo cliente — verificar antes de confirmar'));
      session.step = 'pending_approval';
    } else {
      await send(from, `😊 Recebi sua imagem! Se precisar de algo, é só digitar.`);
    }
    return;
  }

  // ── Confirmar transcrição ─────────────────────────
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
      await send(from, `Ok! Por favor, *digite sua mensagem* normalmente. 😊`);
    }
    return;
  }

  // ── Processa mensagem de texto ───────────────────
  await processText(from, session, effectiveRaw);
});
