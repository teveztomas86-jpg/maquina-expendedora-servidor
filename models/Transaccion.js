// models/Transaccion.js
const mongoose = require('mongoose');

const transaccionSchema = new mongoose.Schema({
    snack:    { type: String, required: true },
    precio:   { type: Number, required: true },
    orden_id: { type: String, required: true },
    status:   { type: String, default: 'pendiente' },
    fecha:    { type: Date,   default: Date.now }
});

module.exports = mongoose.model('Transaccion', transaccionSchema);