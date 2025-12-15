/* leaflet.maidenhead.js (Version with Labels) */
L.Maidenhead = L.LayerGroup.extend({
    options: {
        color: 'rgba(0, 0, 0, 0.4)',
        weight: 1,
        step: 2 // ความละเอียดเริ่มต้น
    },

    initialize: function (options) {
        L.LayerGroup.prototype.initialize.call(this);
        L.setOptions(this, options);
    },

    onAdd: function (map) {
        this._map = map;
        this._draw();
        map.on('moveend', this._draw, this);
    },

    onRemove: function (map) {
        map.off('moveend', this._draw, this);
        this.clearLayers();
    },

    _draw: function () {
        this.clearLayers();
        const bounds = this._map.getBounds();
        const zoom = this._map.getZoom();

        // กำหนดความละเอียดตาม Zoom
        // Zoom น้อย (มองไกล) = Grid 2 องศา (Grid ใหญ่)
        // Zoom มาก (เจาะลึก) = Grid เล็กลง
        let gridStep = 2; // ระดับ Sector (เช่น OK)
        if (zoom >= 8) gridStep = 1;     
        if (zoom >= 10) gridStep = 0.5;   // 4 หลัก (OK03)
        // if (zoom >= 13) gridStep = ... // ถ้าอยากได้ 6 หลักต้องคำนวณละเอียดกว่านี้ (แต่ 4 หลักพอสำหรับดูภาพรวม)

        // วาดเส้นแนวนอน (Latitude)
        for (let lat = Math.floor(bounds.getSouth() / gridStep) * gridStep; lat < bounds.getNorth(); lat += gridStep) {
            this.addLayer(L.polyline([[lat, bounds.getWest()], [lat, bounds.getEast()]], { 
                color: this.options.color, weight: this.options.weight, dashArray: '5, 5' 
            }));
        }

        // วาดเส้นแนวตั้ง (Longitude)
        for (let lng = Math.floor(bounds.getWest() / gridStep) * gridStep; lng < bounds.getEast(); lng += gridStep) {
            this.addLayer(L.polyline([[bounds.getSouth(), lng], [bounds.getNorth(), lng]], { 
                color: this.options.color, weight: this.options.weight, dashArray: '5, 5' 
            }));
        }

        // --- ส่วนที่เพิ่ม: วาดป้ายชื่อ (Labels) ---
        // วนลูปเพื่อหาจุดกึ่งกลางของแต่ละช่อง แล้วแปะ Text ลงไป
        for (let lat = Math.floor(bounds.getSouth() / gridStep) * gridStep; lat < bounds.getNorth(); lat += gridStep) {
            for (let lng = Math.floor(bounds.getWest() / gridStep) * gridStep; lng < bounds.getEast(); lng += gridStep) {
                
                // หาจุดกึ่งกลางของช่อง
                let centerLat = lat + (gridStep / 2);
                let centerLng = lng + (gridStep / 2);

                // แปลงพิกัดกึ่งกลางเป็นชื่อ Grid (Locator)
                let gridName = this._getLocator(centerLat, centerLng);

                // สร้าง Icon ที่เป็นตัวหนังสือ
                let labelIcon = L.divIcon({
                    className: 'grid-label', // เรียกใช้ CSS ที่เราเพิ่มไป
                    html: gridName,
                    iconSize: [50, 20],
                    iconAnchor: [25, 10] // จัดให้อยู่ตรงกลางเป๊ะ
                });

                // ปักลงแผนที่
                this.addLayer(L.marker([centerLat, centerLng], { icon: labelIcon, interactive: false }));
            }
        }
    },

    // ฟังก์ชันคำนวณชื่อ Grid (แบบย่อ 4 หลัก)
    _getLocator: function(lat, lng) {
        const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        lng = lng + 180;
        lat = lat + 90;
        
        const f1 = A[Math.floor(lng / 20)];
        const f2 = A[Math.floor(lat / 10)];
        
        let rLng = lng % 20;
        let rLat = lat % 10;
        
        const s1 = Math.floor(rLng / 2);
        const s2 = Math.floor(rLat / 1);
        
        return f1 + f2 + s1 + s2; // คืนค่า เช่น "OK03"
    }
});

L.maidenhead = function (options) {
    return new L.Maidenhead(options);
};