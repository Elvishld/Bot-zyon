const { default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const http = require('http')
const fs = require('fs')
const { connectDB, Grupo } = require('./database')
const { handleMessage } = require('./handlers/mensajes')
const { handleBienvenida } = require('./handlers/bienvenida')

const OWNER_RAW = (process.env.OWNER_NUMBER || '').replace('@s.whatsapp.net', '').replace(/\D/g, '').trim()
const OWNER = OWNER_RAW + '@s.whatsapp.net'

let configurando = false
let esperandoNombre = false
let esperandoGenero = false
let sock
let qrActual = null
let estadoConexion = 'iniciando'
let dbConectada = false

const server = http.createServer((req, res) => {
  if (req.url === '/qr') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bot Zyon - QR</title>
  <meta http-equiv="refresh" content="5">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#111827;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .box{background:#1f2937;border-radius:20px;padding:36px 28px;text-align:center;max-width:440px;width:100%}
    h1{color:#25D366;margin-bottom:4px;font-size:24px}
    .sub{font-size:13px;color:#6b7280;margin-bottom:20px}
    #qrbox{background:white;border-radius:16px;padding:20px;display:inline-block;margin:12px auto}
    .steps{text-align:left;background:#111827;border-radius:12px;padding:20px;font-size:14px;line-height:2.4;margin-top:12px}
    .step{display:flex;align-items:flex-start;gap:10px;margin-bottom:4px}
    .num{background:#25D366;color:black;border-radius:50%;width:22px;height:22px;min-width:22px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;margin-top:3px}
    .conectado{color:#25D366;font-size:24px;margin:20px 0}
    .esperando{color:#9ca3af;margin:20px 0;font-size:15px}
    .refresh{margin-top:16px;font-size:11px;color:#374151}
  </style>
</head>
<body>
<div class="box">
  <h1>🤖 Bot Zyon</h1>
  <div class="sub">Estado: <b style="color:\${estadoConexion==='conectado'?'#25D366':'#f59e0b'}">\${estadoConexion}</b></div>
  \${estadoConexion === 'conectado'
    ? '<div class="conectado">✅ ¡Bot conectado!</div><p style="color:#6b7280">El bot está activo y funcionando.</p>'
    : qrActual
      ? \`<div id="qrbox"></div>
         <div class="steps">
           <div class="step"><div class="num">1</div><div>Abre <b>WhatsApp Business</b></div></div>
           <div class="step"><div class="num">2</div><div><b>Ajustes → Dispositivos vinculados</b></div></div>
           <div class="step"><div class="num">3</div><div>Toca <b>"Vincular un dispositivo"</b></div></div>
           <div class="step"><div class="num">4</div><div>Apunta la cámara al QR de arriba</div></div>
         </div>
         <script>new QRCode(document.getElementById("qrbox"),{text:\${JSON.stringify(qrActual)},width:260,height:260,correctLevel:QRCode.CorrectLevel.L});<\/script>\`
      : '<div class="esperando">⏳ Generando QR...<br><small>Recarga en unos segundos</small></div>'
  }
  <div class="refresh">🔄 Se actualiza cada 5 segundos</div>
</div>
</body>
</html>`)
  } else {
    res.writeHead(200)
    res.end('Bot Zyon activo ✅ | QR en: /qr')
  }
})

server.listen(process.env.PORT || 3000, () => {
  console.log('✅ Servidor HTTP activo — QR en /qr')
})

function limpiarSesion() {
  try {
    if (fs.existsSync('./auth_info')) {
      fs.rmSync('./auth_info', { recursive: true, force: true })
    }
  } catch (e) {}
}

async function configurarBot() {
  try {
    const grupo = await Grupo.findOne({ id: 'config' })
    if (grupo?.configurado) return
    setTimeout(async () => {
      await sock.sendMessage(OWNER, { text: '👋 Hola! Soy tu nuevo bot!\n\n¿Cómo quieres que me llame?' })
      esperandoNombre = true
      configurando = true
    }, 3000)
  } catch (e) {}
}

async function startBot() {
  estadoConexion = 'iniciando'
  qrActual = null

  if (!dbConectada) {
    await connectDB()
    dbConectada = true
  }

  limpiarSesion()

  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: true,
    browser: Browsers.ubuntu('Chrome')
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrActual = qr
      estadoConexion = 'esperando escaneo QR'
      console.log('📱 QR listo en: https://bot-zyon.onrender.com/qr')
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      qrActual = null
      console.log('🔴 Desconectado, código:', code)
      if (code === DisconnectReason.loggedOut) {
        limpiarSesion()
      }
      estadoConexion = 'reconectando'
      setTimeout(startBot, 4000)
    }
    if (connection === 'open') {
      qrActual = null
      estadoConexion = 'conectado'
      console.log('✅ ¡Zyon conectado!')
      await configurarBot()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    if (msg.key.fromMe && msg.key.remoteJid !== OWNER) return
    const from = msg.key.remoteJid
    const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''

    if (configurando && from === OWNER) {
      if (esperandoNombre) {
        const nombre = texto.trim()
        esperandoNombre = false
        esperandoGenero = true
        await sock.sendMessage(OWNER, { text: `✅ Me llamaré *${nombre}*\n\n¿Qué género prefieres?\n1️⃣ Masculino\n2️⃣ Femenino` })
        let config = await Grupo.findOne({ id: 'config' })
        if (!config) config = new Grupo({ id: 'config' })
        config.botNombre = nombre
        await config.save()
        return
      }
      if (esperandoGenero) {
        const config = await Grupo.findOne({ id: 'config' })
        let genero = 'masculino'
        if (texto === '2' || texto.toLowerCase().includes('femen')) genero = 'femenino'
        config.botGenero = genero
        config.configurado = true
        await config.save()
        esperandoGenero = false
        configurando = false
        process.env.BOT_NAME = config.botNombre
        process.env.BOT_GENDER = genero
        await sock.sendMessage(OWNER, { text: `🎉 Todo listo!\n\n🤖 Nombre: *${config.botNombre}*\n👤 Género: *${genero}*\n\n¡Agrégame al grupo! 🚀` })
        return
      }
    }
    await handleMessage(sock, msg)
  })

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    await handleBienvenida(sock, id, participants, action)
  })
}

startBot()
