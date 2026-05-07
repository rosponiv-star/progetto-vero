const API_KEY = 'f242a2c24ef3300b375986ef8b899437'; 

// Riferimenti al DOM
const inputRicerca = document.getElementById('input-ricerca');
const listaSuggerimenti = document.getElementById('lista-suggerimenti');
const btnGeoloc = document.getElementById('btn-geoloc');
const divStato = document.getElementById('stato');
const divAppMeteo = document.getElementById('app-meteo');
const ulPulsantiGiorni = document.getElementById('pulsanti-giorni');
const divOverview = document.getElementById('sezione-overview');
const btnToggleOre = document.getElementById('btn-toggle-ore');
const divDettaglioOre = document.getElementById('dettaglio-ore');
const h2Luogo = document.getElementById('luogo-titolo');

// Elementi Timeline
const timelineContainer = document.getElementById('timeline-container');
const sliderTimeline = document.getElementById('slider-timeline');
const labelOrarioTimeline = document.getElementById('label-orario-timeline');
const tickMarksTimeline = document.getElementById('tick-marks-timeline');

// Variabili globali per stato e mappa
let datiRaggruppati = {};
let timerRicerca;
let mappaInterattiva = null;
let layerPrecipitazioni = null;
let markerCitta = null; 
let currentLat = null;
let currentLon = null;
let dataGiornoSelezionato = null;

