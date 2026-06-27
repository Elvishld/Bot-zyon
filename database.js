const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  numero: String,
  nombre: String,
  estado: { type: String, default: 'neutral' },
  historial: { type: Array, default: [] },
  enamoradoDe: { type: String, default: null },
  advertencias: { type: Number, default: 0 },
  mensajes: { type: Number, default: 0 },
  archivos: { type: Number, default: 0 },
  ultimoReset: { type: Date, default: Date.now }
})

const grupoSchema = new mongoose.Schema({
  id: String,
  nombre: String,
  botNombre: { type: String, default: 'Zyon' },
  botGenero: { type: String, default: 'masculino' },
  configurado: { type: Boolean, default: false },
  antilinks: { type: Boolean, default: true }
})

const sessionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  value: { type: String }
})

const User = mongoose.model('User', userSchema)
const Grupo = mongoose.model('Grupo', grupoSchema)
const Session = mongoose.model('Session', sessionSchema)

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ MongoDB conectado!')
  } catch (error) {
    console.error('❌ Error MongoDB:', error)
    process.exit(1)
  }
}

module.exports = { connectDB, User, Grupo, Session }
