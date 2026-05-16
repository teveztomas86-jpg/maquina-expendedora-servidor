// routes/pedidos.js
const express      = require('express');
const router       = express.Router();
const { crearOrden } = require('./pagos');
const Transaccion  = require('../models/Transaccion');  // ← nuevo

router.post('/pedido', async (req, res) => {
    const { snack, precio } = req.body;
    console.log('Recibi:', { snack, precio });

    try {
        const orden = await crearOrden(snack, precio);
        res.json({ status: 'ok', ...orden });
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