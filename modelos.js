// modelos.js
const mongoose = require('mongoose');

// ── Producto: precio + stock de cada snack ──
const productoSchema = new mongoose.Schema({
    letra:     { type: String, required: true, unique: true, uppercase: true, trim: true }, // 'A','B','C','D'
    nombre:    { type: String, default: '' },                          // nombre visible, ej "Papas"
    precio:    { type: Number, required: true, min: 0 },               // precio en pesos (lo cobra el servidor)
    capacidad: { type: Number, required: true, min: 0, default: 10 },  // unidades cuando está lleno
    vendidosDesdeRecarga: { type: Number, default: 0, min: 0 },        // vendidos desde la última recarga → "a reponer"
    vendidosTotal:        { type: Number, default: 0, min: 0 },        // histórico, NO se reinicia
    fechaUltimaRecarga:   { type: Date, default: Date.now },
    activo:    { type: Boolean, default: true },                       // false = no se vende ni aparece
}, { timestamps: true });

// ── Venta: una fila por cada pago confirmado ──
const ventaSchema = new mongoose.Schema({
    letra:   { type: String, required: true, uppercase: true },
    nombre:  { type: String, default: '' },
    precio:  { type: Number, required: true },   // precio cobrado EN EL MOMENTO de la venta
    ordenId: { type: String, default: '' },      // orden_id de MercadoPago (opcional)
    fecha:   { type: Date, default: Date.now },
}, { timestamps: true });

ventaSchema.index({ fecha: 1 });   // acelera las consultas por rango ("últimos 30 días")

const Producto = mongoose.model('Producto', productoSchema);
const Venta    = mongoose.model('Venta', ventaSchema);

module.exports = { Producto, Venta };