// routes/admin.js
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { Producto, Venta } = require('../models/modelos');   // ← sube de routes/ a la raíz

// ── Contraseña simple (se define en Railway como ADMIN_PASSWORD) ──
const CLAVE = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) {
    console.warn('[admin] ⚠ ADMIN_PASSWORD no definida. Usando "admin123". Definila en Railway.');
}

// Tokens válidos en memoria. Si el server reinicia, hay que volver a entrar.
const tokensActivos = new Set();

// "Portero": deja pasar solo si viene un token válido en Authorization: Bearer <token>
function requireAuth(req, res, next) {
    const cabecera = req.headers.authorization || '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
    if (token && tokensActivos.has(token)) return next();
    return res.status(401).json({ error: 'No autorizado' });
}

// Día calendario argentino (UTC-3), formato 'YYYY-MM-DD', para agrupar ventas por día.
function diaArgentina(fecha) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(fecha));
}
function ultimosDias(n) {
    const dias = [];
    const ahora = Date.now();
    for (let i = n - 1; i >= 0; i--) dias.push(diaArgentina(new Date(ahora - i * 86400000)));
    return dias;
}

// ════════════ AUTENTICACIÓN ════════════
router.post('/login', (req, res) => {
    const clave = req.body && req.body.password ? String(req.body.password) : '';
    if (clave === CLAVE) {
        const token = crypto.randomBytes(24).toString('hex');
        tokensActivos.add(token);
        return res.json({ ok: true, token });
    }
    return res.status(401).json({ error: 'Contraseña incorrecta' });
});

router.post('/logout', requireAuth, (req, res) => {
    const cabecera = req.headers.authorization || '';
    tokensActivos.delete(cabecera.slice(7));
    res.json({ ok: true });
});

// ════════════ PRODUCTOS (precios + stock) ════════════
router.get('/productos', requireAuth, async (req, res) => {
    try {
        const productos = await Producto.find().sort({ letra: 1 }).lean();
        res.json(productos.map(p => ({
            letra: p.letra, nombre: p.nombre, precio: p.precio,
            capacidad: p.capacidad, vendidosDesdeRecarga: p.vendidosDesdeRecarga,
            disponibles: Math.max(p.capacidad - p.vendidosDesdeRecarga, 0),
            aRellenar: p.vendidosDesdeRecarga, vendidosTotal: p.vendidosTotal,
            fechaUltimaRecarga: p.fechaUltimaRecarga, activo: p.activo,
        })));
    } catch (e) { console.error('[admin] GET /productos', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.post('/productos', requireAuth, async (req, res) => {
    try {
        const letra = String(req.body.letra || '').toUpperCase().trim();
        if (!letra) return res.status(400).json({ error: 'Falta la letra' });
        if (await Producto.findOne({ letra })) return res.status(409).json({ error: 'Ya existe un snack con esa letra' });
        const producto = await Producto.create({
            letra,
            nombre: String(req.body.nombre || ''),
            precio: Math.max(Math.round(Number(req.body.precio) || 0), 0),
            capacidad: Math.max(Math.round(Number(req.body.capacidad) || 10), 0),
        });
        res.status(201).json({ ok: true, producto });
    } catch (e) { console.error('[admin] POST /productos', e); res.status(500).json({ error: 'Error del servidor' }); }
});

router.put('/productos/:letra', requireAuth, async (req, res) => {
    try {
        const letra = String(req.params.letra || '').toUpperCase();
        const cambios = {};
        if (req.body.nombre !== undefined) cambios.nombre = String(req.body.nombre);
        if (req.body.precio !== undefined) {
            const precio = Number(req.body.precio);
            if (Number.isNaN(precio) || precio < 0) return res.status(400).json({ error: 'Precio inválido' });
            cambios.precio = Math.round(precio);
        }
        if (req.body.capacidad !== undefined) {
            const cap = Number(req.body.capacidad);
            if (Number.isNaN(cap) || cap < 0) return res.status(400).json({ error: 'Capacidad inválida' });
            cambios.capacidad = Math.round(cap);
        }
        if (req.body.activo !== undefined) cambios.activo = Boolean(req.body.activo);
        const producto = await Producto.findOneAndUpdate({ letra }, { $set: cambios }, { new: true });
        if (!producto) return res.status(404).json({ error: 'Snack no encontrado' });
        res.json({ ok: true, producto });
    } catch (e) { console.error('[admin] PUT /productos', e); res.status(500).json({ error: 'Error del servidor' }); }
});

// ════════════ STOCK (recarga = "ya repuse, volvé a lleno") ════════════
router.post('/stock/recargar', requireAuth, async (req, res) => {
    try {
        const letra = req.body && req.body.letra ? String(req.body.letra).toUpperCase() : null;
        const filtro = letra ? { letra } : {};
        const r = await Producto.updateMany(filtro, { $set: { vendidosDesdeRecarga: 0, fechaUltimaRecarga: new Date() } });
        const productos = await Producto.find(filtro).sort({ letra: 1 }).lean();
        res.json({ ok: true, actualizados: r.modifiedCount, productos });
    } catch (e) { console.error('[admin] POST /stock/recargar', e); res.status(500).json({ error: 'Error del servidor' }); }
});

// ════════════ VENTAS (ganancias + datos para los gráficos) ════════════
router.get('/ventas', requireAuth, async (req, res) => {
    try {
        let dias = parseInt(req.query.dias, 10);
        if (Number.isNaN(dias) || dias < 0) dias = 30;
        const filtro = {};
        if (dias > 0) filtro.fecha = { $gte: new Date(Date.now() - dias * 86400000) };
        const ventas = await Venta.find(filtro).sort({ fecha: 1 }).lean();

        const ingresos = ventas.reduce((s, v) => s + (v.precio || 0), 0);
        const unidades = ventas.length;
        const ticket = unidades ? Math.round(ingresos / unidades) : 0;

        const mapaSnack = {};
        for (const v of ventas) {
            if (!mapaSnack[v.letra]) mapaSnack[v.letra] = { letra: v.letra, nombre: v.nombre || '', unidades: 0, ingresos: 0 };
            mapaSnack[v.letra].unidades += 1;
            mapaSnack[v.letra].ingresos += v.precio || 0;
        }
        const porSnack = Object.values(mapaSnack).sort((a, b) => b.ingresos - a.ingresos);

        const mapaDia = {};
        for (const v of ventas) {
            const d = diaArgentina(v.fecha);
            if (!mapaDia[d]) mapaDia[d] = { ingresos: 0, unidades: 0 };
            mapaDia[d].ingresos += v.precio || 0;
            mapaDia[d].unidades += 1;
        }
        const etiquetas = dias > 0 ? ultimosDias(dias) : Object.keys(mapaDia).sort();
        const porDia = etiquetas.map(d => ({ dia: d, ingresos: mapaDia[d] ? mapaDia[d].ingresos : 0, unidades: mapaDia[d] ? mapaDia[d].unidades : 0 }));

        const ultimas = [...ventas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 15)
            .map(v => ({ letra: v.letra, nombre: v.nombre, precio: v.precio, fecha: v.fecha }));

        res.json({ rangoDias: dias, totales: { ingresos, unidades, ticket }, porSnack, porDia, ultimas });
    } catch (e) { console.error('[admin] GET /ventas', e); res.status(500).json({ error: 'Error del servidor' }); }
});

module.exports = router;