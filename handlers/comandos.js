const { User } = require('../database')
const { descargarYoutube, descargarTikTok, descargarInstagram, descargarFacebook } = require('./descargas')

async function handleComando(sock, from, cmd, texto, msg, numero, isAdmin) {
  const args = texto.slice(1).split(' ').slice(1)
  const query = args.join(' ')

  switch (cmd) {
    case 'menu':
    case 'help':
    case 'ayuda': {
      const botNombre = process.env.BOT_NAME || 'Zyon'
      await sock.sendMessage(from, {
        text: `╔══════════════════╗
║   🤖 *${botNombre} - MENÚ*   ║
╚══════════════════╝

*📥 DESCARGAS*
┣ .yt [nombre/link] — YouTube video
┣ .ytm [nombre/link] — YouTube música
┣ .tt [link] — TikTok
┣ .ig [link] — Instagram
┗ .fb [link] — Facebook

*📊 RANKINGS*
┣ .menu — Ver este menú
┣ .ranking — Top mensajes
┣ .toparchivos — Top archivos
┣ .topactivos — Top activos
┗ .topinactivos — Top inactivos

*👑 SOLO ADMINS*
┣ .inactivos [n] — Ver inactivos
┣ .eliminarinactivos [n] — Eliminar
┣ .ban [@usuario] — Expulsar
┗ .editarnombre [nombre] — Cambiar nombre grupo

_Respóndeme con mi nombre para chatear_ 😊`,
        quoted: msg
      })
      break
    }

    case 'yt':
    case 'youtube': {
      if (!query) return sock.sendMessage(from, { text: '❌ Uso: .yt [nombre o link]', quoted: msg })
      await descargarYoutube(sock, from, msg, query, 'video')
      break
    }

    case 'ytm':
    case 'ytmusic': {
      if (!query) return sock.sendMessage(from, { text: '❌ Uso: .ytm [nombre o link]', quoted: msg })
      await descargarYoutube(sock, from, msg, query, 'audio')
      break
    }

    case 'tt':
    case 'tiktok': {
      if (!query) return sock.sendMessage(from, { text: '❌ Uso: .tt [link de TikTok]', quoted: msg })
      await descargarTikTok(sock, from, msg, query, 'video')
      break
    }

    case 'ig':
    case 'instagram': {
      if (!query) return sock.sendMessage(from, { text: '❌ Uso: .ig [link de Instagram]', quoted: msg })
      await descargarInstagram(sock, from, msg, query)
      break
    }

    case 'fb':
    case 'facebook': {
      if (!query) return sock.sendMessage(from, { text: '❌ Uso: .fb [link de Facebook]', quoted: msg })
      await descargarFacebook(sock, from, msg, query)
      break
    }

    case 'ranking':
    case 'topmensajes':
      await mostrarRanking(sock, from)
      break

    case 'toparchivos':
      await mostrarRankingArchivos(sock, from)
      break

    case 'topactivos':
      await mostrarRanking(sock, from)
      break

    case 'topinactivos':
      await mostrarInactivos(sock, from, msg, 10)
      break

    case 'inactivos': {
      if (!isAdmin) return noPermiso(sock, from, msg)
      await mostrarInactivos(sock, from, msg, parseInt(args[0]) || 10)
      break
    }

    case 'eliminarinactivos': {
      if (!isAdmin) return noPermiso(sock, from, msg)
      await eliminarInactivos(sock, from, msg, parseInt(args[0]) || 10)
      break
    }

    case 'eliminar':
    case 'ban': {
      if (!isAdmin) return noPermiso(sock, from, msg)
      const mencionados = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      if (!mencionados.length) return sock.sendMessage(from, { text: '❌ Menciona al usuario con @', quoted: msg })
      for (const m of mencionados) {
        await sock.groupParticipantsUpdate(from, [m], 'remove')
      }
      await sock.sendMessage(from, { text: `🚫 Usuario(s) eliminado(s) del grupo`, quoted: msg })
      break
    }

    case 'editarnombre': {
      if (!isAdmin) return noPermiso(sock, from, msg)
      if (!query) return
      await sock.groupUpdateSubject(from, query)
      await sock.sendMessage(from, { text: `✅ Nombre cambiado a: *${query}*`, quoted: msg })
      break
    }
  }
}

async function mostrarRanking(sock, from) {
  const users = await User.find().sort({ mensajes: -1 }).limit(10)
  let texto = `🏆 *TOP 10 - MENSAJES*\n━━━━━━━━━━━━━━\n`
  users.forEach((u, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
    texto += `${medal} @${u.numero.split('@')[0]}: ${u.mensajes} msgs\n`
  })
  await sock.sendMessage(from, { text: texto })
}

async function mostrarRankingArchivos(sock, from) {
  const users = await User.find().sort({ archivos: -1 }).limit(10)
  let texto = `📁 *TOP 10 - ARCHIVOS*\n━━━━━━━━━━━━━━\n`
  users.forEach((u, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
    texto += `${medal} @${u.numero.split('@')[0]}: ${u.archivos} archivos\n`
  })
  await sock.sendMessage(from, { text: texto })
}

async function mostrarInactivos(sock, from, msg, cantidad) {
  const users = await User.find().sort({ mensajes: 1 }).limit(cantidad)
  let texto = `😴 *TOP ${cantidad} INACTIVOS*\n━━━━━━━━━━━━\n`
  const menciones = []
  users.forEach((u, i) => {
    texto += `${i + 1}. @${u.numero.split('@')[0]}: ${u.mensajes} msgs\n`
    menciones.push(u.numero)
  })
  texto += `\n⚠️ ¡Actívense o serán eliminados!`
  await sock.sendMessage(from, { text: texto, mentions: menciones })
}

async function eliminarInactivos(sock, from, msg, cantidad) {
  const users = await User.find().sort({ mensajes: 1 }).limit(cantidad)
  for (const u of users) {
    try { await sock.groupParticipantsUpdate(from, [u.numero], 'remove') } catch (e) {}
  }
  await sock.sendMessage(from, { text: `✅ ${cantidad} inactivos eliminados del grupo` })
}

function noPermiso(sock, from, msg) {
  return sock.sendMessage(from, {
    text: `⛔ No tienes permisos para usar este comando!\nSolo administradores 🔒`,
    quoted: msg
  })
}

module.exports = { handleComando }
