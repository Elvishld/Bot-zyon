const { preguntarIA } = require('../ai')
const { User } = require('../database')
const { handleComando } = require('./comandos')
const { handleAntilinks } = require('./antilinks')

const PREFIJOS = ['/','>','!','?','\\','#','.']

function tienePrefijo(texto) {
  return PREFIJOS.some(p => texto.startsWith(p))
}

function obtenerComando(texto) {
  return texto.slice(1).split(' ')[0].toLowerCase()
}

async function esAdmin(sock, groupId, numero) {
  try {
    const meta = await sock.groupMetadata(groupId)
    return meta.participants.some(p => 
      p.id === numero && 
      (p.admin === 'admin' || p.admin === 'superadmin'))
  } catch {
    return false
  }
}

async function handleMessage(sock, msg) {
  try {
    const from = msg.key.remoteJid
    const numero = msg.key.participant || msg.key.remoteJid
    const isGroup = from.endsWith('@g.us')

    const texto = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text || ''

    if (!texto) return

    const botNombre = process.env.BOT_NAME || 'Zyon'
    const mencionaBot = texto.toLowerCase()
      .includes(botNombre.toLowerCase())

    let user = await User.findOne({ numero })
    if (!user) {
      user = new User({ numero })
    }
    user.mensajes += 1
    await user.save()

    const isAdmin = isGroup ? 
      await esAdmin(sock, from, numero) : true

    if (isGroup) {
      await handleAntilinks(
        sock, msg, from, numero, isAdmin)
    }

    if (tienePrefijo(texto)) {
      const cmd = obtenerComando(texto)
      await handleComando(
        sock, from, cmd, texto, msg, numero, isAdmin)
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
        rol: 'usuario', texto, fecha: new Date()
      })
      user.historial.push({
        rol: 'bot', texto: respuesta, fecha: new Date()
      })

      if (user.historial.length > 50) {
        user.historial = user.historial.slice(-50)
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

module.exports = { handleMessage }
