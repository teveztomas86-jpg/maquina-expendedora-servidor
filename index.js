// index.js
require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const app      = express();

app.use(express.json());
app.use(express.static('public'));   // ← NUEVO: sirve el panel en /admin/

// ── Conexión a MongoDB ────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB conectado'))
    .catch(err => console.error('❌ Error MongoDB:', err));

const pedidosRouter           = require('./routes/pedidos');
const { router: pagosRouter } = require('./routes/pagos');
const adminRouter             = require('./routes/admin');   // ← NUEVO

app.use('/api', adminRouter);        // ← NUEVO: API del panel (login, productos, ventas…)
app.use('/', pedidosRouter);
app.use('/pagos', pagosRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Servidor corriendo en puerto ' + PORT);
});