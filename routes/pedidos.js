// routes/pedidos.js
const express = require('express');
const router  = express.Router();
const { crearOrden } = require('./pagos');  // importa solo la función

router.post('/pedido', async (req, res) => {
    const { snack, precio } = req.body;
    console.log('Recibi:', { snack, precio });

    try {
        const orden = await crearOrden(snack, precio);  // llama a pagos.js
        res.json({ status: 'ok', ...orden });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ status: 'error', mensaje: error.message });
    }
});

module.exports = router;