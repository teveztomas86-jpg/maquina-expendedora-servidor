// routes/pedidos.js
const express        = require('express');
const router         = express.Router();
const { crearOrden } = require('./pagos');
const Transaccion    = require('../models/Transaccion');
const { obtenerProducto, disponibles } = require('../tienda');   // ← NUEVO

router.post('/pedido', async (req, res) => {
    const { snack } = req.body;                 // ← ya no usamos el precio del body
    console.log('Recibi snack:', snack);

    try {
        // El precio y el stock los decide el servidor, según el panel:
        const producto = await obtenerProducto(snack);
        if (!producto) {
            return res.status(404).json({ status: 'error', error: 'snack_desconocido' });
        }
        if (disponibles(producto) <= 0) {
            return res.status(409).json({ status: 'error', error: 'sin_stock' });
        }

        const precio = producto.precio;         // ← precio desde la base de datos

        const orden = await crearOrden(snack, precio);
        res.json({ status: 'ok', precio, ...orden });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ status: 'error', mensaje: error.message });
    }
});

router.get('/estado/:orden_id', async (req, res) => {
    const { orden_id } = req.params;

    try {
        const transaccion = await Transaccion.findOne({ orden_id });

        if (!transaccion || transaccion.status !== 'completado') {
            return res.json({ status: 'pendiente' });
        }

        res.json({ status: 'completado' });

    } catch (error) {
        console.error('Error consultando estado:', error);
        res.status(500).json({ status: 'error' });
    }
});

module.exports = router;