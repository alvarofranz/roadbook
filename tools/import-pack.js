#!/usr/bin/env node
/* Importa un RB_Reader_pack (carpeta con rb.json + icons/) a un track de la
 * galería: roadbook JSON AUTOCONTENIDO (iconos embebidos como data-URI,
 * métricas recalculadas, meta limpia) en public/tracks/<slug>/roadbook.json,
 * y actualiza public/tracks/index.json. Imprime la URL del thumbnail (Mapbox
 * static) por stdout para que el wrapper lo descargue.
 *
 * Uso: node tools/import-pack.js <packDir> <slug> [location] */
const fs = require('fs'), path = require('path');
global.window = {};
require(path.join(__dirname, '../public/assets/js/roadbook-core.js'));
const RB = global.window.RB;

const packDir = process.argv[2];
const slug = process.argv[3];
const location = process.argv[4] || '';
if (!packDir || !slug) { console.error('Uso: node import-pack.js <packDir> <slug> [location]'); process.exit(1); }

const PUB = path.join(__dirname, '../public');
const rb = JSON.parse(fs.readFileSync(path.join(packDir, 'rb.json'), 'utf8'));
rb.meta = rb.meta || {};
delete rb.meta.logo_path;
RB.recomputeMetrics(rb);

/* ---- embeber iconos como data-URI (case-insensitive: pack, luego set estándar) ---- */
const iconsDir = path.join(packDir, 'icons');
const assetDir = path.join(PUB, 'assets/icons');
const packFiles = fs.existsSync(iconsDir) ? fs.readdirSync(iconsDir) : [];
const assetFiles = fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : [];
const mime = (f) => /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : /\.svg$/i.test(f) ? 'image/svg+xml' : /\.jpe?g$/i.test(f) ? 'image/jpeg' : 'application/octet-stream';
const find = (base, dir, files) => { const lo = base.toLowerCase(); const f = files.find((x) => x.toLowerCase() === lo); return f ? path.join(dir, f) : null; };
const cache = {};
function embed(name) {
    const base = String(name || '').split('/').pop();
    if (!base) return null;
    if (base in cache) return cache[base];
    const p = find(base, iconsDir, packFiles) || find(base, assetDir, assetFiles);
    cache[base] = p ? 'data:' + mime(p) + ';base64,' + fs.readFileSync(p).toString('base64') : null;
    return cache[base];
}
// Biblioteca de iconos ÚNICA (deduplicada) → roadbook pequeño y autocontenido.
rb.icons = {};
let embedded = 0; const missing = new Set();
const used = new Set();
rb.notes.forEach((n) => (n.icons || []).forEach((ic) => used.add(String(ic.name || ic.file || '').split('/').pop())));
for (const base of used) {
    if (!base) continue;
    const u = embed(base);
    if (u) { rb.icons[base] = u; embedded++; } else missing.add(base);
}

/* ---- escribir track + manifiesto ---- */
const tdir = path.join(PUB, 'challenges', slug);
fs.mkdirSync(tdir, { recursive: true });
fs.writeFileSync(path.join(tdir, 'roadbook.rdbk'), JSON.stringify(rb));

const manPath = path.join(PUB, 'challenges', 'index.json');
let man = { tracks: [] };
try { man = JSON.parse(fs.readFileSync(manPath, 'utf8')); } catch (e) {}
man.tracks = (man.tracks || []).filter((t) => t.slug !== slug);
man.tracks.push({ slug, title: rb.meta.title || slug, location, km: +(rb.meta.total_distance / 1000).toFixed(2), notes: rb.notes.length, points: rb.track.length, thumb: 'thumb.jpg' });
man.tracks.sort((a, b) => String(a.title).localeCompare(String(b.title)));
fs.writeFileSync(manPath, JSON.stringify(man, null, 1));

/* ---- URL del thumbnail (Mapbox static, traza reducida como polilínea) ---- */
const cfg = fs.readFileSync(path.join(PUB, 'assets/js/config.js'), 'utf8');
const token = (cfg.match(/mapboxToken:\s*'([^']+)'/) || [])[1] || '';
const red = RB.reduceTrack(rb.track, 25).slice(0, 280);
const enc = encodePolyline(red.map((p) => [p.lat, p.lon]));
const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/path-5+ff5a45-0.9(${encodeURIComponent(enc)})/auto/640x384@2x?access_token=${token}`;

console.log('THUMB_URL=' + url);
console.error(`OK · slug=${slug} · ${rb.notes.length} notas · ${(rb.meta.total_distance / 1000).toFixed(1)} km · iconos embebidos=${embedded}${missing.size ? ' · faltan=' + [...missing].join(',') : ''}`);

function encodePolyline(coords) {
    let out = '', lastLat = 0, lastLng = 0;
    const enc = (v) => { v = v < 0 ? ~(v << 1) : (v << 1); let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
    for (const [lat, lng] of coords) { const la = Math.round(lat * 1e5), ln = Math.round(lng * 1e5); out += enc(la - lastLat) + enc(ln - lastLng); lastLat = la; lastLng = ln; }
    return out;
}