// ==========================================
// 1. RICERCA E GEOLOCALIZZAZIONE
// ==========================================
inputRicerca.addEventListener('input', function() {
    clearTimeout(timerRicerca); 
    const query = this.value.trim();
    if (query.length < 3) { listaSuggerimenti.style.display = 'none'; return; }

    timerRicerca = setTimeout(() => {
        const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${query}&limit=5&appid=${API_KEY}`;
        axios.get(geoUrl).then(response => mostraSuggerimenti(response.data)).catch(err => console.error("Errore Geocoding:", err));
    }, 400);
});

function mostraSuggerimenti(cittaTrovate) {
    listaSuggerimenti.innerHTML = '';
    if (cittaTrovate.length === 0) { listaSuggerimenti.style.display = 'none'; return; }

    cittaTrovate.forEach(citta => {
        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-action suggerimento-item d-flex justify-content-between align-items-center';
        const nomeStato = citta.state ? `${citta.name}, ${citta.state}` : citta.name;
        li.innerHTML = `<span><strong>${nomeStato}</strong> <span class="badge bg-secondary ms-2">${citta.country}</span></span>`;
        
        li.onclick = () => {
            inputRicerca.value = '';
            listaSuggerimenti.style.display = 'none';
            ottieniPrevisioni(citta.lat, citta.lon, citta.name); 
        };
        listaSuggerimenti.appendChild(li);
    });
    listaSuggerimenti.style.display = 'block';
}

document.addEventListener('click', (e) => {
    if (!inputRicerca.contains(e.target) && !listaSuggerimenti.contains(e.target)) listaSuggerimenti.style.display = 'none';
});

btnGeoloc.addEventListener('click', () => {
    divStato.style.display = 'block'; divAppMeteo.style.display = 'none';
    divStato.className = "alert alert-info text-center"; divStato.innerText = "Cerco la tua posizione...";
    navigator.geolocation.getCurrentPosition(
        (pos) => ottieniPrevisioni(pos.coords.latitude, pos.coords.longitude, null),
        (err) => { divStato.className = "alert alert-danger text-center"; divStato.innerText = "Permesso negato o errore GPS."; }
    );
});

// ==========================================
// 2. RECUPERO DATI E AGGIORNAMENTO MAPPA
// ==========================================
function ottieniPrevisioni(lat, lon, nomeCittaManuale) {
    currentLat = lat; currentLon = lon; 
    divStato.style.display = 'block'; divStato.className = 'alert alert-info text-center'; divStato.innerText = "Sincronizzazione dati...";
    divAppMeteo.style.display = 'none';

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=it`;

    axios.get(url).then(response => {
        const dati = response.data;
        divStato.style.display = 'none'; divAppMeteo.style.display = 'block'; 
        
        const nomeFinale = nomeCittaManuale || dati.city.name;
        h2Luogo.innerHTML = `📍 ${nomeFinale} <span class="badge bg-info text-dark fs-6 align-middle ms-2">${dati.city.country}</span>`;

        aggiornaMappa(lat, lon);
        raggruppaDatiPerGiorno(dati.list);
        creaBottoniGiorni();
    }).catch(error => {
        divStato.style.display = 'block'; divAppMeteo.style.display = 'none';
        divStato.className = "alert alert-danger text-center"; divStato.innerText = "Errore API: " + error.message;
    });
}

function aggiornaMappa(lat, lon) {
    if (!mappaInterattiva) {
        mappaInterattiva = L.map('mappa-meteo').setView([lat, lon], 9);
        // Base scura per far risaltare il radar
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap & CARTO', maxZoom: 18
        }).addTo(mappaInterattiva);
    } else {
        mappaInterattiva.setView([lat, lon], 9);
    }

    setTimeout(() => { mappaInterattiva.invalidateSize(); }, 100);

    if (layerPrecipitazioni) mappaInterattiva.removeLayer(layerPrecipitazioni);

    const tileMeteoUrl = `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${API_KEY}`;
    layerPrecipitazioni = L.tileLayer(tileMeteoUrl, { opacity: 0.9, maxZoom: 18 }).addTo(mappaInterattiva);
}

function raggruppaDatiPerGiorno(listaPrevisioni) {
    datiRaggruppati = {}; 
    listaPrevisioni.forEach(previsione => {
        const dataCompleta = previsione.dt_txt.split(' ')[0]; 
        if (!datiRaggruppati[dataCompleta]) datiRaggruppati[dataCompleta] = [];
        datiRaggruppati[dataCompleta].push(previsione);
    });
}

// ==========================================
// 3. GENERAZIONE INTERFACCIA E TIMELINE
// ==========================================
function creaBottoniGiorni() {
    ulPulsantiGiorni.innerHTML = ''; 
    const dateDisponibili = Object.keys(datiRaggruppati);

    dateDisponibili.forEach((dataAStringa, index) => {
        const li = document.createElement('li');
        li.classList.add('nav-item', 'mx-1');
        const btn = document.createElement('button');
        btn.classList.add('nav-link', 'border', 'text-dark', 'fw-semibold'); 
        
        const dataOgg = new Date(dataAStringa);
        btn.innerText = dataOgg.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });

        btn.onclick = () => {
            document.querySelectorAll('.nav-link').forEach(b => { 
                b.classList.remove('active', 'bg-primary', 'text-white'); 
                b.classList.add('text-dark', 'bg-white'); 
            });
            btn.classList.add('active', 'bg-primary', 'text-white');
            btn.classList.remove('text-dark', 'bg-white');
            mostraGiorno(dataAStringa);
        };
        
        li.appendChild(btn);
        ulPulsantiGiorni.appendChild(li);

        if (index === 0) btn.click();
    });
}

