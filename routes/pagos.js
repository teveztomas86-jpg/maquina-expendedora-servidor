// routes/pagos.js

const express = require('express');
const router  = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

// ── Función exportada para pedidos.js ─────────────────────
async function crearOrden(snack, precio) {
    const preference = new Preference(client);

    const resultado = await preference.create({
        body: {
            items: [
                {
                    title:      snack,
                    quantity:   1,
                    unit_price: precio
                }
            ]
        }
    });

    return {
        orden_id: resultado.id,
        qr_url:   resultado.init_point
    };
}

// ── Ruta webhook ──────────────────────────────────────────
router.post('/webhook', async (req, res) => {
    const { type, data } = req.body;

    // MercadoPago manda varios tipos de notificaciones
    // solo nos interesa "payment"
    if (type !== 'payment') {
        return res.sendStatus(200);
    }

    try {
        // consultamos a MercadoPago con el ID para verificar el pago
        const payment = new Payment(client);
        const resultado = await payment.get({ id: data.id });

        if (resultado.status === 'approved') {
            console.log('✅ Pago aprobado:', resultado.id);
            console.log('   Producto:', resultado.additional_info?.items?.[0]?.title);
            console.log('   Monto:   $', resultado.transaction_amount);
            // acá después notificamos a la ESP32
        } else {
            console.log('⏳ Pago no aprobado, estado:', resultado.status);
        }

        res.sendStatus(200);

    } catch (error) {
        console.error('Error en webhook:', error);
        res.sendStatus(500);
    }
});

module.exports = { router, crearOrden };