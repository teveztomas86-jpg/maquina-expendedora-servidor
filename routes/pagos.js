// routes/pagos.js
const express = require('express');
const router  = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const Transaccion = require('../models/Transaccion');   // ← nuevo

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

async function crearOrden(snack, precio) {
    const preference = new Preference(client);

    const resultado = await preference.create({
        body: {
            items: [{ title: snack, quantity: 1, unit_price: precio }]
        }
    });

    return {
        orden_id: resultado.id,
        qr_url:   resultado.init_point
    };
}

router.post('/webhook', async (req, res) => {
    const { type, data } = req.body;

    if (type !== 'payment') {
        return res.sendStatus(200);
    }

    try {
        const payment  = new Payment(client);
        const resultado = await payment.get({ id: data.id });

        const snack    = resultado.additional_info?.items?.[0]?.title  || 'desconocido';
        const precio   = resultado.transaction_amount                  || 0;
        const orden_id = String(resultado.id);

        if (resultado.status === 'approved') {
            // Guardar transacción completada
            const transaccion = new Transaccion({
                snack,
                precio,
                orden_id,
                status: 'completado'
            });
            await transaccion.save();

            console.log('✅ Pago guardado:', orden_id);

        } else {
            // Guardar transacción con el estado que devuelve MP
            const transaccion = new Transaccion({
                snack,
                precio,
                orden_id,
                status: resultado.status   // "pending", "cancelled", etc.
            });
            await transaccion.save();

            console.log('⏳ Transacción guardada con estado:', resultado.status);
        }

        res.sendStatus(200);

    } catch (error) {
        console.error('Error en webhook:', error);
        res.sendStatus(500);
    }
});

module.exports = { router, crearOrden };