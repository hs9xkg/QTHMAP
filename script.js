/* script.js (Final Restoration) */
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQy9KrpH_QcSIZcT4aFobOtD24u6CUQ9SzLXOAYJ7ilkip328YRSrOrTK9EZYjNpsT96Kvb2mV3HF2T/pub?output=csv';
const DEFAULT_CENTER = [13.7563, 100.5018];
const DEFAULT_ZOOM = 6;

let map;
let allStationsData = []; 
let markersLayer; 
let gridLayer;
let userMarker = null; // หมุดเรา
let userPosition = null; 
let connectionLine = null;

const icons = {
    analog: L.icon({ iconUrl: 'antenna.png', iconSize: [32, 32], iconAnchor: [16, 32] }),
    dstar: L.icon({ iconUrl: 'antenna_dstar.png', iconSize: [32, 32], iconAnchor: [16, 32] }),
    echolink: L.icon({ iconUrl: 'antenna_echo.png', iconSize: [32, 32], iconAnchor: [16, 32] }),
    center: L.icon({ iconUrl: 'antenna_center.png', iconSize: [36, 36], iconAnchor: [18, 36] }),
    default: L.icon({ iconUrl: 'antenna.png', iconSize: [32, 32], iconAnchor: [16, 32] }),
    // ไอค่อนบ้าน: ใช้ Emoji 🏠 และ class .user-pin
    user: L.divIcon({ className: 'user-pin', html: '🏠', iconSize: [40, 40], iconAnchor: [20, 20] }) 
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    fetchData(); 
    checkOfflineStatus();
});

function initMap() {
    map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
}

function fetchData() {
    console.log("Fetching Data...");
    Papa.parse(GOOGLE_SHEET_CSV_URL, {
        download: true, header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase(), 
        complete: function(results) {
            allStationsData = results.data.filter(row => row.lat && row.lng && !isNaN(parseFloat(row.lat))).map(row => ({
                ...row, lat: parseFloat(row.lat), lng: parseFloat(row.lng),
                name: row.name || 'Unknown', type: row.type || 'Analog', freq: row.frequency || '-', 
                desc: row.description || row.detail || '', link: row.link || ''
            }));
            if (allStationsData.length > 0) { renderMarkers(); updateStatus("Online"); } else { alert("ไม่พบข้อมูล CSV"); }
        },
        error: err => { console.error(err); updateStatus("Offline Mode"); }
    });
}

function renderMarkers() {
    markersLayer.clearLayers();
    if(connectionLine) map.removeLayer(connectionLine);
    // ไม่ยุ่งกับ userMarker เพื่อให้มันอยู่ตลอด

    const checkedTypes = Array.from(document.querySelectorAll('.filter-chk:checked')).map(cb => cb.value.toLowerCase());
    const searchVal = document.getElementById('searchInput').value.toLowerCase().trim();

    allStationsData.forEach(station => {
        const type = (station.type || 'analog').toLowerCase();
        const name = (station.name || '').toLowerCase();
        const desc = (station.desc || '').toLowerCase();
        const freq = (station.freq || '').toLowerCase();
        
        let isTypeMatch = checkedTypes.some(t => type.includes(t)) || (type.includes('repeater') && checkedTypes.includes('analog'));
        let isSearchMatch = searchVal === "" || name.includes(searchVal) || desc.includes(searchVal) || freq.includes(searchVal);

        if (isTypeMatch && isSearchMatch) { addStationMarker(station, type); }
    });
}

