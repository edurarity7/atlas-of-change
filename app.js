/* Atlas of Change v5: a globe made only of dots. Tap a country to see who it fought, helped and backed,
   drawn as arrows around the globe, for the chosen year and faintly for every other year.
   Data: app/data/*.json (scripts/build_data.py, scripts/build_dots.py, content/narratives.py). */
(async function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (id, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover)").matches;
  const desktop = () => innerWidth >= 900;
  const FIRST = 1886, LAST = 2025, BORDERS_END = 2019, ACD_START = 1946, ESD = [1975, 2017];
  const ME_BOX = [24, 10, 64, 44];
  const BG = "#030303";
  const COL = { base: "rgba(242,240,235,0.6)", dim: "rgba(242,240,235,0.17)", past: "rgba(242,240,235,0.42)", sel: "rgba(255,255,255,1)", hover: "rgba(255,255,255,0.95)",
    war: "rgba(255,74,61,1)", minor: "rgba(232,84,72,0.78)", enemy: "rgba(255,74,61,1)", friend: "rgba(250,248,242,0.98)", peace: "rgba(127,207,160,1)", none: "rgba(0,0,0,0)" };
  const ARC = { red: "255,74,61", white: "246,244,238", green: "127,207,160" };

  // ------------------------------------------------------------------ data
  const load = (f) => fetch("data/" + f + "?v=5").then((r) => { if (!r.ok) throw new Error(f + " (" + r.status + ")"); return r.json(); });
  let places, dots, countries, cdata, events, support, peace, meta, S;
  try {
    [places, dots, countries, cdata, events, support, peace, meta, S] = await Promise.all(
      ["places.json", "dots.json", "countries.json", "conflicts.json", "events.json", "support.json", "peace.json", "meta.json", "stories.json"].map(load));
  } catch (e) { $("#yearSum").textContent = "The atlas data did not load (" + e.message + "). Reload to try again."; return; }
  const conflicts = cdata.conflicts, groups = cdata.groups, stories = S.stories, occs = S.occupations, SRC = { ...S.sources };
  for (const s of meta.sources) {
    const k = /CShapes/.test(s.name) ? "cshapes" : /GED/.test(s.name) ? "ged" : /External/.test(s.name) ? "esd" : /Peace/.test(s.name) ? "pa" : "acd";
    SRC["data-" + k] = { badge: "DATA", cite: s.name + ". " + s.cite, url: s.url };
  }
  const evByYear = new Map();
  for (const r of events.rows) { if (!evByYear.has(r[0])) evByYear.set(r[0], []); evByYear.get(r[0]).push(r); }

  // ------------------------------------------------------------------ names
  function countryName(n, y) {
    const r = { "Turkey (Ottoman Empire)": y < 1923 ? "Ottoman Empire" : "Turkey", "Iran (Persia)": y < 1935 ? "Persia" : "Iran",
      "Russia (Soviet Union)": y >= 1922 && y < 1992 ? "Soviet Union" : "Russia", "Yemen (Arab Republic of Yemen)": y < 1990 ? "North Yemen" : "Yemen",
      "Yemen, People's Republic of": "South Yemen", "Germany (Prussia)": "Germany", "Macedonia (FYROM/North Macedonia)": "North Macedonia",
      "Italy/Sardinia": "Italy", "Rumania": "Romania", "Korea, Republic of": "South Korea", "Korea, People's Republic of": "North Korea",
      "United States of America": "United States" };
    return r[n] || n;
  }
  const borderYear = (y) => Math.min(y, BORDERS_END) + 0.5;
  const featCache = new Map();
  const visibleFeatures = (y) => { const k = borderYear(y); if (!featCache.has(k)) featCache.set(k, places.filter((p) => p.s <= k && p.e > k)); return featCache.get(k); };
  const nameOf = (gw, y) => { const f = visibleFeatures(y).find((x) => x.g === gw); return countryName(f?.n || countries[gw]?.n || "", y); };
  const conflictName = (c) => c.name.replace("Yemen (North Yemen)", "Yemen").replace("Israel: Israel", "Mandate Palestine: Jewish insurgency");
  const gov = (s) => (s || "").replace(/Government of /g, "").replace("Yemen (North Yemen)", "Yemen").replace("Russia (Soviet Union)", "Russia");
  const span = (a, b) => (a === b ? String(a) : a + "–" + b);
  // readable names: a written story's title if one covers that year, "A vs B" for wars between states, else the record's own name
  const vsName = (c) => { const v = Object.values(c.years)[0]; return /Interstate/.test(v.type) && v.b.includes("Government") ? (gov(v.a) + " vs " + gov(v.b)).replace(/United States of America/g, "United States") : null; };
  const labelOf = (c, y) => { const s = stories.find((st) => st.conflicts.includes(c.id) && y >= st.start && y <= st.end); return s ? s.title : vsName(c) || conflictName(c); };
  const goalOf = (c) => c.incomp === "Territory" ? { i: "territory", t: "Fought over territory" } : c.incomp === "Government" ? { i: "government", t: "Fought over who governs" } : { i: "territory", t: "Fought over territory and government" };

  // ------------------------------------------------------------------ state + helpers
  const state = { year: LAST, stack: [], sel: null, focus: null, hover: null, playing: null, layers: { events1: true, events3: false, occupation: true } };
  const activeConflicts = (y) => Object.values(conflicts).filter((c) => c.years[y]).sort((p, q) => q.years[y].int - p.years[y].int || conflictName(p).localeCompare(conflictName(q)));
  const nearestYear = (c, y) => (c.years[y] ? y : Object.keys(c.years).map(Number).reduce((b, v) => (Math.abs(v - y) < Math.abs(b - y) ? v : b)));
  const activeOccs = (y) => occs.filter((o) => y >= o.from && y <= o.to);
  const capital = (gw) => { const c = countries[gw]; return c && c.cx != null ? [c.cx, c.cy] : null; };
  const storyFor = (c, y) => { const list = stories.filter((s) => s.conflicts.includes(c.id)); return list.find((s) => y >= s.start && y <= s.end) || list.sort((a, b) => Math.abs(a.start - y) - Math.abs(b.start - y))[0]; };
  const involves = (c, gw) => c.loc.includes(gw) || Object.values(c.years).some((v) => v.ga.includes(gw) || v.gb.includes(gw));

  // ------------------------------------------------------------------ connections: who did what to whom, year by year
  // t: war (main enemies), opp (on opposing sides via troops), help (sent troops to help), back (backed a government),
  //    rebels (backed rebels in a country), peace (signed an agreement), occupy (held another state's land)
  const MUTUAL = new Set(["war", "opp", "peace"]);
  const links = [], byGw = new Map();
  const addLink = (L) => { if (L.a === L.b || L.a == null || L.b == null) return; links.push(L); for (const g of [L.a, L.b]) { if (!byGw.has(g)) byGw.set(g, []); byGw.get(g).push(L); } };
  for (const c of Object.values(conflicts)) for (const [ys, v] of Object.entries(c.years)) {
    const y = +ys, A = [...new Set(v.pa)], B = [...new Set(v.pb)], SA = [...new Set(v.sa)].filter((g) => !A.includes(g)), SB = [...new Set(v.sb)].filter((g) => !B.includes(g));
    for (const a of A) for (const b of B) addLink({ t: "war", a, b, y, c: c.id, int: v.int });
    for (const a of [...A, ...SA]) for (const b of [...B, ...SB]) if (SA.includes(a) || SB.includes(b)) addLink({ t: "opp", a, b, y, c: c.id, int: v.int });
    for (const [side, prim, lead] of [[SA, A, v.a], [SB, B, v.b]]) for (const s of side) {
      if (prim.length) for (const p of prim) addLink({ t: "help", a: s, b: p, y, c: c.id });
      else for (const p of c.loc) addLink({ t: "rebels", a: s, b: p, y, c: c.id, troops: true, via: lead });
    }
  }
  for (const L of support.links) {
    if (!L.state || L.supporter_gw == null || L.to_gw == null) continue;
    const isGov = /^Government of/.test(L.recipient);
    for (const y of L.years) addLink({ t: isGov ? "back" : "rebels", a: L.supporter_gw, b: L.to_gw, y, c: L.conflict, via: isGov ? null : L.recipient, kinds: L.types });
  }
  for (const p of peace) { const g = [...new Set(p.gw || [])]; for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) addLink({ t: "peace", a: g[i], b: g[j], y: p.year, c: p.conflict, name: p.name }); }
  for (const o of occs) if (o.hatch_gw !== o.by) for (let y = o.from; y <= Math.min(o.to, LAST); y++) addLink({ t: "occupy", a: o.by, b: o.hatch_gw, y, occ: o.id });
  const linksOf = (gw) => byGw.get(gw) || [];
  const isEnemy = (L, gw) => L.t === "war" || L.t === "opp" || L.t === "occupy" || L.t === "rebels";

  // ------------------------------------------------------------------ map
  const map = new maplibregl.Map({
    container: "map",
    style: { version: 8, projection: { type: "globe" }, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": BG } }],
      sky: { "sky-color": BG, "horizon-color": BG, "fog-color": BG, "sky-horizon-blend": 0, "horizon-fog-blend": 0, "fog-ground-blend": 1, "atmosphere-blend": 0 } },
    center: [30, 24], zoom: desktop() ? 1.5 : 0.9, attributionControl: false, renderWorldCopies: false, maxZoom: 5.6, minZoom: 0.3, maxPitch: 0, fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation(); map.dragRotate.disable(); map.keyboard.disableRotation();
  await new Promise((res) => map.on("load", res));

  // the dots: three grids, finer as you zoom in; each dot knows which state held it in every year
  const H = dots.H, NH = H.length;
  const gwAt = (h, by) => { const a = H[h]; for (let i = 0; i < a.length; i += 3) if (a[i + 1] <= by && a[i + 2] > by) return a[i]; return -1; };
  const LV = [
    { r0: 0.36, fadeIn: null, fadeOut: [2.25, 2.55] },
    { r0: 0.125, fadeIn: [2.25, 2.55], fadeOut: [4.15, 4.45] },
    { r0: 0.068, fadeIn: [4.15, 4.45], fadeOut: null },
  ];
  // each grid is drawn as two layers: dots a finer grid takes over (fade out when zooming in) and dots it does not cover (stay)
  const DOT_LAYERS = [];
  dots.levels.forEach((lv, i) => {
    const d = lv.d, feats = [];
    for (let k = 0; k < d.length; k += 4) feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [d[k] / 100, d[k + 1] / 100] }, properties: { h: d[k + 2], f: d[k + 3] } });
    map.addSource("dots" + i, { type: "geojson", data: { type: "FeatureCollection", features: feats }, buffer: 64, maxzoom: 7 });
    const L = LV[i]; L.ids = [];
    for (const inner of L.fadeOut ? [false, true] : [false]) {
      const stops = L.fadeIn ? [L.fadeIn[0], 0, L.fadeIn[1], 1] : [0, 1];
      if (inner) stops.push(L.fadeOut[0], 1, L.fadeOut[1], 0);
      const id = "dots" + i + (inner ? "i" : "");
      map.addLayer({ id, type: "circle", source: "dots" + i, minzoom: L.fadeIn ? L.fadeIn[0] : 0, maxzoom: inner ? L.fadeOut[1] + 0.01 : 24,
        filter: inner ? [">=", ["%", ["get", "f"], 4], 2] : (L.fadeOut ? ["<", ["%", ["get", "f"], 4], 2] : true),
        paint: { "circle-pitch-alignment": "map", "circle-pitch-scale": "map", "circle-color": COL.base, "circle-opacity": ["interpolate", ["linear"], ["zoom"], ...stops],
          "circle-stroke-color": "rgba(255,74,61,0.95)", "circle-stroke-width": 0, "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 0, L.r0, 6, L.r0 * 64] } });
      L.ids.push(id); DOT_LAYERS.push(id);
    }
  });

  const empty = { type: "FeatureCollection", features: [] };
  map.addSource("events", { type: "geojson", data: empty });
  map.addLayer({ id: "events", type: "circle", source: "events", paint: {
    "circle-color": ["match", ["get", "t"], 3, "#F2C25A", "#FF4A3D"], "circle-opacity": 0.45, "circle-blur": 0.6,
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, ["min", 7, ["*", 0.22, ["max", 4, ["sqrt", ["get", "b"]]]]], 5, ["min", 16, ["*", 0.5, ["max", 4, ["sqrt", ["get", "b"]]]]]] } });

  // ------------------------------------------------------------------ painting the dots for a year and a selection
  let partnerCat = new Map(), pastPartners = new Set();
  function paintDots() {
    const y = state.year, by = borderYear(y), sel = state.sel ? conflicts[state.sel] : null, focus = state.focus;
    const war = new Set(), minor = new Set(); let A = new Set(), B = new Set();
    if (sel) { const yy = sel.years[nearestYear(sel, y)]; A = new Set(yy.ga); B = new Set(yy.gb.filter((g) => !A.has(g))); }
    else if (focus == null) for (const c of activeConflicts(y)) for (const g of c.loc) (c.years[y].int === 2 ? war : minor).add(g);
    for (const g of war) minor.delete(g);
    const colorOf = (g) => {
      if (g < 0) return COL.none;
      if (focus != null) return g === focus ? COL.sel : partnerCat.has(g) ? COL[partnerCat.get(g)] : pastPartners.has(g) ? COL.past : g === state.hover ? COL.base : COL.dim;
      if (g === state.hover) return COL.hover;
      if (sel) return A.has(g) ? COL.friend : B.has(g) ? COL.enemy : COL.dim;
      return war.has(g) ? COL.war : minor.has(g) ? COL.minor : COL.base;
    };
    const byCol = new Map(), big = [], occA = [], occB = [];
    const occ = state.layers.occupation ? activeOccs(y) : [];
    const o67 = occ.some((o) => o.id === "occ-1967") && by >= 1967.44, oKw = occ.find((o) => o.id === "occ-kuwait");
    for (let h = 0; h < NH; h++) {
      const g = gwAt(h, by), c = colorOf(g);
      if (!byCol.has(c)) byCol.set(c, []); byCol.get(c).push(h);
      if (focus != null && g === focus) big.push(h);
      if (o67 && g === 666) occA.push(h);
      if (oKw && g === oKw.hatch_gw) occB.push(h);
    }
    const parts = []; let fallback = COL.base, most = -1;
    for (const [c, hs] of byCol) if (hs.length > most) { most = hs.length; fallback = c; }
    for (const [c, hs] of byCol) if (c !== fallback) parts.push(hs, c);
    const color = parts.length ? ["match", ["get", "h"], ...parts, fallback] : fallback;
    const inH = (l) => ["in", ["get", "h"], ["literal", l.length ? l : [-1]]];
    const isOcc = ["any", ["all", inH(occA), ["==", ["%", ["get", "f"], 2], 0]], inH(occB)];
    const grow = big.length ? ["case", inH(big), 1.4, 1] : 1;
    LV.forEach((L) => L.ids.forEach((id) => {
      map.setPaintProperty(id, "circle-color", ["case", isOcc, "rgba(255,74,61,0.12)", color]);
      map.setPaintProperty(id, "circle-stroke-width", ["interpolate", ["linear"], ["zoom"], 0, ["case", isOcc, 0.45, 0], 5, ["case", isOcc, 1.3, 0]]);
      map.setPaintProperty(id, "circle-radius", ["interpolate", ["exponential", 2], ["zoom"], 0, ["*", L.r0, grow], 6, ["*", L.r0 * 64, grow]]);
    }));
  }
  const occupiedAt = (h, f, y) => { const by = borderYear(y), g = gwAt(h, by); for (const o of activeOccs(y)) { if (o.id === "occ-1967" && by >= 1967.44 && g === 666 && !(f & 1)) return o; if (o.id === "occ-kuwait" && g === o.hatch_gw) return o; } return null; };

  // ------------------------------------------------------------------ the arrows: arcs lifted off the globe, drawn on a canvas above the map
  const arcCv = document.createElement("canvas"); arcCv.className = "arc-layer"; map.getCanvasContainer().appendChild(arcCv);
  const actx = arcCv.getContext("2d");
  let arcs = [], arcAnim = false;
  function sizeArcs() { const dpr = devicePixelRatio || 1, el = map.getContainer(); arcCv.width = el.clientWidth * dpr; arcCv.height = el.clientHeight * dpr; arcCv.style.width = el.clientWidth + "px"; arcCv.style.height = el.clientHeight + "px"; drawArcs(performance.now()); }
  const RAD = Math.PI / 180;
  const v3 = ([lo, la]) => [Math.cos(la * RAD) * Math.cos(lo * RAD), Math.cos(la * RAD) * Math.sin(lo * RAD), Math.sin(la * RAD)];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ll = (v) => [Math.atan2(v[1], v[0]) / RAD, Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD];
  function styleOf(t) {
    if (t === "war" || t === "opp") return { col: ARC.red, dash: null, heads: 2 };
    if (t === "occupy") return { col: ARC.red, dash: null, heads: 1 };
    if (t === "rebels") return { col: ARC.red, dash: [3, 4], heads: 1 };
    if (t === "help") return { col: ARC.white, dash: null, heads: 1 };
    if (t === "back") return { col: ARC.white, dash: [3, 4], heads: 1 };
    return { col: ARC.green, dash: null, heads: 0 };
  }
  // build the arc list for the current selection; each arc = unique (a, b, type), active if it happens in the chosen year
  function buildArcs() {
    const y = state.year, out = new Map();
    let list = [];
    if (state.focus != null) list = linksOf(state.focus);
    else if (state.sel) list = links.filter((L) => String(L.c) === state.sel && L.y === y && L.t !== "peace" && L.t !== "opp");
    for (const L of list) {
      const [a, b] = MUTUAL.has(L.t) ? [Math.min(L.a, L.b), Math.max(L.a, L.b)] : [L.a, L.b];
      const k = a + "|" + b + "|" + (L.t === "opp" ? "war" : L.t);
      const o = out.get(k) || { a, b, t: L.t === "opp" ? "war" : L.t, active: false, n: 0 };
      if (L.y === y) o.active = true; o.n++; out.set(k, o);
    }
    const pairIdx = new Map();
    arcs = [];
    for (const o of out.values()) {
      const A = capital(o.a), B = capital(o.b); if (!A || !B || (Math.abs(A[0] - B[0]) < 0.05 && Math.abs(A[1] - B[1]) < 0.05)) continue;
      const pk = Math.min(o.a, o.b) + "|" + Math.max(o.a, o.b), i = pairIdx.get(pk) || 0; pairIdx.set(pk, i + 1);
      // when the selected country is the target of a one-way arrow, keep direction; for mutual ones start at the selected country
      let a3 = v3(A), b3 = v3(B), from = o.a, to = o.b;
      if (MUTUAL.has(o.t) && state.focus === o.b) { [a3, b3] = [b3, a3]; [from, to] = [to, from]; }
      const om = Math.acos(Math.max(-1, Math.min(1, dot3(a3, b3))));
      const pts = []; const N = Math.max(16, Math.min(72, Math.round(om / RAD * 1.2)));
      for (let s = 0; s <= N; s++) { const t = s / N, s1 = Math.sin((1 - t) * om) / Math.sin(om), s2 = Math.sin(t * om) / Math.sin(om); pts.push([s1 * a3[0] + s2 * b3[0], s1 * a3[1] + s2 * b3[1], s1 * a3[2] + s2 * b3[2]]); }
      arcs.push({ ...o, from, to, pts, om, bend: (i % 2 ? -1 : 1) * (1 + Math.floor(i / 2) * 0.7), seed: Math.random(), ...styleOf(o.t) });
    }
    arcs.sort((p, q) => p.active - q.active);
    if (!arcAnim && arcs.some((a) => a.active) && !reduceMotion) { arcAnim = true; requestAnimationFrame(loop); }
    drawArcs(performance.now());
  }
  function loop(now) { if (!arcs.some((a) => a.active) || reduceMotion) { arcAnim = false; drawArcs(now); return; } drawArcs(now); requestAnimationFrame(loop); }
  function drawArcs(now) {
    const dpr = devicePixelRatio || 1, W = arcCv.width, Hh = arcCv.height;
    actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, W, Hh); if (!arcs.length) return;
    actx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = map.getCenter(), C = map.project(c), cam = v3([c.lng, c.lat]);
    const E = [-Math.sin(c.lng * RAD), Math.cos(c.lng * RAD), 0], Nn = [cam[1] * E[2] - cam[2] * E[1], cam[2] * E[0] - cam[0] * E[2], cam[0] * E[1] - cam[1] * E[0]];
    const brg = -map.getBearing() * RAD, cb = Math.cos(brg), sb = Math.sin(brg);
    const refLL = [c.lng, Math.max(-80, Math.min(80, c.lat + (c.lat > 0 ? -8 : 8)))], rv = v3(refLL), rp = map.project(refLL);
    const R = Math.hypot(rp.x - C.x, rp.y - C.y) / Math.max(1e-6, Math.hypot(dot3(rv, E), dot3(rv, Nn)));
    const ortho = (v, k) => { const x = dot3(v, E) * k, y = -dot3(v, Nn) * k; return [C.x + R * (x * cb - y * sb), C.y + R * (x * sb + y * cb)]; };
    const ptsOf = (a) => {
      const n = a.pts.length - 1, Hmax = 0.02 + 0.2 * Math.pow(a.om / Math.PI, 0.75);
      // match the map's own projection at both ends
      const e = [0, n].map((i) => { const v = a.pts[i]; if (dot3(v, cam) < 0.05) return [0, 0]; const p = map.project(ll(v)), o = ortho(v, 1); return [p.x - o[0], p.y - o[1]]; });
      const raw = a.pts.map((v, i) => { const t = i / n, k = 1 + Hmax * Math.sin(Math.PI * t), o = ortho(v, k);
        const vis = dot3(v, cam) * k > 0.02 || k * Math.hypot(dot3(v, E), dot3(v, Nn)) > 1.003;
        return [o[0] + e[0][0] * (1 - t) + e[1][0] * t, o[1] + e[0][1] * (1 - t) + e[1][1] * t, vis]; });
      // bend every arc outward, away from the globe's centre, like a flight path; a second arc between the same pair bends the other way
      const p0 = raw[0], p1 = raw[n], dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len, ny = dx / len; if (nx * ((p0[0] + p1[0]) / 2 - C.x) + ny * ((p0[1] + p1[1]) / 2 - C.y) < 0) { nx = -nx; ny = -ny; }
      const bow = Math.min(90, 0.13 * len) * a.bend;
      return raw.map((p, i) => { const s = Math.sin(Math.PI * i / n) * bow; return [p[0] + nx * s, p[1] + ny * s, p[2]]; });
    };
    const path = (P, i0, i1) => { actx.beginPath(); let pen = false; for (let i = i0; i <= i1; i++) { const p = P[i]; if (!p[2]) { pen = false; continue; } if (!pen) { actx.moveTo(p[0], p[1]); pen = true; } else actx.lineTo(p[0], p[1]); } };
    const head = (P, i, j, col) => { const a = P[i], b = P[j]; if (!a[2] || !b[2]) return; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = 7.5;
      actx.fillStyle = `rgba(${col},1)`; actx.beginPath(); actx.moveTo(b[0], b[1]); actx.lineTo(b[0] - s * Math.cos(ang - 0.42), b[1] - s * Math.sin(ang - 0.42)); actx.lineTo(b[0] - s * Math.cos(ang + 0.42), b[1] - s * Math.sin(ang + 0.42)); actx.closePath(); actx.fill(); };
    actx.lineCap = "round"; actx.lineJoin = "round";
    for (const a of arcs) {
      const P = ptsOf(a), n = P.length - 1;
      if (!a.active) { actx.setLineDash(a.dash || []); actx.strokeStyle = `rgba(${a.col},0.2)`; actx.lineWidth = 1; path(P, 0, n); actx.stroke(); continue; }
      actx.setLineDash([]); actx.strokeStyle = `rgba(${a.col},0.13)`; actx.lineWidth = 5; path(P, 0, n); actx.stroke();
      actx.setLineDash(a.dash || []); actx.lineDashOffset = a.dash && !reduceMotion ? -now / 45 : 0;
      actx.strokeStyle = `rgba(${a.col},0.9)`; actx.lineWidth = 1.6; path(P, 0, n); actx.stroke(); actx.setLineDash([]);
      // a bright pulse travelling along the arrow (both ways for wars)
      if (!reduceMotion) for (const dir of a.heads === 2 ? [1, -1] : [1]) {
        let ph = ((now / 2600 + a.seed) % 1); if (dir < 0) ph = 1 - ((now / 2600 + a.seed + 0.5) % 1);
        const iHead = Math.round(ph * n), iTail = Math.max(0, Math.min(n, iHead - dir * Math.round(n * 0.14)));
        actx.strokeStyle = `rgba(${a.col},1)`; actx.lineWidth = 2.6; path(P, Math.min(iHead, iTail), Math.max(iHead, iTail)); actx.stroke();
      }
      const m = Math.max(1, Math.round(n * 0.06));
      if (a.heads >= 1) head(P, n - m, n, a.col);
      if (a.heads === 2) head(P, m, 0, a.col);
      for (const i of a.heads === 0 ? [0, n] : []) { const p = P[i]; if (p[2]) { actx.fillStyle = `rgba(${a.col},1)`; actx.beginPath(); actx.arc(p[0], p[1], 2.6, 0, Math.PI * 2); actx.fill(); } }
    }
  }
  map.on("render", () => { if (!arcAnim) drawArcs(performance.now()); });
  map.on("resize", sizeArcs); sizeArcs();

  // ------------------------------------------------------------------ render the map for the current state
  function renderMap() {
    const y = state.year, sel = state.sel ? conflicts[state.sel] : null;
    // partners of the focused country: coloured this year, softly marked if only in other years
    partnerCat = new Map(); pastPartners = new Set();
    if (state.focus != null) for (const L of linksOf(state.focus)) {
      const p = L.a === state.focus ? L.b : L.a;
      if (L.y !== y) { pastPartners.add(p); continue; }
      const cat = isEnemy(L) ? "enemy" : L.t === "peace" ? "peace" : "friend";
      const prev = partnerCat.get(p); if (!prev || cat === "enemy" || (cat === "friend" && prev === "peace")) partnerCat.set(p, cat);
    }
    paintDots();
    const want = { 1: state.layers.events1, 2: false, 3: state.layers.events3 };
    map.getSource("events").setData({ type: "FeatureCollection", features: (evByYear.get(y) || []).filter((r) => want[r[1]] && (!sel || r[4] === sel.id || r[1] !== 1) && (state.focus == null))
      .map((r) => ({ type: "Feature", geometry: { type: "Point", coordinates: [r[2], r[3]] }, properties: { t: r[1], b: r[5], lo: r[6], hi: r[7], c: r[4] } })) });
    buildArcs();
    renderMarkers();
  }

  // ------------------------------------------------------------------ markers: story pins and labels
  let markers = [];
  function addMarker(el, lngLat, anchor = "center", offset = [0, 0]) { markers.push(new maplibregl.Marker({ element: el, anchor, offset }).setLngLat(lngLat).addTo(map)); return el; }
  const REL_ICON = { enemy: "fight", friend: "support", peace: "peace" };
  function renderMarkers() {
    markers.forEach((m) => m.remove()); markers = [];
    const y = state.year, sel = state.sel ? conflicts[state.sel] : null, focus = state.focus, placedGw = new Set();
    const lab = (gw, cls, prio, ic, click) => {
      const p = capital(gw); if (!p || placedGw.has(gw)) return; placedGw.add(gw);
      const el = document.createElement(click ? "button" : "div"); el.className = "label " + cls; el.dataset.prio = prio;
      el.innerHTML = (ic ? icon(ic) : "") + `<span>${esc(nameOf(gw, y))}</span>`;
      if (click) { el.setAttribute("aria-label", nameOf(gw, y)); el.addEventListener("click", (e) => { e.stopPropagation(); click(); }); }
      if (cls === "sel") addMarker(el, p, "bottom", [0, -8]); else addMarker(el, p, "top", [0, 6]);
    };
    const K = desktop() ? 10 : 6;
    if (focus != null) {
      lab(focus, "sel", 9);
      // name only the most important partners: main enemies first, then those connected for the most years
      const yrs = new Map(); for (const L of linksOf(focus)) { const p = L.a === focus ? L.b : L.a; if (!yrs.has(p)) yrs.set(p, new Set()); yrs.get(p).add(L.y); }
      const rankT = (g) => Math.min(...linksOf(focus).filter((L) => L.y === y && (L.a === g || L.b === g)).map((L) => ({ war: 0, occupy: 0, help: 1, back: 2, rebels: 2, opp: 3, peace: 4 })[L.t]));
      [...partnerCat].sort((p, q) => rankT(p[0]) - rankT(q[0]) || yrs.get(q[0]).size - yrs.get(p[0]).size).slice(0, K)
        .forEach(([g, cat], i) => lab(g, "rel " + cat, 6 - i * 0.1, REL_ICON[cat], () => openView({ kind: "country", gw: g })));
    } else if (sel) {
      const yy = sel.years[nearestYear(sel, y)];
      for (const g of new Set(yy.pa.length ? yy.pa : yy.ga)) lab(g, "rel friend", 7, "fight", () => openView({ kind: "country", gw: g }));
      for (const g of new Set(yy.pb.length ? yy.pb : yy.gb)) lab(g, "rel enemy", 7, "fight", () => openView({ kind: "country", gw: g }));
      [...new Set([...yy.sa, ...yy.sb])].slice(0, K - 2).forEach((g, i) => lab(g, "rel " + (yy.sa.includes(g) ? "friend" : "enemy"), 5 - i * 0.1, "troops", () => openView({ kind: "country", gw: g })));
    } else for (const s of stories) if (y >= s.start && y <= s.end) {
      const el = document.createElement("button"); el.className = "war-pin"; el.dataset.prio = 8;
      el.innerHTML = `${icon("book")}<span>${esc(s.title.replace(/^The /, ""))}</span><small>Read</small>`;
      el.setAttribute("aria-label", "Read: " + s.title);
      el.addEventListener("click", (e) => { e.stopPropagation(); openStory(s); });
      addMarker(el, s.focus, "center", [0, -46]);
    }
    // quiet country names in the region when zoomed in
    const hot = new Set(focus == null && !sel ? activeConflicts(y).flatMap((c) => c.loc) : []);
    const items = [];
    if (state.layers.occupation) for (const o of activeOccs(y)) for (const l of o.labels) if (y <= l.to) items.push({ n: l.n, p: [l.lon, l.lat], cls: "occ", prio: 1.5 });
    for (const p of visibleFeatures(y)) { if (placedGw.has(p.g) || p.cx == null || p.cx < ME_BOX[0] - 8 || p.cx > ME_BOX[2] + 6 || p.cy < ME_BOX[1] - 4 || p.cy > ME_BOX[3] + 4) continue;
      items.push({ n: countryName(p.n, y), p: [p.cx, p.cy], cls: "plain" + (hot.has(p.g) ? " hot" : ""), prio: (hot.has(p.g) ? 1 : 0) + Math.min(0.9, (p.a || 0) / 2e6) }); }
    for (const it of items) { const el = document.createElement("div"); el.className = "label " + it.cls; el.textContent = it.n; el.dataset.prio = it.prio; addMarker(el, it.p, it.cls === "occ" ? "center" : "top", [0, 4]); }
    declutter();
  }
  let dRaf = 0;
  function declutter() {
    cancelAnimationFrame(dRaf);
    dRaf = requestAnimationFrame(() => {
      const z = map.getZoom(), c = map.getCenter(), cam = v3([c.lng, c.lat]);
      const placed = [".topbar", ".yearbox", "#sheet", "#keyPanel"].map((s) => { const el = $(s); return el && !el.hidden ? el.getBoundingClientRect() : null; }).filter((r) => r && r.width);
      const sorted = [...markers].sort((a, b) => +b.getElement().dataset.prio - +a.getElement().dataset.prio);
      for (const m of sorted) {
        const el = m.getElement(), quiet = el.classList.contains("plain") || el.classList.contains("occ");
        const ll0 = m.getLngLat(), behind = dot3(v3([ll0.lng, ll0.lat]), cam) < 0.12;
        if (behind || (quiet && z < 3.0)) { el.classList.add("dim"); continue; }
        el.classList.remove("dim");
        const pad = 3, hits = (r) => r.width === 0 || placed.some((q) => !(r.right + pad < q.left || r.left - pad > q.right || r.bottom + pad < q.top || r.top - pad > q.bottom));
        const tries = el.classList.contains("rel") ? [[0, 6], [0, -34], [0, 30], [-70, -14], [70, -14]] : [null];
        let ok = false;
        for (const t of tries) { if (t) m.setOffset(t); const r = el.getBoundingClientRect(); if (!hits(r)) { placed.push(r); ok = true; break; } }
        if (!ok && tries[0]) m.setOffset(tries[0]);
        el.classList.toggle("dim", !ok);
      }
    });
  }
  map.on("moveend", declutter); map.on("idle", declutter);

  // ------------------------------------------------------------------ camera
  const pad = () => {
    const st = $("#sheet").dataset.state;
    if (desktop()) return { left: 60, right: st === "closed" ? 60 : 470, top: 150, bottom: st === "closed" ? 150 : 60 };
    return { left: 24, right: 24, top: st === "closed" ? 150 : 96, bottom: st === "closed" ? 170 : innerHeight * 0.52 };
  };
  const fly = (center, zoom, duration = 1700) => map.flyTo({ center, zoom, padding: pad(), duration: reduceMotion ? 0 : duration, curve: 1.35, essential: true });
  // fit a set of places: the further apart they are, the further out we go, so arrows around the globe stay in view
  function fitPoints(pts, maxZoom = 3.8, minD = 2.5) {
    pts = pts.filter(Boolean); if (!pts.length) return;
    const vs = pts.map(v3), s = vs.reduce((m, v) => [m[0] + v[0], m[1] + v[1], m[2] + v[2]], [0, 0, 0]), n = Math.hypot(...s) || 1, mid = [s[0] / n, s[1] / n, s[2] / n];
    const D = Math.max(minD, ...vs.map((v) => Math.acos(Math.max(-1, Math.min(1, dot3(v, mid)))) / RAD));
    const p = pad(), w = innerWidth - p.left - p.right, h = innerHeight - p.top - p.bottom, dim = Math.max(160, Math.min(w, h));
    const fill = Math.log2((2 * Math.PI * 0.5 * dim) / 512);
    const z = Math.max(fill, 0.35, Math.min(maxZoom, Math.log2((0.42 * dim * 360) / (512 * D * 1.05))));
    fly(ll(mid), z);
  }
  function flyToCountry(gw) {
    const y = state.year, now = linksOf(gw).filter((L) => L.y === y), use = now.length ? now : linksOf(gw);
    const pts = [capital(gw), ...new Set(use.map((L) => (L.a === gw ? L.b : L.a)))].map((g) => (typeof g === "number" ? capital(g) : g));
    const f = visibleFeatures(y).find((p) => p.g === gw), size = f?.a ? Math.sqrt(f.a) / 111 / 2 : 3;
    fitPoints(pts, desktop() ? 4.2 : 3.6, Math.max(2.5, Math.min(30, size)));
  }

  // ------------------------------------------------------------------ year + timeline
  const range = $("#yearRange");
  function setYear(y, { fromSlider = false, keepSheet = false } = {}) {
    y = Math.max(FIRST, Math.min(LAST, Math.round(y)));
    state.year = y; if (!fromSlider) range.value = y; range.setAttribute("aria-valuetext", String(y));
    $("#yearLabel").textContent = y;
    const act = activeConflicts(y), wars = act.filter((c) => c.years[y].int === 2).length;
    $("#yearSum").innerHTML = y < ACD_START ? "Borders only before 1946" : act.length ? `${act.length} armed conflict${act.length > 1 ? "s" : ""}${wars ? `, <b>${wars} at war level</b>` : ""}` : "No armed conflict recorded";
    renderMap(); drawSpark(); writeHash();
    if (!keepSheet && state.stack.length) { const b = $("#sheetBody"), top = b.scrollTop; renderSheet(); b.scrollTop = top; }
  }
  let rRaf = 0;
  range.addEventListener("input", () => { cancelAnimationFrame(rRaf); rRaf = requestAnimationFrame(() => setYear(+range.value, { fromSlider: true })); });
  const playBtn = $("#playBtn");
  function togglePlay() { if (state.playing) return stopPlay(); if (state.year >= LAST) setYear(ACD_START);
    $("#playIcon").setAttribute("d", "M7 5h4v14H7zM13 5h4v14h-4z"); playBtn.setAttribute("aria-pressed", "true");
    state.playing = setInterval(() => { if (state.year >= LAST) stopPlay(); else setYear(state.year + 1); }, 700); }
  function stopPlay() { clearInterval(state.playing); state.playing = null; $("#playIcon").setAttribute("d", "M7 5v14l12-7z"); playBtn.setAttribute("aria-pressed", "false"); }
  playBtn.addEventListener("click", togglePlay);
  const yStats = []; for (let y = FIRST; y <= LAST; y++) { const a = activeConflicts(y); yStats.push({ n: a.length, war: a.some((c) => c.years[y].int === 2) }); }
  const maxN = Math.max(...yStats.map((s) => s.n), 1);
  function drawSpark() {
    const cv = $("#spark"), dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext("2d"); x.scale(dpr, dpr);
    const X = (y) => 8 + ((y - FIRST) / (LAST - FIRST)) * (w - 16), bw = Math.max(1, (w - 16) / (LAST - FIRST + 1) - 0.8);
    // when a country is selected, the timeline shows the years it was connected to others
    const fy = new Map();
    if (state.focus != null) for (const L of linksOf(state.focus)) { const k = fy.get(L.y) || 0; fy.set(L.y, isEnemy(L) ? 2 : Math.max(k, 1)); }
    yStats.forEach((s, i) => { const yr = FIRST + i;
      if (state.focus != null) { const k = fy.get(yr); if (!k) return; x.fillStyle = k === 2 ? "rgba(255,74,61,.9)" : "rgba(242,240,235,.6)"; x.fillRect(X(yr) - bw / 2, 11, bw, 10); return; }
      if (!s.n) return; const bh = Math.max(1.5, (s.n / maxN) * 10); x.fillStyle = s.war ? "rgba(224,58,47,.85)" : "rgba(242,240,235,.3)"; x.fillRect(X(yr) - bw / 2, 21 - bh, bw, bh); });
    if (state.focus == null) for (const s of stories) { x.fillStyle = "#F06B60"; x.beginPath(); x.arc(X(s.start), 4, 2, 0, Math.PI * 2); x.fill(); }
    x.font = "400 10.5px Geist, -apple-system, sans-serif"; x.textAlign = "center"; x.fillStyle = "rgba(242,240,235,.36)";
    for (const y of [1900, 1925, 1950, 1975, 2000]) x.fillText(String(y), X(y), 46);
  }
  addEventListener("resize", () => { drawSpark(); declutter(); });

  // ------------------------------------------------------------------ the sheet: states and gestures
  const sheet = $("#sheet"), body = $("#sheetBody");
  const setState = (s) => { sheet.dataset.state = s; document.body.classList.toggle("sheet-open", s !== "closed"); setTimeout(declutter, 520); };
  const order = ["closed", "peek", "full"];
  function step(dir) { const i = order.indexOf(sheet.dataset.state), n = order[Math.max(0, Math.min(2, i + dir))]; if (n === "closed") closeSheet(); else setState(n); }
  $("#grip").addEventListener("click", () => step(sheet.dataset.state === "full" ? -1 : 1));
  $("#grip").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#grip").click(); } });
  (function gestures() {
    let y0 = 0, t0 = 0, dragging = false, moved = false, fromBody = false;
    const curH = () => sheet.getBoundingClientRect().height;
    const begin = (y) => { dragging = true; moved = false; y0 = y; t0 = curH(); sheet.classList.add("dragging"); };
    const move = (y) => { const dy = y - y0; if (Math.abs(dy) > 5) moved = true; sheet.style.height = Math.max(120, Math.min(innerHeight - 60, t0 - dy)) + "px"; };
    const end = (y) => { dragging = false; sheet.classList.remove("dragging"); sheet.style.height = ""; if (!moved) return; const dy = y - y0; if (dy > 70) step(-1); else if (dy < -50) step(1); };
    for (const el of [$("#grip"), $(".timeline"), $("#sheetHead")]) {
      el.addEventListener("touchstart", (e) => { if (desktop() || e.target.closest("input,button:not(#grip)")) return; begin(e.touches[0].clientY); }, { passive: true });
    }
    body.addEventListener("touchstart", (e) => { if (desktop()) return; fromBody = true; y0 = e.touches[0].clientY; moved = false; dragging = false; }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (desktop()) return;
      const y = e.touches[0].clientY;
      if (fromBody && !dragging) {
        const dy = y - y0;
        if ((dy > 8 && body.scrollTop <= 0) || (dy < -8 && sheet.dataset.state === "peek")) { begin(y0); fromBody = false; }
        else return;
      }
      if (dragging) { e.preventDefault(); move(y); }
    }, { passive: false });
    document.addEventListener("touchend", (e) => { fromBody = false; if (dragging) end(e.changedTouches[0].clientY); });
  })();

  // ------------------------------------------------------------------ views
  function openView(v, { push = true, scrollTo = null, fly: doFly = true } = {}) {
    stopPlay();
    if (push) { const top = state.stack[state.stack.length - 1]; if (!top || JSON.stringify(top) !== JSON.stringify(v)) state.stack.push(v); } else state.stack = [v];
    state.sel = v.kind === "conflict" ? String(v.id) : null;
    state.focus = v.kind === "country" ? v.gw : null;
    if (sheet.dataset.state === "closed") setState(desktop() ? "full" : "peek");
    $("#sheetHead").hidden = false;
    renderSheet(); renderMap(); drawSpark(); writeHash();
    body.scrollTop = 0;
    if (scrollTo) requestAnimationFrame(() => { const el = body.querySelector(scrollTo); if (el) body.scrollTop = el.offsetTop - 8; });
    if (!doFly) return;
    if (v.kind === "conflict") { const c = conflicts[v.id], yy = c.years[nearestYear(c, state.year)]; fitPoints([...new Set([...c.loc, ...yy.ga, ...yy.gb])].map(capital), desktop() ? 4.2 : 3.4); }
    else if (v.kind === "country") setTimeout(() => flyToCountry(v.gw), 30);
    else if (v.kind === "occupation") { const o = occs.find((x) => x.id === v.id); fitPoints(o.labels.map((l) => [l.lon, l.lat]), 4.6); }
  }
  function openStory(s) { const c = conflicts[s.conflicts[0]]; if (state.year < s.start || state.year > s.end) setYear(s.years.intro, { keepSheet: true });
    openView({ kind: "conflict", id: String(c.id) }, { push: false, scrollTo: ".chapter" }); }
  function closeSheet() { state.stack = []; state.sel = null; state.focus = null; setState("closed"); $("#sheetHead").hidden = true; body.innerHTML = ""; renderMap(); drawSpark(); writeHash(); }
  $("#sheetClose").addEventListener("click", closeSheet);
  $("#sheetBack").addEventListener("click", () => { state.stack.pop(); const v = state.stack.pop(); if (v) openView(v); else closeSheet(); });
  $("#yearSum").addEventListener("click", () => openView({ kind: "year" }, { push: false }));

  // citations collected per view, listed once at the end
  function citer() { const order = []; return {
    c: (keys) => keys.length ? `<sup class="c">${keys.map((k) => { if (!order.includes(k)) order.push(k); return `<a href="#" data-src="1">${order.indexOf(k) + 1}</a>`; }).join(",")}</sup>` : "",
    list: () => order.length ? `<div class="sec" id="sources">Sources</div><ol class="srclist">${order.map((k, i) => { const s = SRC[k]; return s ? `<li><span class="n">${i + 1}</span><span><span class="tag t-${s.badge.toLowerCase()}">${s.badge === "PEER-REVIEWED" ? "Peer-reviewed" : s.badge === "ACADEMIC" ? "Academic book" : s.badge === "PRIMARY" ? "Original document" : s.badge === "REFERENCE" ? "Reference" : "Dataset"}</span>${esc(s.cite)}${s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">Open</a>` : ""}</span></li>` : ""; }).join("")}</ol>` : "" }; }
  const invRow = (r, attrs) => `<li><button ${attrs}><span class="badge ${r.red ? "red" : ""}">${icon(r.i)}</span><span class="t"><b>${esc(r.text)}</b><span>${esc(r.sub || "")}</span></span><span class="y">${esc(r.right || "")}</span></button></li>`;
  function dateOf(dec) { const yr = Math.floor(dec), d = new Date(Date.UTC(yr, 0, 1) + (dec - yr) * 365.25 * 864e5); return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
  const fmtDate = (s) => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); };

  // a country name you can tap
  const chip = (gw, y, cls = "") => `<button class="cc ${cls}" data-open-country="${gw}"><i></i>${esc(nameOf(gw, y))}</button>`;
  const evLink = (cid, y = state.year) => conflicts[cid] ? `<button class="ev" data-open-conflict="${cid}">${esc(labelOf(conflicts[cid], y))}<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : "";

  // plain sentences about one country in one year
  const VERB = {
    "war|": (L) => L.int === 2 ? "At war with" : "In armed conflict with", "opp|": () => "On the opposing side to",
    "help|out": () => "Sent troops to help", "help|in": () => "Got troops from",
    "back|out": () => "Backed the government of", "back|in": () => "Backed by",
    "rebels|out": (L) => L.troops ? "Sent troops to back armed groups in" : "Backed armed groups in", "rebels|in": () => "Armed groups fighting it were backed by",
    "peace|": () => "Signed a peace agreement with", "occupy|out": () => "Occupied", "occupy|in": () => "Occupied by",
  };
  const TONE = { war: "red", opp: "red", rebels: "red", occupy: "red", help: "white", back: "white", peace: "green" };
  const TICON = { war: "fight", opp: "fight", rebels: "support", occupy: "occupy", help: "troops", back: "support", peace: "peace" };
  function factsOf(gw, y) {
    const groups = new Map();
    for (const L of linksOf(gw)) {
      if (L.y !== y) continue;
      const dir = MUTUAL.has(L.t) ? "" : L.a === gw ? "out" : "in", partner = L.a === gw ? L.b : L.a;
      const k = L.t + "|" + dir + "|" + (L.c ?? L.occ ?? "");
      const g = groups.get(k) || { t: L.t, dir, L, c: L.c, occ: L.occ, partners: new Set(), kinds: new Set(), via: new Set() };
      g.partners.add(partner); (L.kinds || []).forEach((x) => g.kinds.add(x)); if (L.via) g.via.add(gov(L.via)); if (L.int === 2) g.L = L;
      groups.set(k, g);
    }
    const out = [...groups.values()].map((g) => ({ ...g, verb: VERB[g.t + "|" + g.dir](g.L), tone: TONE[g.t], icon: TICON[g.t] }));
    // fighting inside the country with no foreign state on the other side
    const home = {};
    for (const c of activeConflicts(y)) { const v = c.years[y];
      if (!c.loc.includes(gw) || v.pb.length || !(v.pa.includes(gw) || !v.ga.includes(gw))) continue;
      const verb = v.pa.includes(gw) ? "Fought armed groups:" : "Fighting on its soil:";
      const f = home[verb] || (home[verb] = { t: "home", verb, tone: "redsoft", icon: "fight", cs: [], partners: new Set(), via: new Set(), kinds: new Set() });
      if (v.int === 2) f.tone = "red"; f.cs.push(c.id); f.via.add(gov(v.b)); }
    out.push(...Object.values(home));
    for (const o of activeOccs(y)) if (o.by === gw && o.hatch_gw === gw) out.push({ t: "occ", verb: "Occupies", tone: "red", icon: "occupy", occ: o.id, partners: new Set(), via: new Set(o.labels.filter((l) => y <= l.to).map((l) => l.n)), kinds: new Set() });
    if (y === 1967) for (const [g, n] of [[651, "Sinai and Gaza"], [652, "the Golan Heights"], [663, "the West Bank and East Jerusalem"]]) if (g === gw) out.push({ t: "lost", verb: "Lost control of " + n + " to Israel", tone: "red", icon: "lost", occ: "occ-1967", partners: new Set(), via: new Set(), kinds: new Set() });
    const rank = { war: 0, opp: 1, occupy: 2, occ: 2, lost: 2, home: 3, rebels: 4, help: 5, back: 6, peace: 7 };
    return out.sort((a, b) => rank[a.t] - rank[b.t]);
  }
  const factHTML = (f, y) => `<li class="fact ${f.tone}"><span class="fi">${icon(f.icon)}</span><div>
      <p>${esc(f.verb)} ${[...f.partners].map((g) => chip(g, y, f.tone)).join(" ")}${f.via.size ? ` <span class="${f.cs ? "who" : "via"}">${esc([...f.via].join(", "))}</span>` : ""}</p>
      ${f.kinds.size ? `<p class="kinds">${esc([...f.kinds].slice(0, 4).join(" · "))}</p>` : ""}
      ${f.cs ? `<div class="evs">${f.cs.map((c) => evLink(c, y)).join("")}</div>` : f.c != null ? evLink(f.c, y) : f.occ ? `<button class="ev" data-open-occ="${f.occ}">About the occupation<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}
    </div></li>`;

  // every connection of a country through the years, one row per partner
  function timelineHTML(gw) {
    const T0 = ACD_START, T1 = LAST, X = (y) => ((y - T0) / (T1 - T0 + 1)) * 100;
    const rows = new Map();
    for (const L of linksOf(gw)) {
      const p = L.a === gw ? L.b : L.a, k = isEnemy(L) ? "red" : L.t === "peace" ? "green" : L.t === "back" ? "dash" : "white";
      const r = rows.get(p) || { p, years: new Map(), n: 0, last: 0 };
      if (!r.years.has(L.y)) r.n++;
      r.years.set(L.y, [...new Set([...(r.years.get(L.y) || []), k])]); r.last = Math.max(r.last, L.y); rows.set(p, r);
    }
    if (!rows.size) return "";
    const list = [...rows.values()].sort((a, b) => b.n - a.n || b.last - a.last);
    const lane = (r, k) => { const ys = [...r.years.keys()].filter((y) => r.years.get(y).includes(k)).sort((a, b) => a - b); const out = []; let s = null, p = null;
      for (const y of ys) { if (s == null) s = p = y; else if (y === p + 1) p = y; else { out.push([s, p]); s = p = y; } } if (s != null) out.push([s, p]);
      return out.map(([a, b]) => `<i class="seg ${k}" style="left:${X(a)}%;width:${Math.max(1.6, X(b + 1) - X(a))}%" title="${span(a, b)}"></i>`).join(""); };
    const rowHTML = (r) => { const kinds = ["red", "white", "dash", "green"].filter((k) => [...r.years.values()].some((v) => v.includes(k)));
      return `<div class="tl-row"><button class="tl-name" data-open-country="${r.p}">${esc(nameOf(r.p, r.last))}</button>
        <div class="tl-strip" data-strip="1">${kinds.map((k, i) => `<div class="lane" style="top:${4 + i * 5}px">${lane(r, k)}</div>`).join("")}</div></div>`; };
    const shown = list.slice(0, 10), more = list.slice(10);
    return `<div class="sec">Connections through the years</div>
      <div class="tl" style="--now:${X(state.year) + 0.5 / (T1 - T0 + 1) * 100}%">
        ${shown.map(rowHTML).join("")}
        ${more.length ? `<details><summary>${more.length} more</summary>${more.map(rowHTML).join("")}</details>` : ""}
        <div class="tl-axis"><span></span><div>${[1950, 1975, 2000].map((yy) => `<span style="left:${X(yy)}%">${yy}</span>`).join("")}</div></div>
      </div>
      <div class="legend"><span><i class="seg red"></i>Fought or opposed</span><span><i class="seg white"></i>Sent troops to help</span><span><i class="seg dash"></i>Backed</span><span><i class="seg green"></i>Peace</span></div>
      <p class="fine">Tap a name to jump to that country, or a bar to jump to that year. Records of foreign backing cover 1975–2017.</p>`;
  }

  let observer = null;
  function renderSheet() {
    const v = state.stack[state.stack.length - 1]; if (!v) return;
    const y = state.year, cc = citer(); let k = "", h = "";
    $("#sheetBack").hidden = state.stack.length < 2;
    if (v.kind === "country") {
      const name = nameOf(v.gw, y), facts = factsOf(v.gw, y), c = countries[v.gw];
      const all = Object.values(conflicts).filter((x) => involves(x, v.gw)).sort((p, q) => q.last - p.last);
      const st = stories.filter((s) => s.conflicts.some((id) => conflicts[id] && involves(conflicts[id], v.gw)));
      const changes = [...new Set(c.periods.map((p) => Math.ceil(p[0])).filter((yy) => yy > FIRST))].sort((a, b) => a - b);
      k = "Country";
      h = `<h2>${esc(name)}</h2>
        <p class="sub">${facts.length ? `What ${esc(name)} did in <b>${y}</b>, and with whom. The arrows on the globe show the same.` : y < ACD_START ? `Conflict records start in 1946. Drag the timeline forward, or see the border changes below.` : `No armed conflict, foreign backing or peace agreement recorded for ${esc(name)} in ${y}.`}</p>
        ${facts.length ? `<ul class="facts">${facts.map((f) => factHTML(f, y)).join("")}</ul>` : ""}
        ${v.gw === 666 && y >= 1967 ? `<p class="note">The border data counts the land Israel occupied in 1967 as part of Israel. On the globe those dots are drawn as red rings. <a href="#" data-open-occ="occ-1967">About the occupied territories</a></p>` : ""}
        ${timelineHTML(v.gw)}
        ${st.length || all.length ? `<div class="sec">Wars and conflicts</div><ul class="inv">
          ${st.map((s) => invRow({ i: "book", red: true, text: s.title, sub: "Read the full story", right: span(s.start, s.end) }, `data-story="${s.id}"`)).join("")}
          ${all.map((x) => { const g = goalOf(x); return invRow({ i: g.i, red: x.years[y]?.int === 2, text: conflictName(x), sub: g.t, right: span(x.first, x.last) }, `data-open-conflict="${x.id}"`); }).join("")}</ul>` : ""}
        ${changes.length ? `<div class="sec">Its borders changed in</div><div class="years">${changes.map((yy) => `<button data-year="${yy}" class="${yy === y ? "on" : ""}">${yy}</button>`).join("")}</div>` : ""}
        <p class="fine">Borders: CShapes 2.0${cc.c(["data-cshapes"])}. Conflicts: UCDP${cc.c(["data-acd"])}. Foreign backing: UCDP${cc.c(["data-esd"])}. Peace agreements: UCDP${cc.c(["data-pa"])}.</p>`;
    }
    if (v.kind === "conflict") h = conflictHTML(conflicts[v.id], y, cc), k = "Armed conflict";
    if (v.kind === "year") {
      const act = activeConflicts(y), wars = act.filter((c) => c.years[y].int === 2).length, occ = activeOccs(y), pa = peace.filter((p) => p.year === y);
      const st = stories.filter((s) => y >= s.start && y <= s.end);
      const inBox = (p) => p.cx >= ME_BOX[0] && p.cx <= ME_BOX[2] && p.cy >= ME_BOX[1] && p.cy <= ME_BOX[3];
      const changed = visibleFeatures(y).filter((f) => Math.floor(f.s) === y && inBox(f));
      k = "The year " + y;
      h = `<h2>The Middle East in ${y}</h2>
        <p class="sub">${y < ACD_START ? "Conflict records start in 1946. Tap a country to see how its borders changed." : act.length ? `${act.length} armed conflict${act.length > 1 ? "s" : ""}, ${wars} at war level.` : "No armed conflict recorded."}${y >= ACD_START ? cc.c(["data-acd"]) : ""}</p>
        ${st.length ? `<ul class="inv">${st.map((s) => invRow({ i: "book", red: true, text: s.title, sub: "Read the full story", right: span(s.start, s.end) }, `data-story="${s.id}"`)).join("")}</ul>` : ""}
        ${act.length ? `<div class="sec">Armed conflicts</div><ul class="facts">${act.map((c) => { const v2 = c.years[y], w = v2.int === 2;
          return `<li class="fact ${w ? "red" : "redsoft"}"><span class="fi">${icon(goalOf(c).i)}</span><div><p>${[...new Set(v2.ga)].map((g) => chip(g, y)).join(" ") || esc(gov(v2.a))} <span class="via">against</span> ${[...new Set(v2.gb)].map((g) => chip(g, y, "red")).join(" ") || `<span class="via">${esc(gov(v2.b))}</span>`}</p>${evLink(c.id)}</div></li>`; }).join("")}</ul>` : ""}
        ${occ.length ? `<div class="sec">Occupied territory</div><ul class="inv">${occ.map((o) => invRow({ i: "occupy", red: true, text: o.title, sub: "", right: o.to === 9999 ? "since " + o.from : span(o.from, o.to) }, `data-open-occ="${o.id}"`)).join("")}</ul>` : ""}
        ${changed.length ? `<div class="sec">New borders or states</div><div class="chips-row">${changed.map((f) => chip(f.g, y)).join(" ")}</div>` : ""}
        ${pa.length ? `<div class="sec">Peace agreements</div><ul class="inv">${pa.map((p) => invRow({ i: "peace", text: p.name, sub: fmtDate(p.date) }, conflicts[p.conflict] ? `data-open-conflict="${p.conflict}"` : "disabled")).join("")}</ul>` : ""}`;
    }
    if (v.kind === "occupation") {
      const o = occs.find((x) => x.id === v.id); k = "Occupied territory";
      h = `<h2>${esc(o.title)}</h2><div class="chips-row">${chip(o.by, y, "red")}${o.hatch_gw !== o.by ? chip(o.hatch_gw, y) : ""}</div><div class="prose">${o.notes.map((f) => `<p>${linkify(esc(f.t), y)}${cc.c(f.c)}</p>`).join("")}</div>`;
    }
    if (v.kind === "group") {
      const g = groups.find((x) => x.t === v.t && x.id === v.id); k = events.types[v.t];
      h = g ? `<h2>${esc(g.name.replace(/Government of /g, ""))}</h2><p class="sub">Recorded ${span(g.y0, g.y1)} in ${esc(g.countries.join(", "))}.${cc.c(["data-ged"])}</p>
        <div class="figs"><div><b>${fmt(g.best)}</b><span>deaths recorded</span></div><div><b>${fmt(g.low)}–${fmt(g.high)}</b><span>range</span></div><div><b>${fmt(g.n)}</b><span>events</span></div></div>` : "";
    }
    $("#sheetKicker").textContent = k;
    body.innerHTML = h + cc.list() + `<div class="end"></div>`;
    watchParts();
  }

  // country names in written text become taps
  const NAME_GW = [["Saudi Arabia", 670], ["United States", 2], ["United Kingdom", 200], ["Britain", 200], ["Soviet Union", 365], ["USSR", 365], ["Russia", 365],
    ["Israel", 666], ["Egypt", 651], ["Syria", 652], ["Jordan", 663], ["Lebanon", 660], ["Iraq", 645], ["Iran", 630], ["Kuwait", 690], ["Turkey", 640],
    ["Libya", 620], ["Algeria", 615], ["Morocco", 600], ["Tunisia", 616], ["Sudan", 625], ["France", 220], ["Qatar", 694], ["Bahrain", 692], ["Oman", 698],
    ["United Arab Emirates", 696], ["Yemen", 678], ["Cyprus", 352], ["Pakistan", 770], ["Afghanistan", 700], ["China", 710], ["India", 750], ["Germany", 255]]
    .filter(([, g]) => countries[g]);
  const NAME_RE = new RegExp("\\b(" + NAME_GW.map(([n]) => n.replace(/ /g, "\\s")).join("|") + ")\\b(?!\\s(?:River|Valley|Canal|Gulf))", "g");
  const NAME_MAP = new Map(NAME_GW.map(([n, g]) => [n, g]));
  function linkify(html, y) { const seen = new Set();
    return html.replace(NAME_RE, (m) => { const g = NAME_MAP.get(m.replace(/\s/g, " ")); if (g == null || seen.has(g)) return m; seen.add(g); return `<button class="tx" data-open-country="${g}">${m}</button>`; }); }

  function conflictHTML(c, y, cc) {
    const ny = nearestYear(c, y), yy = c.years[ny], ys = Object.keys(c.years).map(Number), g = goalOf(c);
    const all = []; for (let i = c.first; i <= c.last; i++) all.push(i);
    const dY = ys.filter((i) => c.years[i].best != null), tot = (key) => dY.reduce((s, i) => s + c.years[i][key], 0);
    const backers = links.filter((L) => String(L.c) === String(c.id) && L.y === ny && (L.t === "back" || L.t === "rebels"));
    const backA = [...new Set(backers.filter((L) => yy.ga.includes(L.b) && L.t === "back").map((L) => L.a))], backB = [...new Set(backers.filter((L) => !(yy.ga.includes(L.b) && L.t === "back")).map((L) => L.a))];
    const pas = peace.filter((p) => p.conflict === c.id), s = storyFor(c, y);
    const side = (lead, prim, sec, back, red) => `<div class="${red ? "b" : ""}"><small>${red ? "Side B" : "Side A"}</small>
      <div class="chips-row">${[...new Set(prim)].map((gw) => chip(gw, ny, red ? "red" : "white")).join("") || `<b>${esc(gov(lead))}</b>`}</div>
      ${sec.length ? `<em>${icon("troops")}<span>Troops from</span></em><div class="chips-row">${[...new Set(sec)].map((gw) => chip(gw, ny)).join("")}</div>` : ""}
      ${back.length ? `<em>${icon("support")}<span>Backed by</span></em><div class="chips-row">${back.map((gw) => chip(gw, ny)).join("")}</div>` : ""}</div>`;
    let h = `<h2>${esc(vsName(c) || conflictName(c))}</h2>
      <p class="sub">${vsName(c) ? `Recorded as “${esc(conflictName(c))}”. ` : ""}Fighting recorded in ${ys.length} year${ys.length > 1 ? "s" : ""} between ${c.first} and ${c.last}.${cc.c(["data-acd"])}</p>
      <div class="roles"><span class="role">${icon(g.i)}${esc(g.t)}</span>${yy.int === 2 ? `<span class="role red">${icon("fight")}War level in ${ny}</span>` : `<span class="role">${icon("fight")}Smaller conflict in ${ny}</span>`}${s ? `<button class="role red" data-jump=".chapter">${icon("book")}Read the story</button>` : ""}</div>
      ${ny !== y ? `<p class="note">No fighting recorded in ${y}. Showing ${ny}. <a href="#" data-year="${ny}">Go to ${ny}</a></p>` : ""}
      <div class="sec">Who fought in ${ny}</div>
      <div class="vs">${side(yy.a, yy.pa.length ? yy.pa : [], yy.sa, backA, false)}${side(yy.b, yy.pb, yy.sb, backB, true)}</div>
      ${!yy.pb.length ? `<p class="fine" style="margin-top:8px">Side B: ${esc(gov(yy.b))}</p>` : ""}
      <div class="sec">How deadly</div>
      <div class="figs"><div><b class="${yy.int === 2 ? "red" : ""}">${yy.int === 2 ? "War" : "Minor"}</b><span>${yy.int === 2 ? "1,000+" : "25–999"} battle deaths in ${ny}</span></div>
        <div><b>${yy.best != null ? fmt(yy.best) : "–"}</b><span>${yy.best != null ? `deaths in ${ny}, range ${fmt(yy.low)}–${fmt(yy.high)}` : "yearly counts start in 1989"}</span></div>
        <div><b>${dY.length ? fmt(tot("best")) : "–"}</b><span>${dY.length ? `deaths ${dY[0]}–${dY[dY.length - 1]}` : "total since 1989"}</span></div></div>
      <div class="bars" role="img" aria-label="Fighting by year">${all.map((i) => { const q = c.years[i]; return `<i data-year="${i}" class="${q && q.int === 2 ? "war" : ""} ${i === y ? "now" : ""}" style="height:${q ? (q.int === 2 ? 100 : 35) : 4}%" title="${i}"></i>`; }).join("")}</div>
      <div class="axis"><span>${c.first}</span><span>tap a bar to jump</span><span>${c.last}</span></div>
      ${(ny < ESD[0] || ny > ESD[1]) ? `<p class="fine" style="margin-top:14px">Foreign backing is recorded for 1975–2017.</p>` : ""}
      ${pas.length ? `<div class="sec">Peace agreements</div><ul class="support">${pas.map((p) => `<li>${icon("peace")}<span><b>${esc(p.name)}</b>, ${esc(fmtDate(p.date))}${cc.c(["data-pa"])}${p.text_url ? ` <a href="${esc(p.text_url)}" target="_blank" rel="noopener">Read it</a>` : ""}</span></li>`).join("")}</ul>` : ""}`;
    if (s) {
      const Z = desktop() ? { close: 4.3, region: 3.6, world: 1.6 } : { close: 4.0, region: 3.2, world: 1.2 };
      const part = (title, yr, z, inner, center) => `<div class="part" data-y="${yr}" data-z="${z}" data-c="${(center || s.focus).join(",")}"><h4>${esc(title)}<small>${yr}</small></h4>${inner}</div>`;
      const ps = (arr, yr) => `<div class="prose">${arr.map((f) => `<p>${linkify(esc(f.t), yr)}${cc.c(f.c)}</p>`).join("")}</div>`;
      h += `<div class="chapter part" data-y="${s.years.intro}" data-z="${Z.region}" data-c="${s.focus.join(",")}">
        <div class="chapter-top">${icon("book")}The story · ${span(s.start, s.end)}</div>
        <h3>${esc(s.title)}</h3>
        <div class="names">${s.names.map((n) => `<div>${esc(n.name)}<span>${esc(n.used_by)}</span></div>`).join("")}</div>
        <div class="prose"><p class="lede">${linkify(esc(s.summary), s.years.intro)}</p></div>
        <p class="fine">Keep scrolling: the globe follows the story. Tap an underlined country to see all its connections.</p></div>
        ${part("How it started", s.years.background, Z.close, ps(s.background, s.years.background))}
        ${part("What happened", s.years.course, Z.close, ps(s.course, s.years.course))}
        ${part("How it ended", s.years.outcome, Z.close, ps(s.outcome, s.years.outcome))}
        ${part("What it changed in the region", s.years.effects, Z.region, ps(s.effects_region, s.years.effects))}
        ${part("What it changed in the world", s.years.effects, Z.world, ps(s.effects_world, s.years.effects), [30, 30])}
        ${part("Where historians disagree", s.years.intro, Z.region, s.debates.map((d) => `<p class="debate-q">${esc(d.q)}</p><ul class="views">${d.views.map((x) => `<li>${linkify(esc(x.t), s.years.intro)}${cc.c(x.c)}</li>`).join("")}</ul>`).join(""))}
        <div class="sec">Original documents</div><ul class="support">${s.primary.map((k2) => `<li>${icon("peace")}<span><a href="${esc(SRC[k2].url)}" target="_blank" rel="noopener">${esc(SRC[k2].cite)}</a></span></li>`).join("")}</ul>`;
    }
    return h;
  }

  // scrolling through a story moves the globe through time
  function watchParts() {
    if (observer) observer.disconnect();
    const parts = body.querySelectorAll(".part[data-y]"); if (!parts.length) return;
    let last = null;
    observer = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!vis || vis.target === last) return; last = vis.target;
      const d = vis.target.dataset, y = +d.y;
      if (y !== state.year) setYear(y, { keepSheet: true });
      fly(d.c.split(",").map(Number), +d.z, 1600);
    }, { root: body, rootMargin: "0px 0px -55% 0px", threshold: 0 });
    parts.forEach((p) => observer.observe(p));
  }

  body.addEventListener("click", (e) => {
    const strip = e.target.closest("[data-strip]");
    if (strip) { const r = strip.getBoundingClientRect(), f = (e.clientX - r.left) / r.width; setYear(ACD_START + Math.floor(f * (LAST - ACD_START + 1))); return; }
    const b = e.target.closest("[data-open-conflict],[data-open-country],[data-open-occ],[data-story],[data-year],[data-src],[data-jump]");
    if (!b || b.disabled) return;
    if (b.tagName === "A" && b.target === "_blank") return;
    e.preventDefault();
    if (b.dataset.src) { const el = body.querySelector("#sources"); if (el) body.scrollTo({ top: el.offsetTop - 8, behavior: reduceMotion ? "auto" : "smooth" }); return; }
    if (b.dataset.jump) { const el = body.querySelector(b.dataset.jump); if (el) { body.scrollTo({ top: el.offsetTop - 8, behavior: reduceMotion ? "auto" : "smooth" }); } return; }
    if (b.dataset.story) return openStory(stories.find((s) => s.id === b.dataset.story));
    if (b.dataset.openConflict) { const c = conflicts[b.dataset.openConflict]; if (c && !c.years[state.year]) setYear(nearestYear(c, state.year), { keepSheet: true }); return openView({ kind: "conflict", id: b.dataset.openConflict }); }
    if (b.dataset.openCountry) return openView({ kind: "country", gw: +b.dataset.openCountry });
    if (b.dataset.openOcc) return openView({ kind: "occupation", id: b.dataset.openOcc });
    if (b.dataset.year) setYear(+b.dataset.year);
  });

  // ------------------------------------------------------------------ touching the globe: find the dot under the finger
  const tip = $("#tip");
  function dotAt(pt, r = 14) {
    const fs = map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]], { layers: DOT_LAYERS.filter((id) => map.getLayer(id)) });
    let best = null, bd = 1e9;
    for (const f of fs) { const p = map.project(f.geometry.coordinates), d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2; if (d < bd) { bd = d; best = f; } }
    if (!best) return null;
    const { h, f } = best.properties, gw = gwAt(h, borderYear(state.year));
    return gw < 0 ? null : { gw, h, f, occ: state.layers.occupation ? occupiedAt(h, f, state.year) : null };
  }
  if (canHover) {
    let hRaf = 0;
    map.on("mousemove", (e) => { cancelAnimationFrame(hRaf); hRaf = requestAnimationFrame(() => {
      const ev = map.queryRenderedFeatures(e.point, { layers: ["events"] })[0], d = ev ? null : dotAt(e.point, 9);
      map.getCanvas().style.cursor = ev || d ? "pointer" : "";
      const hv = d ? d.gw : null; if (hv !== state.hover) { state.hover = hv; paintDots(); }
      let h = "";
      if (ev) { const p = ev.properties; h = `<b>${esc(events.types[p.t])}</b><br>${fmt(p.b)} deaths in ${state.year} (range ${fmt(p.lo)}–${fmt(p.hi)})`; }
      else if (d) { const f = factsOf(d.gw, state.year).filter((x) => x.partners.size); h = `<b>${esc(nameOf(d.gw, state.year))}</b>${d.occ ? "<br>Occupied territory" : ""}${f.slice(0, 3).map((x) => "<br>" + esc(x.verb + " " + [...x.partners].map((g) => nameOf(g, state.year)).join(", "))).join("")}`; }
      if (h) { tip.innerHTML = h; tip.hidden = false; tip.style.left = Math.min(e.originalEvent.clientX + 14, innerWidth - 270) + "px"; tip.style.top = e.originalEvent.clientY + 14 + "px"; } else tip.hidden = true;
    }); });
    map.on("mouseout", () => { tip.hidden = true; if (state.hover != null) { state.hover = null; paintDots(); } });
  }
  map.on("click", (e) => {
    tip.hidden = true; if (!$("#keyPanel").hidden) return closeKey();
    // a tap on the globe always means "this country"; the fighting circles only show figures on hover
    const d = dotAt(e.point);
    if (!d) return;
    if (d.occ && state.focus !== 666) return openView({ kind: "occupation", id: d.occ.id });
    openView({ kind: "country", gw: d.gw });
  });

  // ------------------------------------------------------------------ key popover
  const keyPanel = $("#keyPanel"), keyBtn = $("#layersBtn");
  const closeKey = () => { keyPanel.hidden = true; keyBtn.setAttribute("aria-expanded", "false"); };
  keyBtn.addEventListener("click", () => { keyPanel.hidden = !keyPanel.hidden; keyBtn.setAttribute("aria-expanded", String(!keyPanel.hidden)); });
  keyPanel.addEventListener("change", (e) => { const k = e.target.dataset.layer; if (k) { state.layers[k] = e.target.checked; renderMap(); } });

  // ------------------------------------------------------------------ search
  const sModal = $("#searchModal"), sInput = $("#searchInput"), sList = $("#searchResults");
  const index = [
    ...stories.map((s) => ({ kind: "Story", ic: "book", label: s.title, sub: s.names.map((n) => n.name).join(" / "), terms: [s.title, ...s.names.map((n) => n.name), ...Array.from({ length: s.end - s.start + 1 }, (_, i) => String(s.start + i))].join(" ").toLowerCase(), go: () => openStory(s) })),
    ...occs.map((o) => ({ kind: "Occupation", ic: "occupy", label: o.title, sub: o.labels.map((l) => l.n).join(", "), terms: (o.title + " " + o.labels.map((l) => l.n).join(" ")).toLowerCase(), go: () => { setYear(o.from, { keepSheet: true }); openView({ kind: "occupation", id: o.id }, { push: false }); } })),
    ...Object.values(conflicts).map((c) => ({ kind: "Conflict", ic: goalOf(c).i, label: conflictName(c), sub: span(c.first, c.last), terms: (conflictName(c) + " " + c.location).toLowerCase(), go: () => { if (!c.years[state.year]) setYear(c.first, { keepSheet: true }); openView({ kind: "conflict", id: String(c.id) }, { push: false }); } })),
    ...Object.entries(countries).flatMap(([gw, c]) => { const names = new Set([countryName(c.n, 1900), countryName(c.n, 2000)]); const from = Math.floor(Math.min(...c.periods.map((p) => p[0]))), to = Math.max(...c.periods.map((p) => p[1]));
      return [...names].map((n) => ({ kind: "Country", ic: "territory", label: n, sub: from + "–" + (to === 9999 ? "today" : Math.floor(to)) + (byGw.has(+gw) ? " · " + new Set(linksOf(+gw).map((L) => (L.a === +gw ? L.b : L.a))).size + " connections" : ""), terms: n.toLowerCase(), go: () => { if (state.year < from || state.year >= to) setYear(from, { keepSheet: true }); openView({ kind: "country", gw: +gw }, { push: false }); } })); }),
  ];
  let res = [], si = 0;
  function runSearch() { const q = sInput.value.trim().toLowerCase();
    res = !q ? index.filter((i) => i.kind === "Story") : index.map((i) => ({ i, s: i.terms.startsWith(q) ? 3 : i.terms.includes(" " + q) ? 2 : i.terms.includes(q) ? 1 : 0 })).filter((x) => x.s).sort((a, b) => b.s - a.s || (a.i.kind === "Story" ? -1 : b.i.kind === "Story" ? 1 : 0) || a.i.label.length - b.i.label.length).slice(0, 10).map((x) => x.i);
    si = 0; paint(); }
  const paint = () => { sList.innerHTML = res.length ? res.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === si}">${icon(r.ic)}<span><b>${esc(r.label)}</b><br><span class="fine">${esc(r.sub)}</span></span><span class="k">${r.kind}</span></li>`).join("") : `<li class="fine">Nothing found. Try a country, a war, or a year such as 1973.</li>`; };
  const openSearch = () => { sModal.hidden = false; sInput.value = ""; runSearch(); setTimeout(() => sInput.focus(), 0); };
  const closeSearch = () => { sModal.hidden = true; };
  $("#searchBtn").addEventListener("click", openSearch);
  sInput.addEventListener("input", runSearch);
  sInput.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); si = Math.min(res.length - 1, si + 1); paint(); } if (e.key === "ArrowUp") { e.preventDefault(); si = Math.max(0, si - 1); paint(); } if (e.key === "Enter" && res[si]) { const r = res[si]; closeSearch(); r.go(); } });
  sList.addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) { const r = res[+li.dataset.i]; closeSearch(); r.go(); } });
  sModal.addEventListener("click", (e) => { if (e.target === sModal) closeSearch(); });

  // ------------------------------------------------------------------ share + hash
  function writeHash() { const v = state.stack[state.stack.length - 1]; const t = "y" + state.year + (v?.kind === "conflict" ? "-c" + v.id : v?.kind === "country" ? "-k" + v.gw : "");
    try { history.replaceState(null, "", "#" + t); } catch (e) { /* not allowed in this viewer */ } }
  const toast = $("#toast"); let tT = 0;
  const say = (h) => { toast.innerHTML = h; toast.hidden = false; clearTimeout(tT); tT = setTimeout(() => { toast.hidden = true; }, 3000); };
  $("#shareBtn").addEventListener("click", () => { writeHash(); const url = location.href; try { navigator.clipboard.writeText(url).then(() => say("Link copied"), () => say("Copy this link: <code>" + esc(url) + "</code>")); } catch (e) { say("Copy this link: <code>" + esc(url) + "</code>"); } });

  // ------------------------------------------------------------------ keyboard
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName) && !["range", "checkbox"].includes(document.activeElement.type);
    if (e.key === "Escape") { if (!sModal.hidden) return closeSearch(); if (!keyPanel.hidden) return closeKey(); if (state.stack.length > 1) return $("#sheetBack").click(); if (state.stack.length) return closeSheet(); }
    if (typing) return;
    if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); return openSearch(); }
    if (document.activeElement === range) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setYear(state.year + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 1)); }
    if (e.key === " " && !/BUTTON|A|SUMMARY/.test(document.activeElement?.tagName)) { e.preventDefault(); togglePlay(); }
  });

  // ------------------------------------------------------------------ start
  const m = location.hash.slice(1).match(/^y(\d{4})(?:-(c|k)(\d+))?$/);
  setYear(m ? +m[1] : LAST, { keepSheet: true });
  requestAnimationFrame(drawSpark);
  if (m && m[2] === "c" && conflicts[m[3]]) openView({ kind: "conflict", id: m[3] }, { push: false });
  else if (m && m[2] === "k" && countries[m[3]]) openView({ kind: "country", gw: +m[3] }, { push: false });
  else fly([41, 29], desktop() ? 3.0 : 2.3, 2800);
  window.__atlas = { map, state, setYear, openView, openStory, closeSheet, links, factsOf, arcs: () => arcs };
})();