function mostraGiorno(dataScelta) {
    dataGiornoSelezionato = dataScelta;
    const fasceOrarie = datiRaggruppati[dataScelta];
    
    // SETUP TIMELINE
    timelineContainer.style.display = 'block';
    sliderTimeline.max = fasceOrarie.length - 1; 
    sliderTimeline.value = 0; 
    
    tickMarksTimeline.innerHTML = '';
    fasceOrarie.forEach(ora => {
        const orario = ora.dt_txt.split(' ')[1].substring(0, 5);
        tickMarksTimeline.innerHTML += `<span>${orario}</span>`;
    });
    
    aggiornaMarkerMappa(); // Renderizza il marker sulla prima ora

    divDettaglioOre.style.display = 'none';
    btnToggleOre.innerHTML = '🔽 Mostra dettaglio testuale per fasce orarie';
    btnToggleOre.classList.remove('btn-primary');
    btnToggleOre.classList.add('btn-outline-primary');

    // --- OVERVIEW ---
    let minGiorno = 100, maxGiorno = -100, pioggiaTotale = 0, neveTotale = 0;
    let iconaOverview = fasceOrarie[0].weather[0].icon;
    let descOverview = fasceOrarie[0].weather[0].description;

    fasceOrarie.forEach(ora => {
        if(ora.main.temp_min < minGiorno) minGiorno = ora.main.temp_min;
        if(ora.main.temp_max > maxGiorno) maxGiorno = ora.main.temp_max;
        if(ora.rain && ora.rain['3h']) pioggiaTotale += ora.rain['3h'];
        if(ora.snow && ora.snow['3h']) neveTotale += ora.snow['3h'];
        
        if(ora.dt_txt.includes("12:00:00") || ora.dt_txt.includes("15:00:00")) {
            iconaOverview = ora.weather[0].icon.replace('n', 'd'); 
            descOverview = ora.weather[0].description;
        }
    });

    const dataOgg = new Date(dataScelta);
    divOverview.innerHTML = `
        <div class="card bg-primary text-white text-center rounded-4 shadow border-0">
            <div class="card-body py-4">
                <h4 class="text-uppercase mb-3 fw-light">${dataOgg.toLocaleDateString('it-IT', {weekday: 'long', day: 'numeric', month: 'long'})}</h4>
                <div class="d-flex justify-content-center align-items-center mb-3">
                    <img src="https://openweathermap.org/img/wn/${iconaOverview}@4x.png" alt="Meteo" class="bg-white rounded-circle me-4 shadow-sm" style="width: 110px;">
                    <div class="text-start">
                        <div class="display-3 fw-bold lh-1">${Math.round(maxGiorno)}°</div>
                        <div class="fs-5 opacity-75 mt-1">Min ${Math.round(minGiorno)}°</div>
                    </div>
                </div>
                <h5 class="text-capitalize fw-normal mb-3">${descOverview}</h5>
                <div class="d-flex flex-wrap justify-content-center gap-3 bg-white bg-opacity-10 rounded-pill py-2 w-100 w-md-75 mx-auto px-3 shadow-sm">
                    <span>🌧️ Pioggia Tot.: ${pioggiaTotale.toFixed(1)} mm</span>
                    ${neveTotale > 0 ? `<span>❄️ Neve Tot.: ${neveTotale.toFixed(1)} mm</span>` : ''}
                    <span>🌡️ Escursione: ${Math.round(maxGiorno - minGiorno)}°C</span>
                </div>
            </div>
        </div>
    `;

    // --- DETTAGLI TESTUALI ---
    divDettaglioOre.innerHTML = ''; 
    fasceOrarie.forEach(oraDato => {
        const orario = oraDato.dt_txt.split(' ')[1].substring(0, 5);
        const probPioggia = Math.round((oraDato.pop || 0) * 100); 
        const pioggia3h = (oraDato.rain && oraDato.rain['3h']) ? `${oraDato.rain['3h']} mm` : '0 mm';
        const neve3h = (oraDato.snow && oraDato.snow['3h']) ? `${oraDato.snow['3h']} mm` : '0 mm';
        const visibilitaKm = oraDato.visibility ? `${(oraDato.visibility / 1000).toFixed(1)} km` : 'N/D';
        const nubi = oraDato.clouds ? `${oraDato.clouds.all}%` : 'N/D';
        const raffiche = (oraDato.wind && oraDato.wind.gust) ? `${oraDato.wind.gust} m/s` : 'N/D';
        const seaLevel = (oraDato.main && oraDato.main.sea_level) ? `${oraDato.main.sea_level} hPa` : 'N/D';
        const grndLevel = (oraDato.main && oraDato.main.grnd_level) ? `${oraDato.main.grnd_level} hPa` : 'N/D';
        const sysPod = (oraDato.sys && oraDato.sys.pod === 'd') ? 'Giorno ☀️' : 'Notte 🌙';

        const cardHTML = `
            <div class="col-12 col-md-6 col-lg-4">
                <div class="card h-100 border-0 shadow-sm bg-white">
                    <div class="card-header bg-transparent border-bottom-0 d-flex justify-content-between align-items-center pt-3 pb-0">
                        <span class="fw-bold fs-5 text-primary">${orario}</span>
                        <span class="badge ${sysPod.includes('Giorno') ? 'bg-warning text-dark' : 'bg-dark text-white'}">${sysPod}</span>
                    </div>
                    
                    <div class="card-body text-center pt-1">
                        <img src="https://openweathermap.org/img/wn/${oraDato.weather[0].icon}@2x.png" width="70" class="mb-1">
                        <h3 class="fw-bold text-dark mb-0">${Math.round(oraDato.main.temp)}°C</h3>
                        <p class="text-capitalize text-muted fw-semibold mb-3">${oraDato.weather[0].description}</p>
                        
                        <div class="bg-light p-2 rounded text-start mb-2" style="font-size: 0.85rem;">
                            <strong>🌡️ Temperature</strong><br>
                            Percepita: ${Math.round(oraDato.main.feels_like)}°C<br>
                            Min/Max: ${oraDato.main.temp_min}°C / ${oraDato.main.temp_max}°C
                        </div>

                        <div class="bg-light p-2 rounded text-start mb-2" style="font-size: 0.85rem;">
                            <strong>🌧️ Precipitazioni & Nubi</strong><br>
                            Prob. precip.: ${probPioggia}%<br>
                            Pioggia (3h): ${pioggia3h} | Neve: ${neve3h}<br>
                            Copertura nubi: ${nubi}
                        </div>

                        <div class="bg-light p-2 rounded text-start mb-2" style="font-size: 0.85rem;">
                            <strong>💨 Vento & Visibilità</strong><br>
                            Velocità: ${oraDato.wind.speed} m/s (Dir. ${oraDato.wind.deg}°)<br>
                            Raffiche: ${raffiche}<br>
                            Visibilità: ${visibilitaKm}
                        </div>

                        <div class="bg-light p-2 rounded text-start" style="font-size: 0.85rem;">
                            <strong>📏 Pressione</strong><br>
                            Std: ${oraDato.main.pressure} hPa | Mare: ${seaLevel}
                        </div>
                    </div>
                </div>
            </div>
        `;
        divDettaglioOre.innerHTML += cardHTML;
    });
}