function addStationMarker(station, type) {
    let icon = icons.default;
    if (type.includes('d-star')) icon = icons.dstar; else if (type.includes('echolink')) icon = icons.echolink; else if (type.includes('center')) icon = icons.center; else if (type.includes('analog')) icon = icons.analog;

    const marker = L.marker([station.lat, station.lng], { icon: icon });
    let linkHtml = ''; let rawLink = (station.link || '').trim();
    if (rawLink.length > 3 && rawLink.toLowerCase() !== 'no') {
        if (!rawLink.startsWith('http')) rawLink = 'http://' + rawLink;
        linkHtml = `<div style="margin-top:6px;"><a href="${rawLink}" target="_blank" style="color:#007bff; text-decoration:none;">🌐 Website / Link</a></div>`;
    }

    // --- Popup Design (Phase 1 Replica) ---
    const popupContent = `
        <div style="text-align:center; min-width: 210px; font-family: sans-serif; line-height: 1.5;">
            <h3 style="margin: 0 0 5px 0; color:#222; font-size:1.2rem;">${station.name}</h3>
            
            <div style="display:inline-block; border:1px solid #ccc; border-radius:12px; padding:1px 12px; font-size:0.85rem; color:#777; margin-bottom: 5px; background-color: #fff;">
                ${station.type}
            </div>

            <div style="color: #E91E63; font-weight: 700; font-size: 1.3rem; margin: 4px 0;">
                ${station.freq}
            </div>
            
            <div style="color: #444; font-size: 0.95rem;">
                ${station.desc}
            </div>
            
            ${linkHtml}

            <div style="margin-top: 10px; font-size: 0.85rem; color: #999; background: #f8f8f8; border-radius: 4px; padding: 4px;">
                Grid: ${toMaidenhead(station.lat, station.lng)}
            </div>
        </div>
    `;
    marker.bindPopup(popupContent);
    marker.on('click', () => { drawPolyline(station.lat, station.lng, station.name); });
    markersLayer.addLayer(marker);
}

function drawPolyline(targetLat, targetLng, targetName) {
    if (!userPosition) return; 
    if (connectionLine) map.removeLayer(connectionLine);

    const bearing = getBearing(userPosition.lat, userPosition.lng, targetLat, targetLng);
    const distance = getDistanceFromLatLonInKm(userPosition.lat, userPosition.lng, targetLat, targetLng);
    const direction = getCardinalDirection(bearing);

    connectionLine = L.polyline([[userPosition.lat, userPosition.lng], [targetLat, targetLng]], 
        { color: '#dc3545', weight: 2, opacity: 0.8, dashArray: '6, 6' }).addTo(map);

    // Tooltip บนเส้น (ใช้ class .target-label ที่เราแก้ CSS แล้ว)
    const labelContent = `<div style="font-weight:bold; color:#007bff;">${targetName}</div><div>↘ ${bearing.toFixed(0)}° (${direction})</div><div>${distance.toFixed(2)} km</div>`;
    
    // ตั้งค่า direction: 'center' เพื่อให้อยู่กลางเส้น ไม่ทับ Popup สถานี
    connectionLine.bindTooltip(labelContent, { permanent: true, direction: 'center', className: 'target-label', opacity: 1 }).openTooltip();
}

window.searchStation = () => renderMarkers();
window.resetApp = () => {
    document.getElementById('searchInput').value = '';
    if(connectionLine) map.removeLayer(connectionLine);
    // ไม่ลบ userMarker
    document.querySelectorAll('.filter-chk').forEach(c => c.checked = true);
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    renderMarkers();
}

window.calculateNearest = function() {
    const manualGrid = document.getElementById('userGrid').value.trim();
    if (manualGrid.length >= 4) {
        const coords = maidenheadToLatLon(manualGrid);
        if (coords) {
            userPosition = { lat: coords[0], lng: coords[1] };
            updateUserMarker(userPosition.lat, userPosition.lng, `Manual QTH: ${manualGrid.toUpperCase()}`);
        } else { alert("Grid Locator ไม่ถูกต้อง"); return; }
    } else if (!userPosition) { alert("กรุณากดปุ่ม GPS หรือกรอก Grid Locator ก่อนคำนวณ"); return; }

    const stationsWithDist = allStationsData.map(st => {
        const d = getDistanceFromLatLonInKm(userPosition.lat, userPosition.lng, st.lat, st.lng);
        const b = getBearing(userPosition.lat, userPosition.lng, st.lat, st.lng);
        return { ...st, distance: d, bearing: b };
    });
    stationsWithDist.sort((a, b) => a.distance - b.distance);
    
    let html = '<div style="background:#f9f9f9; padding:10px; border-radius:5px; margin-top:5px;"><strong>📡 5 สถานีใกล้สุด:</strong><br>';
    stationsWithDist.slice(0, 5).forEach(st => {
        const dir = getCardinalDirection(st.bearing);
        html += `<div style="margin-top:8px; border-bottom:1px solid #ddd; padding-bottom:5px; cursor:pointer;" onclick="map.setView([${st.lat}, ${st.lng}], 13); drawPolyline(${st.lat}, ${st.lng}, '${st.name}')"><b>${st.name}</b> <span style="color:#e91e63">(${st.freq})</span><br>📡 หันเสาไปทาง: <b>${st.bearing.toFixed(0)}° (${dir})</b><br><span style="color:#666; font-size:0.9em;">ระยะทาง: ${st.distance.toFixed(1)} km</span></div>`;
    });
    html += '</div>';
    document.getElementById('calcResult').innerHTML = html;
}

