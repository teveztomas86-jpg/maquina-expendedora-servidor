// routes/pagos.js
const express = require('express');
const router  = express.Router();
const { MercadoPagoConfig, Preference } = require('mercadopago');

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

// función reutilizable — la pueden usar otros archivos
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

// exportamos tanto el router como la función
module.exports = { crearOrden };