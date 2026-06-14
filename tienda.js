// tienda.js
const { Producto, Venta } = require('./models/modelos');

// Busca el snack por su letra ('A'...). Devuelve el documento, o null si no existe / está inactivo.
async function obtenerProducto(letra) {
    if (!letra) return null;
    return Producto.findOne({ letra: String(letra).toUpperCase(), activo: true });
}

// Unidades que quedan: capacidad - vendidosDesdeRecarga. Nunca negativo.
function disponibles(producto) {
    if (!producto) return 0;
    return Math.max(producto.capacidad - producto.vendidosDesdeRecarga, 0);
}

// Registra una venta CONFIRMADA: baja stock, suma contadores y guarda la fila para las ganancias.
// Llamar SOLO cuando el pago ya está "completado", y una sola vez por pago.
async function registrarVenta(letra, { ordenId = '', precioCobrado = null } = {}) {
    const producto = await obtenerProducto(letra);
    if (!producto) return null;                       // letra desconocida: no registra nada

    producto.vendidosDesdeRecarga += 1;
    producto.vendidosTotal += 1;
    await producto.save();

    const venta = await Venta.create({
        letra:   producto.letra,
        nombre:  producto.nombre,
        precio:  precioCobrado != null ? precioCobrado : producto.precio,
        ordenId,
        fecha:   new Date(),
    });
    return venta;
}

module.exports = { obtenerProducto, disponibles, registrarVenta };