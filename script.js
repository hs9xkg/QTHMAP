// --- Configuration ---
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQy9KrpH_QcSIZcT4aFobOtD24u6CUQ9SzLXOAYJ7ilkip328YRSrOrTK9EZYjNpsT96Kvb2mV3HF2T/pub?output=csv';

// --- Global Variables ---
let map;
let stationData = [];
let allMarkers = [];
let userMarker = null;
let userLatLng = null;
let connectionLine = null;
let currentTarget = null; 

// --- 1. Init Map ---
function initMap() {
    map = L.map('map').setView([13.7563, 100.5018], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    fetchData();
}

// --- 2. Fetch Data ---
function fetchData() {
    Papa.parse(SHEET_URL, {
        download: true,
        header: true,
        complete: function(results) {
            stationData = results.data;
            plotStations(stationData);
            document.getElementById('connectionStatus').innerText = "Online (Updated)";
            document.getElementById('connectionStatus').style.color = "green";
            localStorage.setItem('offlineStations', JSON.stringify(stationData));
        },
        error: function(err) {
            console.error("Error fetching data:", err);
            const cached = localStorage.getItem('offlineStations');
            if (cached) {
                stationData = JSON.parse(cached);
                plotStations(stationData);
                document.getElementById('connectionStatus').innerText = "Offline Mode (Cached)";
                document.getElementById('connectionStatus').style.color = "orange";
            }
        }
    });
}

// --- 3. Plot Stations ---
function plotStations(data) {
    allMarkers.forEach(m => map.removeLayer(m));
    allMarkers = [];

    // กำหนดชื่อไฟล์รูปภาพให้ตรงกับ Type ใน Google Sheets
    const iconConfig = {
        'Analog Repeater': 'antenna.png',        
        'D-Star':          'antenna_dstar.png',  
        'Echolink':        'antenna_echo.png',   
        'Center':          'antenna_center.png'  
    };
    
    // รูปสำรอง
    const defaultIconUrl = 'antenna.png'; 

    data.forEach(station => {
        if(station.Lat && station.Lng) {
            const lat = parseFloat(station.Lat);
            const lng = parseFloat(station.Lng);
            
            // ดึงประเภทและตัดช่องว่างซ้ายขวา
            const type = station.Type ? station.Type.trim() : 'Analog Repeater';

            // เลือกรูปภาพจาก config ถ้าไม่มีใช้ default
            const finalIconUrl = iconConfig[type] || defaultIconUrl;
            
            // สร้าง Icon Object
            const customIcon = L.icon({
                iconUrl: finalIconUrl,
                iconSize: [32, 32],
                iconAnchor: [16, 32], 
                popupAnchor: [0, -32]
            });

            const marker = L.marker([lat, lng], {icon: customIcon}).addTo(map);

            marker.stationName = (station.Name || "").toLowerCase();
            marker.stationDesc = (station.Description || "").toLowerCase();

            const popupContent = `
                <div style="text-align:center; min-width: 150px;">
                    <b>${station.Name}</b><br>
                    <span style="font-size:0.8em; color:gray; border:1px solid #ccc; padding:1px 4px; border-radius:3px;">${station.Type}</span><br>
                    <div style="margin:5px 0; font-weight:bold; color:#007bff;">Freq: ${station.Frequency}</div>
                    <small>${station.Description}</small><br>
                    <a href="${station.Link}" target="_blank">More Info</a>
                </div>
            `;
            marker.bindPopup(popupContent);

            marker.on('click', function() {
                if(userLatLng) {
                    calculateAndDraw(userLatLng, marker.getLatLng(), marker);
                }
            });
            
            allMarkers.push(marker);
        }
    });
}

// --- 4. Search Function ---
function searchStation() {
    const searchText = document.getElementById('searchInput').value.toLowerCase();
    allMarkers.forEach(marker => {
        const matchName = marker.stationName.includes(searchText);
        const matchDesc = marker.stationDesc.includes(searchText);
        if (matchName || matchDesc) {
            if (!map.hasLayer(marker)) map.addLayer(marker);
        } else {
            map.removeLayer(marker);
        }
    });
}

// --- 5. Calculation Logic ---
function gridToLatLon(grid) {
    grid = grid.toUpperCase().trim();
    if (grid.length < 6) return null;
    const A = 'A'.charCodeAt(0);
    const lon = (grid.charCodeAt(0) - A) * 20 + parseInt(grid[2]) * 2 + (grid.charCodeAt(4) - A) / 12 - 180;
    const lat = (grid.charCodeAt(1) - A) * 10 + parseInt(grid[3]) + (grid.charCodeAt(5) - A) / 24 - 90;
    return L.latLng(lat + 1/48, lon + 1/24);
}

function getBearing(startLat, startLng, destLat, destLng) {
    const toRad = (deg) => deg * Math.PI / 180;
    const toDeg = (rad) => rad * 180 / Math.PI;
    const y = Math.sin(toRad(destLng - startLng)) * Math.cos(toRad(destLat));
    const x = Math.cos(toRad(startLat)) * Math.sin(toRad(destLat)) -
              Math.sin(toRad(startLat)) * Math.cos(toRad(destLat)) * Math.cos(toRad(destLng - startLng));
    let brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
}

function getCardinalDirection(angle) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((angle %= 360) < 0 ? angle + 360 : angle) / 45) % 8;
    return directions[index];
}

