// routes/pagos.js
const express = require('express');
const router  = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const Transaccion = require('../models/Transaccion');
const { registrarVenta } = require('../tienda');     // ← NUEVO
const { Venta }          = require('../models/modelos');     // ← NUEVO (para el chequeo anti-duplicado)

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

let orden_id;

async function crearOrden(snack, precio) {
    const preference = new Preference(client);

    const resultado = await preference.create({
    body: {
        items: [{ title: snack, quantity: 1, unit_price: precio }],
        notification_url: 'https://maquina-expendedora-servidor-production.up.railway.app/pagos/webhook?source_news=webhooks'
    }
});

    orden_id = resultado.id;

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
        //console.log("PAGO COMPLETO:", JSON.stringify(resultado, null, 2));

        const snack    = resultado.additional_info?.items?.[0]?.title  || 'desconocido';
        const precio   = resultado.transaction_amount                  || 0;
        const webhook_id = resultado.id;

        if (resultado.status === 'approved') {
            // Guardar transacción completada
            const transaccion = new Transaccion({
                snack,
                precio,
                orden_id,
                status: 'completado'
            });
            await transaccion.save();

            // ── NUEVO: registrar la venta para el panel (baja stock + suma ganancia) ──
            // Una sola vez por pago: si este webhook_id ya se registró, no lo repite.
            const yaRegistrada = await Venta.findOne({ ordenId: webhook_id });
            if (!yaRegistrada) {
                await registrarVenta(snack, { ordenId: webhook_id, precioCobrado: precio });
                console.log('Venta registrada:', snack, precio);
            }

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