# 🍣 WhatsApp Bot — Cozinha Oriental e Pastelaria do Japonês

Bot de pedidos via WhatsApp com aprovação do proprietário.

---

## Como funciona

1. Cliente manda mensagem → bot apresenta o cardápio
2. Cliente escolhe os itens digitando os códigos (ex: `C1 2`)
3. Cliente informa nome, endereço e observações
4. Bot envia o pedido para o WhatsApp do dono para aprovação
5. Dono responde `CONFIRMAR` ou `RECUSAR`
6. Cliente recebe a confirmação automaticamente

---

## Passo a passo para colocar no ar

### 1. Criar conta Twilio (grátis para testar)

1. Acesse https://www.twilio.com e clique em **Sign Up**
2. Confirme o email
3. No painel, anote:
   - **Account SID** (começa com `AC...`)
   - **Auth Token**
4. Vá em **Messaging → Try it out → Send a WhatsApp message**
5. Siga as instruções para ativar o **Sandbox do WhatsApp**
   - Você vai enviar uma mensagem para o número deles com um código
   - O número do sandbox será algo como `whatsapp:+14155238886`

### 2. Fazer deploy no Railway (grátis)

1. Acesse https://railway.app e faça login com GitHub
2. Clique em **New Project → Deploy from GitHub repo**
3. Suba esse código para um repositório no GitHub primeiro:
   - Crie uma conta em https://github.com se não tiver
   - Crie um repositório novo chamado `cozinha-oriental-bot`
   - Faça upload dos arquivos `index.js`, `package.json`
   - **NÃO** suba o arquivo `.env` (contém senhas)
4. No Railway, selecione o repositório
5. Vá em **Variables** e adicione as variáveis:

```
TWILIO_ACCOUNT_SID = ACxxxxxxx...
TWILIO_AUTH_TOKEN  = xxxxxxx...
TWILIO_WHATSAPP_NUMBER = whatsapp:+14155238886
PORT = 3000
```

6. Clique em **Deploy**
7. Após o deploy, copie a URL gerada (ex: `https://cozinha-bot-production.up.railway.app`)

### 3. Conectar o Twilio ao seu servidor

1. No painel Twilio, vá em **Messaging → Settings → WhatsApp Sandbox Settings**
2. No campo **"When a message comes in"**, cole:
   ```
   https://SUA-URL-DO-RAILWAY.up.railway.app/webhook
   ```
3. Selecione método **POST**
4. Clique em **Save**

### 4. Testar

1. No WhatsApp, mande uma mensagem para o número do sandbox Twilio
2. O bot deve responder com o menu
3. Faça um pedido de teste
4. Verifique se o número `+55 19 99566-7073` recebeu a notificação

### 5. Migrar para número real (quando quiser)

Quando quiser usar seu próprio número de WhatsApp:
- Assine o plano Twilio pago (~$15/mês) e solicite aprovação da Meta
- **Ou** migre para a **Z-API** (https://z-api.io, ~R$97/mês) que usa número comum
- Para Z-API, o código muda pouca coisa — avise e atualizo o código

---

## Comandos que o cliente pode usar

| Comando | Ação |
|---------|------|
| `oi`, `olá`, `menu` | Volta ao menu inicial |
| `1` | Ver cardápio e fazer pedido |
| `C1 2` | Adiciona 2x Combinado 1 |
| `T3 1` | Adiciona 1x Temaki Grelhado com arroz |
| `ver carrinho` | Mostra o carrinho atual |
| `limpar` | Esvazia o carrinho |
| `feito` | Finaliza o pedido |
| `0` ou `sair` | Sai e reseta a conversa |

## Comandos do dono (+55 19 99566-7073)

| Comando | Ação |
|---------|------|
| `CONFIRMAR whatsapp:+55119XXXXXXXX` | Confirma o pedido do cliente |
| `RECUSAR whatsapp:+55119XXXXXXXX` | Recusa o pedido do cliente |

> O número do cliente aparece automaticamente na notificação, é só copiar e colar.

---

## Estrutura dos arquivos

```
whatsapp-bot/
├── index.js        ← Código principal do bot
├── package.json    ← Dependências
├── .env.example    ← Modelo das variáveis de ambiente
└── README.md       ← Este arquivo
```

---

## Dúvidas ou problemas?

Se precisar de ajuda em qualquer etapa, manda a mensagem de erro e resolvo!
