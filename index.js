const { default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
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
let codigoActual = null
let estadoConexion = 'iniciando'
let dbConectada = false
let pairingRequested = false

function buildHTML() {
  const color = estadoConexion === 'conectado' ? '#25D366' : '#f59e0b'
  let contenido = ''
  if (estadoConexion === 'conectado') {
    contenido = '<div class="conectado">✅ ¡Bot conectado!</div><p style="color:#6b7280">El bot está activo y funcionando.</p>'
  } else if (codigoActual) {
    contenido = '<div class="code">' + codigoActual + '</div>'
    contenido += '<div class="steps">'
    contenido += '<div class="step"><div class="num">1</div><div>Abre <b>WhatsApp Business</b></div></div>'
    contenido += '<div class="step"><div class="num">2</div><div><b>Ajustes → Dispositivos vinculados</b></div></div>'
    contenido += '<div class="step"><div class="num">3</div><div>Toca <b>"Vincular un dispositivo"</b></div></div>'
    contenido += '<div class="step"><div class="num">4</div><div>Toca <b>"Vincular con número de teléfono"</b></div></div>'
    contenido += '<div class="step"><div class="num">5</div><div>Escribe el código de arriba</div></div>'
    contenido += '</div>'
  } else {
    contenido = '<div class="esperando">⏳ Generando código...<br><small>Recarga en unos segundos</small></div>'
  }
  return '<!DOCTYPE html><html><head>'
    + '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>Bot Zyon</title><meta http-equiv="refresh" content="5">'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:Arial,sans-serif;background:#111827;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}'
    + '.box{background:#1f2937;border-radius:20px;padding:36px 28px;text-align:center;max-width:440px;width:100%}'
    + 'h1{color:#25D366;margin-bottom:4px;font-size:24px}'
    + '.sub{font-size:13px;color:#6b7280;margin-bottom:20px}'
    + '.code{font-size:48px;font-weight:900;letter-spacing:8px;color:#25D366;background:#0d1117;padding:24px 16px;border-radius:16px;margin:16px 0;font-family:monospace;border:2px solid #25D366}'
    + '.steps{text-align:left;background:#111827;border-radius:12px;padding:20px;font-size:14px;line-height:2.4;margin-top:12px}'
    + '.step{display:flex;align-items:flex-start;gap:10px;margin-bottom:4px}'
    + '.num{background:#25D366;color:black;border-radius:50%;width:22px;height:22px;min-width:22px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;margin-top:3px}'
    + '.conectado{color:#25D366;font-size:24px;margin:20px 0}'
    + '.esperando{color:#9ca3af;margin:20px 0;font-size:15px}'
    + '.refresh{margin-top:16px;font-size:11px;color:#374151}'
    + '</style></head><body>'
    + '<div class="box"><h1>🤖 Bot Zyon</h1>'
    + '<div class="sub">Estado: <b style="color:' + color + '">' + estadoConexion + '</b></div>'
    + contenido
    + '<div class="refresh">🔄 Se actualiza cada 5 segundos</div>'
    + '</div></body></html>'
}

const server = http.createServer((req, res) => {
  if (req.url === '/code') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(buildHTML())
  } else {
    res.writeHead(200)
    res.end('Bot Zyon activo ✅ | Código en: /code')
  }
})

server.listen(process.env.PORT || 3000, () => {
  console.log('✅ Servidor HTTP activo — Código en /code')
})

function limpiarSesion() {
  try {
    if (fs.existsSync('./auth_info')) {
      fs.rmSync('./auth_info', { recursive: true, force: true })
      console.log('🗑️ Sesión eliminada')
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
  codigoActual = null
  pairingRequested = false

  if (!dbConectada) {
    await connectDB()
    dbConectada = true
  }

  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false,
    browser: ['WhatsApp Web', 'Chrome', '2.2412.54'],
    syncFullHistory: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'connecting') {
      if (!pairingRequested && !sock.authState.creds.registered) {
        pairingRequested = true
        estadoConexion = 'generando código'
        setTimeout(async () => {
          try {
            const raw = await sock.requestPairingCode(OWNER_RAW)
            const clean = (raw || '').replace(/-/g, '')
            codigoActual = clean.length === 8
              ? clean.slice(0, 4) + '-' + clean.slice(4)
              : raw
            estadoConexion = 'esperando código'
            console.log('\n==============================')
            console.log('🔑 CÓDIGO: ' + codigoActual)
            console.log('🌐 https://bot-zyon.onrender.com/code')
            console.log('==============================\n')
          } catch (err) {
            console.error('❌ Error código:', err.message)
            pairingRequested = false
            estadoConexion = 'error generando código'
          }
        }, 3000)
      }
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      codigoActual = null
      console.log('🔴 Desconectado, código:', code)
      if (code === DisconnectReason.loggedOut) {
        limpiarSesion()
      }
      estadoConexion = 'reconectando'
      setTimeout(startBot, 5000)
    }
    if (connection === 'open') {
      codigoActual = null
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
        await sock.sendMessage(OWNER, { text: '✅ Me llamaré *' + nombre + '*\n\n¿Qué género prefieres?\n1️⃣ Masculino\n2️⃣ Femenino' })
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
        await sock.sendMessage(OWNER, { text: '🎉 Todo listo!\n\n🤖 Nombre: *' + config.botNombre + '*\n👤 Género: *' + genero + '*\n\n¡Agrégame al grupo! 🚀' })
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