// ==========================================
// 4. TIMELINE EVENT LISTENER
// ==========================================
sliderTimeline.addEventListener('input', aggiornaMarkerMappa);

function aggiornaMarkerMappa() {
    if (!dataGiornoSelezionato || !datiRaggruppati[dataGiornoSelezionato]) return;
    
    const indiceSlider = sliderTimeline.value;
    const datoOra = datiRaggruppati[dataGiornoSelezionato][indiceSlider];
    
    const orario = datoOra.dt_txt.split(' ')[1].substring(0, 5);
    labelOrarioTimeline.innerText = orario;
    
    if (markerCitta) mappaInterattiva.removeLayer(markerCitta);
    
    const iconaMeteoHtml = `
        <div class="bg-primary text-white px-2 py-1 rounded-pill shadow-lg d-flex align-items-center" style="border: 2px solid white; width: max-content; margin-top: -15px;">
            <img src="https://openweathermap.org/img/wn/${datoOra.weather[0].icon}.png" style="width:35px; height:35px; margin-right: 4px;">
            <div class="d-flex flex-column text-start" style="line-height: 1;">
                <span class="fw-bold fs-5">${Math.round(datoOra.main.temp)}°</span>
                <span style="font-size: 0.65rem; opacity: 0.9;">${datoOra.weather[0].description}</span>
            </div>
        </div>
    `;

    const iconaCustom = L.divIcon({
        className: 'marker-trasparente',
        html: iconaMeteoHtml,
        iconSize: [120, 50],
        iconAnchor: [60, 50] 
    });
    
    markerCitta = L.marker([currentLat, currentLon], {icon: iconaCustom}).addTo(mappaInterattiva);
}

// ==========================================
// 5. TOGGLE DETTAGLI
// ==========================================
btnToggleOre.addEventListener('click', () => {
    if (divDettaglioOre.style.display === 'none') {
        divDettaglioOre.style.display = 'flex'; 
        btnToggleOre.innerHTML = '🔼 Nascondi dettaglio testuale';
        btnToggleOre.classList.replace('btn-outline-primary', 'btn-primary');
    } else {
        divDettaglioOre.style.display = 'none';
        btnToggleOre.innerHTML = '🔽 Mostra dettaglio testuale per fasce orarie';
        btnToggleOre.classList.replace('btn-primary', 'btn-outline-primary');
    }
});