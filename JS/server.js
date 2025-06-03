require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// Permite CORS (caso você esteja hospedando frontend separado)
const cors = require('cors');
app.use(cors());

// Endpoint para o frontend chamar
app.get('/weather', async (req, res) => {
    const { lat, lon } = req.query;
    const apiKey = process.env.API_KEY;

    try {
        const weatherResponse = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`);
        const data = await weatherResponse.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar clima' });
    }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