function calculateAndDraw(fromLatLng, toLatLng, targetMarker) {
    const distMeters = map.distance(fromLatLng, toLatLng);
    const distKm = (distMeters / 1000).toFixed(2);
    const bearing = getBearing(fromLatLng.lat, fromLatLng.lng, toLatLng.lat, toLatLng.lng).toFixed(0);
    const cardinal = getCardinalDirection(bearing);

    let stationName = "Target";
    if(targetMarker && targetMarker.stationName) {
         stationName = targetMarker.stationName.charAt(0).toUpperCase() + targetMarker.stationName.slice(1);
    }

    document.getElementById('calcResult').innerHTML = `
        <div style="background:#eef; padding:10px; border-radius:5px; border-left: 4px solid #007bff;">
            <b>Target: ${stationName}</b><br>
            ระยะทาง: <b>${distKm} km</b><br>
            <hr style="margin:5px 0; border:0; border-top:1px solid #ccc;">
            📡 หันเสาไปทาง: <b>${bearing}° (${cardinal})</b>
        </div>
    `;

    if(connectionLine) map.removeLayer(connectionLine);
    connectionLine = L.polyline([fromLatLng, toLatLng], {
        color: 'red', weight: 3, opacity: 0.8, dashArray: '10, 10'
    }).addTo(map);

    // จัดการป้าย (Tooltip)
    if (currentTarget) {
        currentTarget.unbindTooltip();
        currentTarget.closePopup(); 
    }
    currentTarget = targetMarker;

    if(targetMarker) {
        targetMarker.bindTooltip(
            `<div style="text-align:center;">
                <b>${stationName.toUpperCase()}</b><br>
                <span style="color:blue;">↘ ${bearing}° (${cardinal})</span><br>
                <span style="font-size:0.9em; color:#666;">${distKm} km</span>
             </div>`, 
            {
                permanent: true, 
                direction: 'bottom', 
                className: 'target-label',
                offset: [0, 5],
                opacity: 0.95
            }
        ).openTooltip();
    }
}

function calculateNearest() {
    const grid = document.getElementById('userGrid').value;
    const userLoc = gridToLatLon(grid);
    if (!userLoc) { alert("Invalid Grid (e.g. OK03GL)"); return; }
    userLatLng = userLoc;

    if(userMarker) map.removeLayer(userMarker);
    const homeIcon = L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/128/25/25694.png',
        iconSize: [24, 24], iconAnchor: [12, 24]
    });
    userMarker = L.marker(userLoc, {icon: homeIcon}).addTo(map).bindPopup("<b>Your QTH</b><br>" + grid.toUpperCase());

    let nearestMarker = null;
    let minDist = Infinity;
    
    allMarkers.forEach(marker => {
        if (map.hasLayer(marker)) { 
            const dist = map.distance(userLoc, marker.getLatLng());
            if(dist < minDist) { minDist = dist; nearestMarker = marker; }
        }
    });

    if(nearestMarker) {
        calculateAndDraw(userLoc, nearestMarker.getLatLng(), nearestMarker);
        map.fitBounds(new L.featureGroup([userMarker, nearestMarker]).getBounds().pad(0.2));
    }
}

function downloadOfflineData() {
    alert("ข้อมูลถูกบันทึกลง Cache Browser แล้ว (พร้อมใช้งาน Offline)");
}

initMap();