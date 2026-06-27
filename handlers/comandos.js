const { User } = require('../database')
const { descargarYoutube, 
  descargarTikTok } = require('./descargas')

async function handleComando(
  sock, from, cmd, texto, msg, 
  numero, isAdmin) {
  
  const args = texto.slice(1)
    .split(' ').slice(1)
  const query = args.join(' ')

  switch(cmd) {
    case 'yt':
    case 'youtube':
      if (!query) return sock.sendMessage(
        from, { 
          text: '❌ Escribe: .yt [nombre o link]',
          quoted: msg 
        })
      await sock.sendMessage(from, {
        text: `🎬 ¿Cómo lo quieres?\n1️⃣ Video normal\n2️⃣ Documento`,
        quoted: msg
      })
      break

    case 'ytm':
    case 'ytmusic':
      if (!query) return sock.sendMessage(
        from, { 
          text: '❌ Escribe: .ytm [nombre o link]',
          quoted: msg 
        })
      await sock.sendMessage(from, {
        text: `🎵 ¿Cómo lo quieres?\n1️⃣ Audio normal\n2️⃣ Documento`,
        quoted: msg
      })
      await descargarYoutube(
        sock, from, msg, query, 'audio')
      break

    case 'tt':
    case 'tiktok':
      if (!query) return sock.sendMessage(
        from, { 
          text: '❌ Escribe: .tt [link]',
          quoted: msg 
        })
      await sock.sendMessage(from, {
        text: `🎬 ¿Cómo lo quieres?\n1️⃣ Video normal\n2️⃣ Documento`,
        quoted: msg
      })
      await descargarTikTok(
        sock, from, msg, query, 'video')
      break

    case 'ranking':
    case 'topmensajes':
      await mostrarRanking(
        sock, from, 'mensajes')
      break

    case 'toparchivos':
      await mostrarRanking(
        sock, from, 'archivos')
      break

    case 'topactivos':
      await mostrarRanking(
        sock, from, 'activos')
      break

    case 'topinactivos':
      await mostrarRanking(
        sock, from, 'inactivos')
      break

    case 'inactivos':
      if (!isAdmin) return noPermiso(
        sock, from, msg)
      await mostrarInactivos(
        sock, from, msg, 
        parseInt(args[0]) || 10)
      break

    case 'eliminarinactivos':
      if (!isAdmin) return noPermiso(
        sock, from, msg)
      await eliminarInactivos(
        sock, from, msg,
        parseInt(args[0]) || 10)
      break

    case 'eliminar':
    case 'ban':
      if (!isAdmin) return noPermiso(
        sock, from, msg)
      const mencionados = msg.message
        ?.extendedTextMessage
        ?.contextInfo?.mentionedJid || []
      if (!mencionados.length) return
      for (const m of mencionados) {
        await sock.groupParticipantsUpdate(
          from, [m], 'remove')
      }
      await sock.sendMessage(from, {
        text: `🚫 Usuario eliminado del grupo`,
        quoted: msg
      })
      break

    case 'editarnombre':
      if (!isAdmin) return noPermiso(
        sock, from, msg)
      if (!query) return
      await sock.groupUpdateSubject(
        from, query)
      await sock.sendMessage(from, {
        text: `✅ Nombre cambiado a: ${query}`,
        quoted: msg
      })
      break
  }
}

async function mostrarRanking(
  sock, from, tipo) {
  const users = await User.find()
    .sort({ mensajes: -1 }).limit(10)
  
  let texto = `🏆 TOP 10 - ${tipo.toUpperCase()}\n`
  texto += `━━━━━━━━━━━━━━\n`
  
  users.forEach((u, i) => {
    const medal = i === 0 ? '🥇' : 
      i === 1 ? '🥈' : i === 2 ? '🥉' : 
      `${i+1}.`
    texto += `${medal} @${u.numero.split('@')[0]}: ${u.mensajes} msgs\n`
  })
  
  await sock.sendMessage(from, { text: texto })
}

async function mostrarInactivos(
  sock, from, msg, cantidad) {
  const users = await User.find()
    .sort({ mensajes: 1 }).limit(cantidad)
  
  let texto = `😴 TOP ${cantidad} INACTIVOS\n`
  texto += `━━━━━━━━━━━━\n`
  const menciones = []
  
  users.forEach((u, i) => {
    texto += `${i+1}. @${u.numero.split('@')[0]}: ${u.mensajes} msgs\n`
    menciones.push(u.numero)
  })
  
  texto += `\n⚠️ Actívense o serán eliminados!`
  
  await sock.sendMessage(from, {
    text: texto,
    mentions: menciones
  })
}

async function eliminarInactivos(
  sock, from, msg, cantidad) {
  const users = await User.find()
    .sort({ mensajes: 1 }).limit(cantidad)
  
  for (const u of users) {
    try {
      await sock.groupParticipantsUpdate(
        from, [u.numero], 'remove')
    } catch(e) {}
  }
  
  await sock.sendMessage(from, {
    text: `✅ ${cantidad} inactivos eliminados`
  })
}

function noPermiso(sock, from, msg) {
  return sock.sendMessage(from, {
    text: `⛔ No tienes permisos para usar este comando!\nSolo administradores 🔒`,
    quoted: msg
  })
}

module.exports = { handleComando }
