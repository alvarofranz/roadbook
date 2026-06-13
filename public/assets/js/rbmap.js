'use strict';
/* RBMap — Mapbox GL helper used by the Editor (full roadbook editing) and the
 * Reader (the interactive per-note map): draws a roadbook (track + waypoints),
 * live recording, photo pins, a draggable edit marker, a satellite ↔ topo layer
 * toggle, and lets you select waypoints and highlight the active one. */
// The two base styles the built-in layer toggle flips between (satellite photo ↔ topo).
const STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';
const STYLE_TOPO = 'mapbox://styles/mapbox/outdoors-v12';
window.RBMap = class RBMap {
    constructor(containerId, opts = {}) {
        this.ready = false; this._pending = null; this._onWpt = null; this._baseCursor = '';
        const { layerToggle, ...mapOpts } = opts; // layerToggle is ours, not a Mapbox option
        const cont = document.getElementById(containerId);
        if (!window.mapboxgl || !window.RB_CONFIG || !RB_CONFIG.mapboxToken) {
            if (cont) cont.innerHTML = '<div class="map-placeholder">Map unavailable (Mapbox token).</div>';
            return;
        }
        mapboxgl.accessToken = RB_CONFIG.mapboxToken;
        try {
            this.map = new mapboxgl.Map(Object.assign({
                container: containerId, style: STYLE_SATELLITE,
                center: [-3.6, 37.178], zoom: 12, attributionControl: true,
            }, mapOpts));
        } catch (e) { // no WebGL on this device — degrade to a placeholder, never kill the page
            if (cont) cont.innerHTML = '<div class="map-placeholder">Map unavailable (WebGL).</div>';
            this.map = null;
            return;
        }
        this._topo = /outdoors/.test(mapOpts.style || ''); // tracks which base style is live
        this.map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
        this.map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }));
        if (layerToggle) this.map.addControl(layerToggleControl(this), 'top-right');
        // layer-scoped listeners register ONCE (they survive style swaps; re-adding them would double-fire)
        const m = this.map;
        m.on('click', 'rb-wpts', (e) => { if (this._onWpt && e.features[0]) this._onWpt(parseInt(e.features[0].properties.i, 10)); });
        m.on('click', 'rb-photos', (e) => { if (this._onPhoto && e.features[0]) this._onPhoto(JSON.parse(e.features[0].properties.d)); });
        m.on('mouseenter', 'rb-wpts', () => m.getCanvas().style.cursor = 'pointer');
        m.on('mouseleave', 'rb-wpts', () => m.getCanvas().style.cursor = this._baseCursor);
        m.on('mouseenter', 'rb-photos', () => m.getCanvas().style.cursor = 'pointer');
        m.on('mouseleave', 'rb-photos', () => m.getCanvas().style.cursor = this._baseCursor);
        m.on('load', () => { this._init(); this._terrain(); this.ready = true; m.resize(); if (this._pending) { this.showRoadbook(this._pending, this._pendingNoFit, this._pendingGaps); this._pending = null; } if (this._lastSel) this.select(this._lastSel, true); });
    }
    // Swap the base style (satellite ↔ topo). Mapbox wipes every custom
    // source/layer on setStyle, so everything is rebuilt and the caller repaints
    // its data in onReady.
    setBaseStyle(styleUrl, onReady) {
        if (!this.map) return;
        this.ready = false;
        this._topo = /outdoors/.test(styleUrl);
        this.map.setStyle(styleUrl);
        this.map.once('style.load', () => { this._init(); this._terrain(); this.ready = true; if (onReady) onReady(); });
    }
    // Built-in layer toggle (satellite photo ↔ topo): swap the base style and
    // repaint the last roadbook + selection. Simple consumers (the Reader) get
    // this for free via `{ layerToggle: true }`.
    toggleBaseStyle() {
        this.setBaseStyle(this._topo ? STYLE_SATELLITE : STYLE_TOPO, () => {
            if (this._lastRb) this.showRoadbook(this._lastRb, true, this._lastGaps);
            if (this._lastSel) this.select(this._lastSel, true);
        });
    }
    // Tear down the GL context (Reader closes the inline note map this way).
    destroy() { if (this.map) { this.map.remove(); this.map = null; } this.ready = false; }
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
        m.addSource('rb-gap', { type: 'geojson', data: this._empty() });
        m.addLayer({ id: 'rb-gap', type: 'line', source: 'rb-gap', paint: { 'line-color': '#e8b059', 'line-width': 2, 'line-dasharray': [2, 2] } });
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
    // `gapIdx` (editor): track indexes whose following segment is an OPEN cut —
    // the line splits there and a dashed connector shows the unfilled hole.
    showRoadbook(rb, noFit, gapIdx) {
        if (!this.map) return;
        this._lastRb = rb; this._lastGaps = gapIdx; // remembered so a style swap can repaint
        if (!this.ready) { this._pending = rb; this._pendingNoFit = noFit; this._pendingGaps = gapIdx; return; }
        const coords = rb.track.map((p) => [p.lon, p.lat]);
        const cuts = (gapIdx || []).slice().sort((a, b) => a - b);
        const pieces = []; let from = 0;
        cuts.forEach((i) => { pieces.push(coords.slice(from, i + 1)); from = i + 1; });
        pieces.push(coords.slice(from));
        this.map.getSource('rb-track').setData({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: pieces.filter((c) => c.length > 1) } });
        this.map.getSource('rb-gap').setData(cuts.length
            ? { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: cuts.map((i) => [coords[i], coords[i + 1]]) } }
            : this._empty());
        this.map.getSource('rb-wpts').setData({
            type: 'FeatureCollection',
            features: rb.notes.map((n, i) => ({ type: 'Feature', properties: { num: String(n.num), i: String(i) }, geometry: { type: 'Point', coordinates: [n.lon, n.lat] } })),
        });
        if (!noFit) this._fit(rb);
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
        this._lastSel = note; // remembered so a style swap can re-highlight
        if (!this.map || !this.ready) return;
        this.map.getSource('rb-sel').setData(note ? { type: 'Feature', geometry: { type: 'Point', coordinates: [note.lon, note.lat] } } : this._empty());
        if (note && !noEase) this.map.easeTo({ center: [note.lon, note.lat], duration: 500 });
    }
    _fit(rb) {
        if (!this.map || !rb.track.length) return;
        const lons = rb.track.map((p) => p.lon), lats = rb.track.map((p) => p.lat);
        this.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, duration: 600 });
    }
    onWaypoint(cb) { this._onWpt = cb; }
    // Draggable marker for the note being edited; onDragEnd(lat, lon) fires on drop.
    // Pass note=null to clear it; noEase keeps the current view (the Editor's main
    // map already shows the whole route, so it must not jump on every selection).
    setEditMarker(note, onDragEnd, noEase) {
        if (!this.map) return;
        if (this._editMarker) { this._editMarker.remove(); this._editMarker = null; }
        if (!note || !this.ready) return;
        this._editMarker = new mapboxgl.Marker({ draggable: true, color: '#ff2a2a', scale: 1.2 }).setLngLat([note.lon, note.lat]).addTo(this.map);
        this._editMarker.on('dragend', () => { const l = this._editMarker.getLngLat(); onDragEnd(l.lat, l.lng); });
        if (!noEase) this.map.easeTo({ center: [note.lon, note.lat], zoom: Math.max(this.map.getZoom(), 14), duration: 400 });
    }
};
// A small Mapbox control button that flips the base style (satellite ↔ topo).
function layerToggleControl(rbmap) {
    return {
        onAdd() {
            const c = document.createElement('div');
            c.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
            const b = document.createElement('button');
            b.type = 'button';
            b.title = window.RBt ? RBt('Map style') : 'Map style';
            b.setAttribute('aria-label', b.title);
            b.innerHTML = '<i class="fa-solid fa-layer-group" aria-hidden="true"></i>';
            b.onclick = () => rbmap.toggleBaseStyle();
            c.appendChild(b); this._c = c;
            return c;
        },
        onRemove() { this._c.remove(); },
    };
}
// The canonical base-style URLs, exposed so the Editor's own toggle reuses them.
window.RBMap.STYLE_SATELLITE = STYLE_SATELLITE;
window.RBMap.STYLE_TOPO = STYLE_TOPO;
