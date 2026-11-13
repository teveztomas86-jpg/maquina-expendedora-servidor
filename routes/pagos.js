// routes/pagos.js
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const Transaccion = require('../models/Transaccion');
const { registrarVenta } = require('../tienda');
const { Venta }          = require('../models/modelos');

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

// ── Selector de modo ──────────────────────────────────────────────────────
// Si MP_EXTERNAL_POS_ID está definida  → QR dinámico interoperable (API de Orders).
// Si NO está definida                  → Checkout Pro (comportamiento anterior, sin cambios).
const POS_ID         = process.env.MP_EXTERNAL_POS_ID;
const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;      // opcional: valida la firma del webhook
const MP_API         = 'https://api.mercadopago.com';

// El ESP32 consulta /estado durante 24 × 5 s = 120 s. La order vence a los 2 minutos
// para que nadie pueda pagar un QR que la máquina ya dejó de esperar.
const VENCIMIENTO_QR = 'PT2M';

// Llamada genérica a la API de MercadoPago. Devuelve el JSON o lanza un Error con el detalle.
async function mpFetch(metodo, ruta, cuerpo) {
    const headers = {
        'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN,
        'Content-Type':  'application/json'
    };
    if (metodo === 'POST') headers['X-Idempotency-Key'] = crypto.randomUUID();   // obligatorio en POST /v1/orders

    const resp = await fetch(MP_API + ruta, {
        method: metodo,
        headers,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const texto = await resp.text();
    let json;
    try { json = JSON.parse(texto); } catch { json = { raw: texto }; }

    if (!resp.ok) {
        throw new Error('MercadoPago ' + resp.status + ' en ' + ruta + ': ' + JSON.stringify(json));
    }
    return json;
}

// ══════════════════════════════════════════════════════════════════════════
//  MODO NUEVO: QR dinámico (API de Orders)
// ══════════════════════════════════════════════════════════════════════════
async function crearOrdenQR(snack, precio) {
    const monto      = Number(precio).toFixed(2);          // la API exige string decimal: "1500.00"
    const referencia = snack + '-' + Date.now();           // único por pedido; la letra queda al inicio

    const orden = await mpFetch('POST', '/v1/orders', {
        type: 'qr',
        total_amount: monto,
        description: 'Snackbit ' + snack,
        external_reference: referencia,
        expiration_time: VENCIMIENTO_QR,
        config: { qr: { external_pos_id: POS_ID, mode: 'dynamic' } },
        transactions: { payments: [{ amount: monto }] }
    });

    const qrData = orden.type_response && orden.type_response.qr_data;
    if (!qrData) {
        throw new Error('MercadoPago no devolvió qr_data: ' + JSON.stringify(orden));
    }

    // El firmware dibuja QR versión 12 con ECC LOW: entran 367 caracteres como máximo.
    console.log('QR generado:', orden.id, '| largo qr_data:', qrData.length);
    if (qrData.length > 367) {
        console.warn('⚠️ qr_data supera los 367 caracteres: el ESP32 no lo puede dibujar en versión 12');
    }

    // Se guarda YA como pendiente: el webhook después busca esta fila por orden_id.
    await Transaccion.create({ snack, precio, orden_id: orden.id, status: 'pendiente' });

    return {
        orden_id: orden.id,      // formato "ORD01..."
        qr_url:   qrData         // mismo nombre de campo que antes → el ESP32 no cambia
    };
}

// Valida el header x-signature (HMAC-SHA256 con la clave secreta del panel de MercadoPago).
function firmaValida(req) {
    const firma     = String(req.headers['x-signature'] || '');
    const requestId = String(req.headers['x-request-id'] || '');
    const dataId    = String(req.query['data.id'] || '');

    const partes = Object.fromEntries(firma.split(',').map(p => p.trim().split('=')));
    if (!partes.ts || !partes.v1) return false;

    const calcular = id => crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update('id:' + id + ';request-id:' + requestId + ';ts:' + partes.ts + ';')
        .digest('hex');

    const iguales = (a, b) => a.length === b.length &&
        crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

    // Se prueba con el id tal cual y en minúsculas (los ids alfanuméricos se firman en minúsculas).
    return iguales(calcular(dataId), partes.v1) || iguales(calcular(dataId.toLowerCase()), partes.v1);
}

async function procesarWebhookOrder(req, res) {
    if (WEBHOOK_SECRET && !firmaValida(req)) {
        console.warn('Webhook order con firma inválida, se descarta');
        return res.sendStatus(401);
    }

    const ordenId = req.body.data && req.body.data.id;
    if (!ordenId) return res.sendStatus(200);

    // No se confía en el body: se le pregunta a MercadoPago el estado real de la order.
    const orden = await mpFetch('GET', '/v1/orders/' + ordenId);

    const transaccion = await Transaccion.findOne({ orden_id: ordenId });
    if (!transaccion) {
        console.log('Webhook de una order que este servidor no creó:', ordenId);
        return res.sendStatus(200);
    }
    if (transaccion.status === 'completado') {
        return res.sendStatus(200);                       // reintento de MP: ya estaba procesada
    }

    if (orden.status !== 'processed') {
        transaccion.status = orden.status;                // "expired", "canceled", "refunded"…
        await transaccion.save();
        console.log('⏳ Order', ordenId, 'en estado:', orden.status);
        return res.sendStatus(200);
    }

    const cobrado = Number(orden.total_paid_amount || orden.total_amount) || transaccion.precio;

    // Una sola vez por order: baja stock + suma ganancia para el panel.
    const yaRegistrada = await Venta.findOne({ ordenId });
    if (!yaRegistrada) {
        await registrarVenta(transaccion.snack, { ordenId, precioCobrado: cobrado });
        console.log('Venta registrada:', transaccion.snack, cobrado);
    }

    transaccion.status = 'completado';                    // esto es lo que lee GET /estado/:orden_id
    await transaccion.save();
    console.log('✅ Pago QR guardado:', ordenId);

    return res.sendStatus(200);
}

// ══════════════════════════════════════════════════════════════════════════
//  MODO ANTERIOR: Checkout Pro (sin cambios de comportamiento)
// ══════════════════════════════════════════════════════════════════════════
let orden_id;

async function crearOrdenCheckout(snack, precio) {
    const preference = new Preference(client);

    const resultado = await preference.create({
        body: {
            items: [{ title: snack, quantity: 1, unit_price: precio }],
            external_reference: snack,                                   // ← la letra viaja acá
            notification_url: 'https://maquina-expendedora-servidor-production-db3d85dc.up.railway.app/pagos/webhook?source_news=webhooks'
        }
    });

    orden_id = resultado.id;

    return {
        orden_id: resultado.id,
        qr_url:   resultado.init_point
    };
}

async function procesarWebhookPayment(req, res) {
    const payment   = new Payment(client);
    const resultado = await payment.get({ id: req.body.data.id });

    const snack      = resultado.external_reference || 'desconocido';
    const precio     = resultado.transaction_amount || 0;
    const webhook_id = resultado.id;

    // Los pagos de un QR dinámico tienen referencia "<letra>-<timestamp>" y se procesan
    // por el tópico "order". Si además llega su aviso de "payment", se ignora.
    if (/-\d{10,}$/.test(snack)) {
        return res.sendStatus(200);
    }

    if (resultado.status === 'approved') {
        const transaccion = new Transaccion({ snack, precio, orden_id, status: 'completado' });
        await transaccion.save();

        const yaRegistrada = await Venta.findOne({ ordenId: webhook_id });
        if (!yaRegistrada) {
            await registrarVenta(snack, { ordenId: webhook_id, precioCobrado: precio });
            console.log('Venta registrada:', snack, precio);
        }

        console.log('✅ Pago guardado:', orden_id);
    } else {
        const transaccion = new Transaccion({ snack, precio, orden_id, status: resultado.status });
        await transaccion.save();

        console.log('⏳ Transacción guardada con estado:', resultado.status);
    }

    return res.sendStatus(200);
}

// ══════════════════════════════════════════════════════════════════════════
//  Puntos de entrada (los que usa el resto del servidor)
// ══════════════════════════════════════════════════════════════════════════
async function crearOrden(snack, precio) {
    return POS_ID ? crearOrdenQR(snack, precio) : crearOrdenCheckout(snack, precio);
}

router.post('/webhook', async (req, res) => {
    const type = req.body && req.body.type;

    try {
        if (type === 'order')   return await procesarWebhookOrder(req, res);
        if (type === 'payment') return await procesarWebhookPayment(req, res);
        return res.sendStatus(200);
    } catch (error) {
        console.error('Error en webhook:', error);
        res.sendStatus(500);
    }
});

console.log('Modo de cobro:', POS_ID ? 'QR dinámico (caja ' + POS_ID + ')' : 'Checkout Pro');

module.exports = { router, crearOrden };
