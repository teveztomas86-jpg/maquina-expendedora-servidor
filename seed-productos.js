// seed-productos.js
require('dotenv').config();
const mongoose = require('mongoose');
const { Producto } = require('./models/modelos');

const URI = process.env.MONGO_URI;

const iniciales = [
    { letra: 'A', nombre: 'Snack A', precio: 150, capacidad: 10 },
    { letra: 'B', nombre: 'Snack B', precio: 200, capacidad: 10 },
    { letra: 'C', nombre: 'Snack C', precio: 180, capacidad: 10 },
    { letra: 'D', nombre: 'Snack D', precio: 250, capacidad: 10 },
];

(async () => {
    try {
        if (!URI) { console.error('❌ Falta MONGO_URI en el .env'); process.exit(1); }

        await mongoose.connect(URI);
        console.log('Conectado. Inicializando snacks...');

        for (const p of iniciales) {
            await Producto.updateOne({ letra: p.letra }, { $setOnInsert: p }, { upsert: true });
            console.log(`  ✓ ${p.letra}  $${p.precio}  (cap ${p.capacidad})`);
        }

        console.log('✅ Listo.');
        await mongoose.disconnect();
        process.exit(0);
    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
})();