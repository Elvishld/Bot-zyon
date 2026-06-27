const { preguntarIA } = require('../ai')
const { User } = require('../database')

const PREFIJOS = ['/','!','?','\\','#','.']

function tienePrefijo(texto) {
  return PREFIJOS.some(p => 
    texto.startsWith(p))
}

function obtenerComando(texto) {
  return texto.slice(1).split(' ')[0]
    .toLowerCase()
}

async function handleMessage(sock, msg) {
  try {
    const from = msg.key.remoteJid
    const numero = msg.key.participant 
      || msg.key.remoteJid
    const isGroup = from.endsWith('@g.us')
    
    const texto = msg.message?.conversation 
      || msg.message?.extendedTextMessage
        ?.text || ''
    
    if (!texto) return

    const botNombre = process.env.BOT_NAME 
      || 'Zyon'
    const mencionaBot = texto.toLowerCase()
      .includes(botNombre.toLowerCase())

    let user = await User.findOne({ numero })
    if (!user) {
      user = new User({ numero })
      await user.save()
    }

    user.mensajes += 1
    await user.save()

    if (tienePrefijo(texto)) {
      const cmd = obtenerComando(texto)
      await manejarComando(
        sock, from, cmd, texto, 
        msg, numero, user)
      return
    }

    if (mencionaBot || !isGroup) {
      const respuesta = await preguntarIA(
        texto,
        user.historial.slice(-10),
        user.estado,
        botNombre,
        process.env.BOT_GENDER || 'masculino'
      )

      user.historial.push({
        rol: 'usuario', texto, 
        fecha: new Date()
      })
      user.historial.push({
        rol: 'bot', texto: respuesta,
        fecha: new Date()
      })
      if (user.historial.length > 50) {
        user.historial = 
          user.historial.slice(-50)
      }
      await user.save()

      await sock.sendMessage(from, { 
        text: respuesta,
        quoted: msg
      })
    }
  } catch (error) {
    console.error('Error mensaje:', error)
  }
}

async function manejarComando(
  sock, from, cmd, texto, msg, numero, user) {
  
  switch(cmd) {
    case 'menu':
    case 'help':
    case 'ayuda':
    case 'comandos':
      await sock.sendMessage(from, { 
        text: obtenerMenu() 
      })
      break
    default:
      break
  }
}

function obtenerMenu() {
  return `
╔══════════════════════╗
✦  ZYON  ✦
╚══════════════════════╝

━━━━ 📋 MENU ━━━━
▸ .menu / .help / .ayuda

━━━━ 🤖 IA ━━━━
▸ Zyon + mensaje

━━━━ ⬇️ DESCARGAS ━━━━
▸ .yt / .youtube [link/nombre]
▸ .ytm / .ytmusic [link/nombre]
▸ .fb / .facebook [link]
▸ .tt / .tiktok [link]
▸ .ig / .instagram [link]

━━━━ 🎧 MUSICA ━━━━
▸ .shazam [audio/video]
▸ .musica / .soundfi
