// index.js
require('dotenv').config();

const express = require('express');
const app = express();

app.use(express.json());

const pedidosRouter = require('./routes/pedidos');

app.use('/', pedidosRouter);

app.listen(3000, () => {
    console.log('Servidor corriendo en puerto 3000');
});