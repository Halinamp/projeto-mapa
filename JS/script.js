
let map;
let currentMarker = null;

function initMap() {
    // Camadas base
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    });

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
    });

    const terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap'
    });

    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
    });

    map = L.map('map', {
        center: [-15.7801, -47.9292],
        zoom: 5,
        layers: [osm]
    });

    const baseMaps = {
        "Padrão (OSM)": osm,
        "Satélite": satellite,
        "Relevo": terrain,
        "Escuro": dark
    };

    L.control.layers(baseMaps).addTo(map);

    map.on('click', onMapClick);

    // Legenda
    const legenda = L.control({ position: 'bottomright' });
    legenda.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        const grades = [-10, 0, 10, 20, 30, 40];
        const colors = ['#4575b4', '#91bfdb', '#e0f3f8', '#fee090', '#fc8d59', '#d73027'];
        div.innerHTML += '<h4>Temperatura (°C)</h4>';
        for (let i = 0; i < grades.length; i++) {
            div.innerHTML +=
                `<i style="background:${colors[i]}"></i> ${grades[i]}${grades[i + 1] ? `–${grades[i + 1]}<br>` : '+'}`;
        }
        return div;
    };
    legenda.addTo(map);
}

async function getWeatherData(lat, lon) {
    const url = `http://localhost:3000/weather?lat=${lat}&lon=${lon}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Erro na resposta");
        return await response.json();
    } catch (error) {
        alert("Erro ao obter dados climáticos.");
        return null;
    }
}


async function getElevation(lat, lon) {
    try {
        const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
        const data = await response.json();
        return data.results[0].elevation;
    } catch (err) {
        return null;
    }
}

// Busca dados diários do Open-Meteo para o ano de 2024
async function getClimateData(lat, lon) {
    const startDate = '2024-01-01';
    const endDate = '2024-12-31';
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=America/Sao_Paulo`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.daily;
    } catch (err) {
        console.error("Erro ao obter dados climáticos históricos:", err);
        return null;
    }
}

// Função para agregar dados diários em médias mensais (temperatura) e somas mensais (precipitação)
function aggregateMonthlyData(daily) {
    if (!daily) return { monthlyTemp: [], monthlyPrecip: [] };

    const daysInMonthNonLeap = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const daysInMonthLeap = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const isLeap = daily.time.length === 366;
    const daysInMonth = isLeap ? daysInMonthLeap : daysInMonthNonLeap;

    const tempsMax = daily.temperature_2m_max;
    const tempsMin = daily.temperature_2m_min;
    const precip = daily.precipitation_sum;

    const monthlyTemp = [];
    const monthlyPrecip = [];
    let idx = 0;

    for (let m = 0; m < 12; m++) {
        let tempSum = 0;
        let precipSum = 0;
        for (let d = 0; d < daysInMonth[m]; d++) {
            // Calcula média diária (max + min)/2
            const dailyAvgTemp = (tempsMax[idx] + tempsMin[idx]) / 2;
            tempSum += dailyAvgTemp;
            precipSum += precip[idx];
            idx++;
        }
        monthlyTemp.push(parseFloat((tempSum / daysInMonth[m]).toFixed(2)));
        monthlyPrecip.push(parseFloat(precipSum.toFixed(2)));
    }

    return { monthlyTemp, monthlyPrecip };
}

async function onMapClick(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    const weatherData = await getWeatherData(lat, lon);
    if (!weatherData) return;

    const elevation = await getElevation(lat, lon);

    // Atualiza popup dados básicos
    document.getElementById("popup-latitude").textContent = lat.toFixed(5);
    document.getElementById("popup-longitude").textContent = lon.toFixed(5);
    document.getElementById("popup-temperature").textContent = weatherData.main.temp.toFixed(1);
    document.getElementById("popup-description").textContent = weatherData.weather[0].description;
    document.getElementById("popup-elevation").textContent = elevation ? `${elevation} m` : "Indisponível";

    // Remove marcador anterior
    if (currentMarker) map.removeLayer(currentMarker);

    // Ícone do clima atual
    const icon = weatherData.weather[0].icon;
    const iconUrl = `https://openweathermap.org/img/wn/${icon}@2x.png`;
    currentMarker = L.marker([lat, lon], {
        icon: L.icon({
            iconUrl: iconUrl,
            iconSize: [50, 50],
            iconAnchor: [25, 50]
        })
    }).addTo(map).bindPopup(`<strong>${weatherData.weather[0].description}</strong><br>${weatherData.main.temp.toFixed(1)}°C`).openPopup();

    // Pega dados climáticos históricos (Open-Meteo)
    const dailyData = await getClimateData(lat, lon);
    const { monthlyTemp, monthlyPrecip } = aggregateMonthlyData(dailyData);

    // Exibe popup
    document.getElementById("popup").classList.remove("hide");
    document.getElementById("popup").classList.add("show");

    // Cria gráfico com temperatura e precipitação reais
    createChart("climateChart", monthlyTemp, monthlyPrecip);
}

let myChart = null;

function createChart(containerId, temperatureData, precipitationData) {
    const ctx = document.getElementById(containerId).getContext("2d");
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Temperatura Média (°C)',
                    data: temperatureData,
                    type: 'line',
                    borderColor: 'red',
                    backgroundColor: 'rgba(255, 0, 0, 0.2)',
                    yAxisID: 'y',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Precipitação (mm)',
                    data: precipitationData,
                    type: 'bar',
                    backgroundColor: 'blue',
                    yAxisID: 'y1',
                }
            ]
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            stacked: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Temperatura (°C)'
                    },
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Precipitação (mm)'
                    },
                    grid: {
                        drawOnChartArea: false,
                    }
                }
            }
        }
    });
}

function closePopup() {
    document.getElementById("popup").classList.remove("show");
    document.getElementById("popup").classList.add("hide");
}

function searchLocation() {
    const location = document.getElementById('locationInput').value;
    if (!location) return;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                map.setView([lat, lon], 15);
                onMapClick({ latlng: { lat, lng: lon } });
            } else {
                alert("Localização não encontrada.");
            }
        })
        .catch(err => console.error("Erro na busca:", err));
}

// Inicializa o mapa
initMap();


