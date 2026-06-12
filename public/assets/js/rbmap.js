'use strict';
/* RBMap — Mapbox GL helper used by the Editor: draws a roadbook (track +
 * waypoints), live recording, photo pins, a draggable edit marker, and lets
 * you select waypoints and highlight the active one. */
window.RBMap = class RBMap {
    constructor(containerId, opts = {}) {
        this.ready = false; this._pending = null; this._onWpt = null; this._baseCursor = '';
        const cont = document.getElementById(containerId);
        if (!window.mapboxgl || !window.RB_CONFIG || !RB_CONFIG.mapboxToken) {
            if (cont) cont.innerHTML = '<div class="map-placeholder">Map unavailable (Mapbox token).</div>';
            return;
        }
        mapboxgl.accessToken = RB_CONFIG.mapboxToken;
        try {
            this.map = new mapboxgl.Map(Object.assign({
                container: containerId, style: RB_CONFIG.mapStyle || 'mapbox://styles/mapbox/satellite-streets-v12',
                center: [-3.6, 37.178], zoom: 12, attributionControl: true,
            }, opts));
        } catch (e) { // no WebGL on this device — degrade to a placeholder, never kill the page
            if (cont) cont.innerHTML = '<div class="map-placeholder">Map unavailable (WebGL).</div>';
            this.map = null;
            return;
        }
        this.map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
        this.map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }));
        this.map.on('load', () => { this._init(); this._terrain(); this.ready = true; this.map.resize(); if (this._pending) { this.showRoadbook(this._pending, this._pendingNoFit); this._pending = null; } });
    }
    _empty() { return { type: 'FeatureCollection', features: [] }; }
    // 3D: real elevation + atmospheric sky for a richer satellite view.
    _terrain() {
        const m = this.map;
        try {
            if (!m.getSource('mapbox-dem')) m.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
            m.setTerrain({ source: 'mapbox-dem', exaggeration: 1.3 });
            if (!m.getLayer('sky')) m.addLayer({ id: 'sky', type: 'sky', paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun-intensity': 12 } });
            m.setMaxPitch(80);
        } catch (e) { /* terrain unavailable offline */ }
    }
    _init() {
        const m = this.map;
        m.addSource('rb-track', { type: 'geojson', data: this._empty() });
        m.addLayer({ id: 'rb-track', type: 'line', source: 'rb-track', paint: { 'line-color': '#ff5a45', 'line-width': 4 } });
        m.addSource('rb-sel', { type: 'geojson', data: this._empty() });
        m.addLayer({ id: 'rb-sel', type: 'circle', source: 'rb-sel', paint: { 'circle-radius': 11, 'circle-color': 'rgba(232,176,89,.35)', 'circle-stroke-color': '#e8b059', 'circle-stroke-width': 3 } });
        m.addSource('rb-wpts', { type: 'geojson', data: this._empty() });
        m.addLayer({ id: 'rb-wpts', type: 'circle', source: 'rb-wpts', paint: { 'circle-radius': 6, 'circle-color': '#e8b059', 'circle-stroke-color': '#0e1116', 'circle-stroke-width': 2 } });
        m.addLayer({ id: 'rb-wpts-l', type: 'symbol', source: 'rb-wpts', layout: { 'text-field': ['get', 'num'], 'text-size': 11, 'text-offset': [0, -1.3] }, paint: { 'text-color': '#fff', 'text-halo-color': '#0e1116', 'text-halo-width': 1.4 } });
        m.addSource('rb-live', { type: 'geojson', data: this._empty() });
        m.addLayer({ id: 'rb-live', type: 'line', source: 'rb-live', paint: { 'line-color': '#3ad29f', 'line-width': 4 } });
        m.addSource('rb-photos', { type: 'geojson', data: this._empty() });
        m.addLayer({ id: 'rb-photos', type: 'circle', source: 'rb-photos', paint: { 'circle-radius': 7, 'circle-color': '#3a8dff', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
        m.addLayer({ id: 'rb-photos-i', type: 'symbol', source: 'rb-photos', layout: { 'text-field': '📷', 'text-size': 11 } });
        m.addSource('rb-pos', { type: 'geojson', data: this._empty() });
        m.addLayer({ id: 'rb-pos', type: 'circle', source: 'rb-pos', paint: { 'circle-radius': 7, 'circle-color': '#5aa9ff', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
        m.on('click', 'rb-wpts', (e) => { if (this._onWpt && e.features[0]) this._onWpt(parseInt(e.features[0].properties.i, 10)); });
        m.on('click', 'rb-photos', (e) => { if (this._onPhoto && e.features[0]) this._onPhoto(JSON.parse(e.features[0].properties.d)); });
        m.on('mouseenter', 'rb-wpts', () => m.getCanvas().style.cursor = 'pointer');
        m.on('mouseleave', 'rb-wpts', () => m.getCanvas().style.cursor = this._baseCursor);
        m.on('mouseenter', 'rb-photos', () => m.getCanvas().style.cursor = 'pointer');
        m.on('mouseleave', 'rb-photos', () => m.getCanvas().style.cursor = this._baseCursor);
    }
    // Base cursor for the editor's map tools (crosshair while drawing/cutting).
    setCursor(cursor) { this._baseCursor = cursor || ''; if (this.map) this.map.getCanvas().style.cursor = this._baseCursor; }
    // One-off pin (draw seed / cut anchor); pass null to clear.
    setPin(pt) {
        if (!this.map) return;
        if (this._pin) { this._pin.remove(); this._pin = null; }
        if (pt) this._pin = new mapboxgl.Marker({ color: '#e8b059', scale: 0.8 }).setLngLat([pt.lon, pt.lat]).addTo(this.map);
    }
    // "you are here" dot; follow=true recenters on it.
    setPosition(lat, lon, follow) {
        if (!this.map || !this.ready) return;
        this.map.getSource('rb-pos').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] } });
        if (follow) this.map.easeTo({ center: [lon, lat], duration: 400 });
    }
    showRoadbook(rb, noFit) {
        if (!this.map) return;
        if (!this.ready) { this._pending = rb; this._pendingNoFit = noFit; return; }
        this.map.getSource('rb-track').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: rb.track.map((p) => [p.lon, p.lat]) } });
        this.map.getSource('rb-wpts').setData({
            type: 'FeatureCollection',
            features: rb.notes.map((n, i) => ({ type: 'Feature', properties: { num: String(n.num), i: String(i) }, geometry: { type: 'Point', coordinates: [n.lon, n.lat] } })),
        });
        if (!noFit) this.fit(rb);
    }
    // Live recording: draw the growing track + waypoint + geolocated-photo markers.
    setLiveTrack(pts, wpts, photos) {
        if (!this.map || !this.ready) return;
        this.map.getSource('rb-track').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) } });
        if (wpts) this.map.getSource('rb-wpts').setData({
            type: 'FeatureCollection',
            features: wpts.map((w, i) => ({ type: 'Feature', properties: { num: String(i + 1), i: String(i) }, geometry: { type: 'Point', coordinates: [w.lon, w.lat] } })),
        });
        if (photos) this.setPhotos(photos);
    }
    // Photo pins (capture position). onClick(photo) fires when a pin is tapped.
    setPhotos(photos, onClick) {
        if (onClick) this._onPhoto = onClick;
        if (!this.map || !this.ready) return;
        this.map.getSource('rb-photos').setData({
            type: 'FeatureCollection',
            features: (photos || []).filter((p) => p.lat != null).map((p) => ({ type: 'Feature', properties: { d: JSON.stringify(p) }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
        });
    }
    // Green overlay for an in-progress "adjust" sub-track (keeps the base track visible).
    setOverlay(pts) {
        if (!this.map || !this.ready) return;
        this.map.getSource('rb-live').setData(pts && pts.length ? { type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) } } : this._empty());
    }
    select(note, noEase) {
        if (!this.map || !this.ready) return;
        this.map.getSource('rb-sel').setData(note ? { type: 'Feature', geometry: { type: 'Point', coordinates: [note.lon, note.lat] } } : this._empty());
        if (note && !noEase) this.map.easeTo({ center: [note.lon, note.lat], duration: 500 });
    }
    fit(rb) {
        if (!this.map || !rb.track.length) return;
        const lons = rb.track.map((p) => p.lon), lats = rb.track.map((p) => p.lat);
        this.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, duration: 600 });
    }
    onWaypoint(cb) { this._onWpt = cb; }
    // Draggable marker for the note being edited; onDragEnd(lat, lon) fires on drop.
    setEditMarker(note, onDragEnd) {
        if (!this.map || !this.ready) return;
        if (this._editMarker) this._editMarker.remove();
        this._editMarker = new mapboxgl.Marker({ draggable: true, color: '#e8b059' }).setLngLat([note.lon, note.lat]).addTo(this.map);
        this._editMarker.on('dragend', () => { const l = this._editMarker.getLngLat(); onDragEnd(l.lat, l.lng); });
        this.map.easeTo({ center: [note.lon, note.lat], zoom: Math.max(this.map.getZoom(), 14), duration: 400 });
    }
    clearEditMarker() { if (this._editMarker) { this._editMarker.remove(); this._editMarker = null; } }
};