function initEventListeners() {
    document.querySelectorAll('.filter-chk').forEach(chk => chk.addEventListener('change', renderMarkers));
    const btnGps = document.getElementById('btn-gps');
    if(btnGps) {
        btnGps.addEventListener('click', () => {
            btnGps.innerText = "⏳...";
            if (!navigator.geolocation) { alert("Browser ไม่รองรับ GPS"); return; }
            navigator.geolocation.getCurrentPosition(pos => {
                const lat = pos.coords.latitude; const lng = pos.coords.longitude;
                userPosition = { lat, lng }; const myGrid = toMaidenhead(lat, lng);
                document.getElementById('userGrid').value = myGrid;
                updateUserMarker(lat, lng, `Your QTH: ${myGrid}`);
                btnGps.innerText = "📍 OK"; setTimeout(() => btnGps.innerText = "📍 GPS", 2000);
            }, err => { alert("GPS Error: " + err.message); btnGps.innerText = "📍 GPS"; });
        });
    }
    const toggleGrid = document.getElementById('toggle-grid');
    if(toggleGrid) {
        toggleGrid.addEventListener('change', (e) => {
            if (e.target.checked && typeof L.maidenhead === 'function') { gridLayer = L.maidenhead({ color: 'rgba(0,0,0,0.4)' }).addTo(map); } 
            else if (gridLayer) { map.removeLayer(gridLayer); }
        });
    }
}

function updateUserMarker(lat, lng, msg) {
    if(userMarker) map.removeLayer(userMarker);
    // 🔴 ใส่ zIndexOffset 9999 ให้หมุดเราอยู่บนสุด
    userMarker = L.marker([lat, lng], {icon: icons.user, zIndexOffset: 9999}).addTo(map).bindPopup(`<b>${msg}</b>`).openPopup();
    map.setView([lat, lng], 10);
}

// Math Utils (คงเดิม)
function toMaidenhead(lat, lng) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; lng += 180; lat += 90; const f1 = A[Math.floor(lng/20)]; const f2 = A[Math.floor(lat/10)]; let rLng = lng%20; let rLat = lat%10; const s1 = Math.floor(rLng/2); const s2 = Math.floor(rLat/1); let ss1 = A[Math.floor((rLng%2)/(2/24))].toLowerCase(); let ss2 = A[Math.floor((rLat%1)/(1/24))].toLowerCase(); return f1+f2+s1+s2+ss1+ss2; }
function maidenheadToLatLon(grid) { grid = grid.toUpperCase(); if (grid.length < 4) return null; const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let lng = (A.indexOf(grid[0])*20)-180; let lat = (A.indexOf(grid[1])*10)-90; lng += parseInt(grid[2])*2; lat += parseInt(grid[3])*1; if (grid.length >= 6) { lng += (A.indexOf(grid[4])*(2/24))+(1/24); lat += (A.indexOf(grid[5])*(1/24))+(0.5/24); } else { lng += 1; lat += 0.5; } return [lat, lng]; }
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) { const R = 6371; const dLat = deg2rad(lat2-lat1); const dLon = deg2rad(lon2-lon1); const a = Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(deg2rad(lat1))*Math.cos(deg2rad(lat2))*Math.sin(dLon/2)*Math.sin(dLon/2); return R*(2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))); }
function getBearing(startLat, startLng, destLat, destLng){ startLat = deg2rad(startLat); startLng = deg2rad(startLng); destLat = deg2rad(destLat); destLng = deg2rad(destLng); const y = Math.sin(destLng-startLng)*Math.cos(destLat); const x = Math.cos(startLat)*Math.sin(destLat)-Math.sin(startLat)*Math.cos(destLat)*Math.cos(destLng-startLng); return (rad2deg(Math.atan2(y, x))+360)%360; }
function getCardinalDirection(angle) { const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']; return directions[Math.round(angle/45)%8]; }
function deg2rad(deg) { return deg * (Math.PI/180); } function rad2deg(rad) { return rad * (180/Math.PI); }
function updateStatus(msg) { const el = document.getElementById('connectionStatus'); if(el) el.innerText = msg; }
function checkOfflineStatus() { window.addEventListener('online', () => updateStatus('Online')); window.addEventListener('offline', () => updateStatus('Offline Mode')); }