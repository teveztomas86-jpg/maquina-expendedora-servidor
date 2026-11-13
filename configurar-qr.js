// configurar-qr.js — se corre UNA sola vez, desde tu PC, para preparar la cuenta de MercadoPago.
//
//   node configurar-qr.js          → muestra tu user_id y las sucursales/cajas que ya existen
//   node configurar-qr.js crear    → crea la sucursal y la caja definidas acá abajo
//
// Usa el MP_ACCESS_TOKEN del archivo .env. No forma parte del servidor (index.js no lo carga).
require('dotenv').config();

// ── Completá estos datos antes de usar "crear" ────────────────────────────
const SUCURSAL = {
    name: 'Snackbit Escuela',
    external_id: 'SNACKBITSUC1',          // solo letras y números
    location: {
        street_name:   'COMPLETAR',       // calle de la escuela
        street_number: '0',               // altura
        city_name:     'COMPLETAR',       // ciudad, tal como figura en MercadoPago
        state_name:    'Córdoba',         // provincia
        latitude:  0,                     // coordenadas reales (Google Maps → clic derecho)
        longitude: 0,
        reference: 'Maquina expendedora'
    }
};
const CAJA = {
    name: 'Snackbit 01',
    external_id: 'SNACKBIT01',            // ← este valor va en MP_EXTERNAL_POS_ID. Solo letras y números.
    fixed_amount: true
};
// ───────────────────────────────────────────────────────────────────────────

async function mp(metodo, ruta, cuerpo) {
    const resp = await fetch('https://api.mercadopago.com' + ruta, {
        method: metodo,
        headers: {
            'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN,
            'Content-Type':  'application/json'
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(metodo + ' ' + ruta + ' → ' + resp.status + '\n' + JSON.stringify(json, null, 2));
    }
    return json;
}

async function listar(userId) {
    const sucursales = await mp('GET', '/users/' + userId + '/stores/search');
    console.log('\nSucursales:');
    for (const s of sucursales.results || []) {
        console.log('  id=' + s.id + '  external_id=' + (s.external_id || '(sin definir)') + '  nombre=' + s.name);
    }
    if (!(sucursales.results || []).length) console.log('  (ninguna)');

    const cajas = await mp('GET', '/pos');
    console.log('\nCajas:');
    for (const c of cajas.results || []) {
        console.log('  id=' + c.id + '  external_id=' + (c.external_id || '(sin definir)') +
                    '  nombre=' + c.name + '  sucursal=' + c.store_id);
    }
    if (!(cajas.results || []).length) console.log('  (ninguna)');
}

async function crear(userId) {
    if (SUCURSAL.location.street_name === 'COMPLETAR' || SUCURSAL.location.latitude === 0) {
        throw new Error('Completá los datos de SUCURSAL al principio de este archivo antes de crear.');
    }
    const sucursal = await mp('POST', '/users/' + userId + '/stores', SUCURSAL);
    console.log('Sucursal creada. id =', sucursal.id);

    const caja = await mp('POST', '/pos', { ...CAJA, store_id: Number(sucursal.id) });
    console.log('Caja creada. id =', caja.id);
    console.log('\nListo. Agregá esta variable en Railway y en tu .env:');
    console.log('  MP_EXTERNAL_POS_ID=' + CAJA.external_id);
}

(async () => {
    const yo = await mp('GET', '/users/me');
    console.log('Cuenta:', yo.nickname, '| user_id =', yo.id, '| país =', yo.site_id);

    if (process.argv[2] === 'crear') await crear(yo.id);
    else await listar(yo.id);
})().catch(err => { console.error('\n❌', err.message); process.exit(1); });
