// index.js
require('dotenv').config();

const express = require('express');
const app = express();

app.use(express.json());

const pedidosRouter       = require('./routes/pedidos');
const { router: pagosRouter } = require('./routes/pagos');

app.use('/', pedidosRouter);
app.use('/pagos', pagosRouter);   // ← ahora sí lo registramos

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Servidor corriendo en puerto ' + PORT);
});