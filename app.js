/* Atlas of Change: a globe you touch to learn. Pilot region: the Middle East.
   One sheet holds the timeline and everything you tap, as one continuous scroll.
   Data: app/data/*.json (scripts/build_data.py, content/narratives.py). */
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
  const C = { ink: "#F2F0EB", red: "#E03A2F", sea: "#080808" };

  // ------------------------------------------------------------------ data
  const load = (f) => fetch("data/" + f).then((r) => { if (!r.ok) throw new Error(f + " (" + r.status + ")"); return r.json(); });
  let borders, countries, cdata, events, support, peace, meta, S;
  try {
    [borders, countries, cdata, events, support, peace, meta, S] = await Promise.all(
      ["borders.geojson", "countries.json", "conflicts.json", "events.json", "support.json", "peace.json", "meta.json", "stories.json"].map(load));
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
      "Italy/Sardinia": "Italy", "Rumania": "Romania", "Korea, Republic of": "South Korea", "Korea, People's Republic of": "North Korea" };
    return r[n] || n;
  }
  const nameOf = (gw, y) => { const f = visibleFeatures(y).find((x) => x.properties.g === gw); return countryName(f?.properties.n || countries[gw]?.n || "", y); };
  const conflictName = (c) => c.name.replace("Yemen (North Yemen)", "Yemen").replace("Israel: Israel", "Mandate Palestine: Jewish insurgency");
  const gov = (s) => (s || "").replace(/Government of /g, "").replace("Yemen (North Yemen)", "Yemen").replace("Russia (Soviet Union)", "Russia");
  const span = (a, b) => (a === b ? String(a) : a + "–" + b);
  const goalOf = (c) => c.incomp === "Territory" ? { i: "territory", t: "Fought over territory" } : c.incomp === "Government" ? { i: "government", t: "Fought over who governs" } : { i: "territory", t: "Fought over territory and government" };

  // ------------------------------------------------------------------ state + helpers
  const state = { year: LAST, stack: [], sel: null, playing: null, layers: { events1: true, events3: false, occupation: true } };
  const activeConflicts = (y) => Object.values(conflicts).filter((c) => c.years[y]).sort((p, q) => q.years[y].int - p.years[y].int || conflictName(p).localeCompare(conflictName(q)));
  const nearestYear = (c, y) => (c.years[y] ? y : Object.keys(c.years).map(Number).reduce((b, v) => (Math.abs(v - y) < Math.abs(b - y) ? v : b)));
  const borderYear = (y) => Math.min(y, BORDERS_END) + 0.5;
  const bordersFilter = (y) => ["all", ["<=", ["get", "s"], borderYear(y)], [">", ["get", "e"], borderYear(y)]];
  const featCache = new Map();
  const visibleFeatures = (y) => { const k = borderYear(y); if (!featCache.has(k)) featCache.set(k, borders.features.filter((f) => f.properties.s <= k && f.properties.e > k)); return featCache.get(k); };
  const activeOccs = (y) => occs.filter((o) => y >= o.from && y <= o.to);
  const preWarIsrael = borders.features.find((f) => f.properties.g === 666 && f.properties.s < 1967.4)?.id;
  const capital = (gw) => { const c = countries[gw]; return c && c.cx != null ? [c.cx, c.cy] : null; };
  const storyFor = (c, y) => { const list = stories.filter((s) => s.conflicts.includes(c.id)); return list.find((s) => y >= s.start && y <= s.end) || list.sort((a, b) => Math.abs(a.start - y) - Math.abs(b.start - y))[0]; };
  const involves = (c, gw) => c.loc.includes(gw) || Object.values(c.years).some((v) => v.ga.includes(gw) || v.gb.includes(gw));

  // roles of a country in a year: the icon language
  function rolesOf(gw, y) {
    const out = [];
    for (const c of activeConflicts(y)) {
      const v = c.years[y], war = v.int === 2;
      if (v.pa.includes(gw) || v.pb.includes(gw)) {
        const opp = v.pa.includes(gw) ? v.b : v.a;
        out.push({ i: "fight", red: war, short: war ? "At war" : "In armed conflict", text: `Fought ${gov(opp)}`, sub: conflictName(c) + (war ? ", war level" : ""), c: c.id });
      } else if (v.sa.includes(gw) || v.sb.includes(gw)) {
        const helped = v.sa.includes(gw) ? v.a : v.b;
        out.push({ i: "troops", short: "Sent troops", text: `Sent troops to help ${gov(helped)}`, sub: conflictName(c), c: c.id });
      } else if (c.loc.includes(gw)) {
        out.push({ i: "fight", red: war, short: war ? "War on its soil" : "Fighting on its soil", text: `Fighting on its territory`, sub: conflictName(c), c: c.id });
      }
    }
    const backed = {};
    for (const L of support.links) if (L.supporter_gw === gw && L.state && L.years.includes(y)) (backed[L.recipient + "|" + L.conflict] = L);
    for (const L of Object.values(backed)) out.push({ i: "support", short: "Backed a side", text: `Backed ${gov(L.recipient)}`, sub: conflictName(conflicts[L.conflict] || { name: L.conflict_name }), c: L.conflict });
    for (const o of activeOccs(y)) {
      if (o.by === gw) out.push({ i: "occupy", red: true, short: "Occupying land", text: o.title, sub: o.labels.filter((l) => y <= l.to).map((l) => l.n.split(",")[0]).join(", "), occ: o.id });
      else if (o.hatch_gw === gw) out.push({ i: "occupy", red: true, short: "Occupied", text: o.title, sub: "", occ: o.id });
    }
    if (y === 1967) for (const [g, n] of [[651, "Sinai and Gaza"], [652, "the Golan Heights"], [663, "the West Bank and East Jerusalem"]]) if (g === gw) out.push({ i: "lost", short: "Lost territory", text: `Lost control of ${n} to Israel`, sub: "June 1967 war", occ: "occ-1967" });
    for (const p of peace.filter((p) => p.year === y && conflicts[p.conflict] && involves(conflicts[p.conflict], gw))) out.push({ i: "peace", short: "Peace agreement", text: p.name, sub: "Peace agreement, " + p.date.slice(0, 10), c: p.conflict });
    return out;
  }

  // ------------------------------------------------------------------ map
  const map = new maplibregl.Map({
    container: "map",
    style: { version: 8, projection: { type: "globe" }, sources: {}, layers: [{ id: "sea", type: "background", paint: { "background-color": C.sea } }],
      sky: { "sky-color": "#000000", "horizon-color": "#cfcdc6", "fog-color": "#000000", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.85, "fog-ground-blend": 1,
             "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.45, 4, 0.25, 7, 0] } },
    center: [20, 22], zoom: desktop() ? 1.5 : 0.9, attributionControl: false, renderWorldCopies: false, maxZoom: 8, fadeDuration: 0,
  });
  map.touchZoomRotate.disableRotation();
  await new Promise((res) => map.on("load", res));

  function addPattern(name, size, draw) { const cv = document.createElement("canvas"); cv.width = cv.height = size * 2; const x = cv.getContext("2d"); x.scale(2, 2); draw(x, size); map.addImage(name, x.getImageData(0, 0, size * 2, size * 2), { pixelRatio: 2 }); }
  const dots = (color, r) => (x, s) => { x.fillStyle = color; x.beginPath(); x.arc(s / 2, s / 2, r, 0, Math.PI * 2); x.fill(); };
  addPattern("d-land", 4, dots("rgba(242,240,235,0.55)", 0.6));
  addPattern("d-minor", 4, dots("rgba(224,58,47,0.95)", 0.7));
  addPattern("d-war", 3, dots("rgba(238,72,60,1)", 0.75));
  addPattern("d-a", 3, dots("rgba(242,240,235,1)", 0.7));
  addPattern("d-b", 3, dots("rgba(238,72,60,1)", 0.75));
  addPattern("hatch", 5, (x, s) => { x.strokeStyle = "rgba(238,90,80,0.95)"; x.lineWidth = 0.85; for (const o of [-s, 0, s]) { x.beginPath(); x.moveTo(o, s); x.lineTo(o + s, 0); x.stroke(); } });
  const grat = [];
  for (let lon = -180; lon < 180; lon += 15) { const c = []; for (let lat = -80; lat <= 80; lat += 2.5) c.push([lon, lat]); grat.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } }); }
  for (let lat = -75; lat <= 75; lat += 15) { const c = []; for (let lon = -180; lon <= 180; lon += 2.5) c.push([lon, lat]); grat.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } }); }
  const empty = { type: "FeatureCollection", features: [] }, NONE = ["==", ["id"], -1];
  map.addSource("grat", { type: "geojson", data: { type: "FeatureCollection", features: grat } });
  map.addSource("borders", { type: "geojson", data: borders });
  map.addSource("events", { type: "geojson", data: empty });
  map.addSource("arcs", { type: "geojson", data: empty, lineMetrics: true });
  map.addLayer({ id: "grat", type: "line", source: "grat", paint: { "line-color": "rgba(242,240,235,0.04)", "line-width": 0.5 } });
  map.addLayer({ id: "land", type: "fill", source: "borders", filter: bordersFilter(state.year), paint: { "fill-pattern": "d-land" } });
  map.addLayer({ id: "wash", type: "fill", source: "borders", filter: NONE, paint: { "fill-color": C.red, "fill-opacity": 0.07 } });
  map.addLayer({ id: "occ-hatch", type: "fill", source: "borders", filter: NONE, paint: { "fill-pattern": "hatch" } });
  map.addLayer({ id: "occ-mask", type: "fill", source: "borders", filter: NONE, paint: { "fill-color": C.sea } });
  map.addLayer({ id: "occ-mask-dots", type: "fill", source: "borders", filter: NONE, paint: { "fill-pattern": "d-land" } });
  map.addLayer({ id: "edges", type: "line", source: "borders", filter: bordersFilter(state.year), paint: { "line-color": "rgba(242,240,235,0.19)", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.3, 5, 0.7, 8, 1.1] } });
  map.addLayer({ id: "green-line", type: "line", source: "borders", filter: NONE, paint: { "line-color": "rgba(242,240,235,0.85)", "line-width": 0.9, "line-dasharray": [2.5, 2] } });
  map.addLayer({ id: "war-glow", type: "line", source: "borders", filter: NONE, paint: { "line-color": C.red, "line-width": 10, "line-blur": 10, "line-opacity": 0.26 } });
  map.addLayer({ id: "war-edge", type: "line", source: "borders", filter: NONE, paint: { "line-color": "rgba(238,90,80,0.75)", "line-width": 0.7 } });
  map.addLayer({ id: "side-edge", type: "line", source: "borders", filter: NONE, paint: { "line-color": "rgba(242,240,235,0.9)", "line-width": 0.9 } });
  map.addLayer({ id: "focus", type: "line", source: "borders", filter: NONE, paint: { "line-color": C.ink, "line-width": 1.6 } });
  map.addLayer({ id: "hover", type: "line", source: "borders", filter: NONE, paint: { "line-color": "rgba(242,240,235,0.7)", "line-width": 1.1 } });
  map.addLayer({ id: "events", type: "circle", source: "events", paint: {
    "circle-color": ["match", ["get", "t"], 3, "#F2C25A", "#FF4A3D"], "circle-opacity": 0.5, "circle-blur": 0.5,
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, ["min", 7, ["*", 0.22, ["max", 4, ["sqrt", ["get", "b"]]]]], 5, ["min", 14, ["*", 0.45, ["max", 4, ["sqrt", ["get", "b"]]]]], 8, ["min", 28, ["*", 0.9, ["max", 4, ["sqrt", ["get", "b"]]]]]] } });
  for (const [id, col] of [["arcs-a", "242,240,235"], ["arcs-b", "238,72,60"]]) map.addLayer({ id, type: "line", source: "arcs", filter: ["==", ["get", "side"], id.slice(-1)], layout: { "line-cap": "round" },
    paint: { "line-width": 0.9, "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, `rgba(${col},0)`, 0.5, `rgba(${col},0.18)`, 1, `rgba(${col},0.7)`] } });

  const inList = (l) => ["in", ["get", "g"], ["literal", l.length ? l : [-1]]];
  const matchExpr = (groups, fb) => { const p = []; for (const [l, v] of groups) if (l.length) p.push(l, v); return p.length ? ["match", ["get", "g"], ...p, fb] : fb; };
  function greatCircle(a, b, n = 64) {
    const r = Math.PI / 180, v3 = ([lo, la]) => [Math.cos(la * r) * Math.cos(lo * r), Math.cos(la * r) * Math.sin(lo * r), Math.sin(la * r)];
    const A = v3(a), B = v3(b), d = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])); if (d < 1e-6) return [a, b];
    const pts = []; for (let i = 0; i <= n; i++) { const t = i / n, s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d), v = [s1 * A[0] + s2 * B[0], s1 * A[1] + s2 * B[1], s1 * A[2] + s2 * B[2]]; pts.push([Math.atan2(v[1], v[0]) / r, Math.atan2(v[2], Math.hypot(v[0], v[1])) / r]); }
    return pts;
  }
  const sideOfRecipient = (yy, r) => (yy.a.includes(r) || r.includes(yy.a) ? "a" : "b");

  function renderMap() {
    const y = state.year, f = bordersFilter(y), sel = state.sel ? conflicts[state.sel] : null;
    map.setFilter("land", f); map.setFilter("edges", f);
    const war = [], minor = [];
    let A = [], B = [];
    if (sel) { const yy = sel.years[nearestYear(sel, y)]; A = [...new Set(yy.ga)]; B = [...new Set(yy.gb)].filter((g) => !A.includes(g)); }
    else { const inten = {}; for (const c of activeConflicts(y)) for (const g of c.loc) inten[g] = Math.max(inten[g] || 0, c.years[y].int); for (const [g, i] of Object.entries(inten)) (i === 2 ? war : minor).push(+g); }
    const pat = matchExpr([[A, "d-a"], [B, "d-b"], [war, "d-war"], [minor, "d-minor"]], "d-land");
    map.setPaintProperty("land", "fill-pattern", pat); map.setPaintProperty("occ-mask-dots", "fill-pattern", pat);
    map.setFilter("wash", ["all", f, inList([...war, ...B])]); map.setFilter("war-glow", ["all", f, inList([...war, ...B])]);
    map.setFilter("war-edge", ["all", f, inList([...war, ...minor, ...B])]); map.setFilter("side-edge", ["all", f, inList(A)]);
    const top = state.stack[state.stack.length - 1];
    map.setFilter("focus", top?.kind === "country" ? ["all", f, ["==", ["get", "g"], top.gw]] : NONE);
    const occ = state.layers.occupation ? activeOccs(y) : [];
    map.setFilter("occ-hatch", occ.length ? ["all", f, inList(occ.map((o) => o.hatch_gw))] : NONE);
    const has67 = occ.some((o) => o.id === "occ-1967") && preWarIsrael != null;
    map.setFilter("occ-mask", has67 ? ["==", ["id"], preWarIsrael] : NONE); map.setFilter("occ-mask-dots", has67 ? ["==", ["id"], preWarIsrael] : NONE);
    map.setFilter("green-line", has67 ? ["in", ["get", "g"], ["literal", [6631, 6511]]] : NONE);
    const want = { 1: state.layers.events1, 2: false, 3: state.layers.events3 };
    map.getSource("events").setData({ type: "FeatureCollection", features: (evByYear.get(y) || []).filter((r) => want[r[1]] && (!sel || r[4] === sel.id || r[1] !== 1))
      .map((r) => ({ type: "Feature", geometry: { type: "Point", coordinates: [r[2], r[3]] }, properties: { t: r[1], b: r[5], lo: r[6], hi: r[7], c: r[4] } })) });
    const arcs = [];
    if (sel) { const yy = sel.years[nearestYear(sel, y)];
      for (const L of support.links) { if (!L.state || L.supporter_gw == null || L.conflict !== sel.id || !L.years.includes(y)) continue;
        const a = capital(L.supporter_gw), b = capital(L.to_gw); if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
        arcs.push({ type: "Feature", geometry: { type: "LineString", coordinates: greatCircle(a, b) }, properties: { side: sideOfRecipient(yy, L.recipient) } }); } }
    map.getSource("arcs").setData({ type: "FeatureCollection", features: arcs });
    renderMarkers();
  }

  // ------------------------------------------------------------------ markers: role icons, war pins, labels
  let markers = [];
  function addMarker(el, lngLat, anchor = "center", offset = [0, 0]) { markers.push(new maplibregl.Marker({ element: el, anchor, offset }).setLngLat(lngLat).addTo(map)); return el; }
  function renderMarkers() {
    markers.forEach((m) => m.remove()); markers = [];
    const y = state.year, sel = state.sel ? conflicts[state.sel] : null, used = new Set();
    // war pins for the written stories
    if (!sel) for (const s of stories) if (y >= s.start && y <= s.end) {
      const el = document.createElement("button"); el.className = "war-pin"; el.dataset.prio = 5;
      el.innerHTML = `${icon("book")}<span>${esc(s.title.replace(/^The /, ""))}</span><small>Read</small>`;
      el.setAttribute("aria-label", "Read: " + s.title);
      el.addEventListener("click", (e) => { e.stopPropagation(); openStory(s); });
      addMarker(el, s.focus, "center", [0, -54]);
    }
    const mk = (gw, ic, red, pulse, label, prio, onClick) => {
      const p = capital(gw); if (!p || used.has(gw)) return; used.add(gw);
      const el = document.createElement("button"); el.className = "mk" + (red ? " red" : "") + (pulse ? " pulse" : ""); el.dataset.prio = prio;
      el.innerHTML = icon(ic); el.setAttribute("aria-label", label); el.title = label;
      el.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
      addMarker(el, p);
    };
    if (sel) {
      const yy = sel.years[nearestYear(sel, y)];
      yy.pa.forEach((g) => mk(g, "fight", false, false, nameOf(g, y) + ": side A", 4, () => openView({ kind: "country", gw: g })));
      yy.pb.forEach((g) => mk(g, "fight", true, false, nameOf(g, y) + ": side B", 4, () => openView({ kind: "country", gw: g })));
      [...yy.sa, ...yy.sb].forEach((g) => mk(g, "troops", yy.sb.includes(g), false, nameOf(g, y) + ": sent troops", 3, () => openView({ kind: "country", gw: g })));
      for (const L of support.links) if (L.state && L.conflict === sel.id && L.years.includes(y) && L.supporter_gw != null) mk(L.supporter_gw, "support", sideOfRecipient(yy, L.recipient) === "b", false, nameOf(L.supporter_gw, y) + ": backed " + gov(L.recipient), 2, () => openView({ kind: "country", gw: L.supporter_gw }));
    } else {
      for (const c of activeConflicts(y)) if (c.years[y].int === 2) for (const g of c.loc) mk(g, "fight", true, true, nameOf(g, y) + ": war-level fighting", 4, () => openView({ kind: "country", gw: g }));
    }
    // labels
    const hot = new Set(activeConflicts(y).flatMap((c) => c.loc));
    const items = [];
    if (state.layers.occupation) for (const o of activeOccs(y)) for (const l of o.labels) if (y <= l.to) items.push({ n: l.n, p: [l.lon, l.lat], cls: "occ", prio: 1.5 });
    for (const f of visibleFeatures(y)) { const p = f.properties; if (p.cx == null || p.cx < ME_BOX[0] - 8 || p.cx > ME_BOX[2] + 6 || p.cy < ME_BOX[1] - 4 || p.cy > ME_BOX[3] + 4) continue;
      items.push({ n: countryName(p.n, y), p: [p.cx, p.cy], cls: hot.has(p.g) ? "hot" : "", prio: (hot.has(p.g) ? 1 : 0) + Math.min(0.9, (p.a || 0) / 2e6), offset: used.has(p.g) ? 18 : 4 }); }
    items.sort((a, b) => b.prio - a.prio);
    for (const it of items) { const el = document.createElement("div"); el.className = "label " + it.cls; el.textContent = it.n; el.dataset.prio = it.prio; addMarker(el, it.p, it.cls === "occ" ? "center" : "top", [0, it.offset || 0]); }
    declutter();
  }
  let dRaf = 0;
  function declutter() {
    cancelAnimationFrame(dRaf);
    dRaf = requestAnimationFrame(() => {
      const z = map.getZoom();
      const placed = [".topbar", ".yearbox", "#sheet", "#keyPanel"].map((s) => { const el = $(s); return el && !el.hidden ? el.getBoundingClientRect() : null; }).filter((r) => r && r.width);
      const sorted = [...markers].sort((a, b) => +b.getElement().dataset.prio - +a.getElement().dataset.prio);
      for (const m of sorted) {
        const el = m.getElement(), isLabel = el.classList.contains("label");
        if (isLabel && z < 3.0) { el.classList.add("dim"); continue; }
        el.classList.remove("dim");
        const r = el.getBoundingClientRect(), pad = isLabel ? 4 : 2;
        const hit = r.width === 0 || placed.some((q) => !(r.right + pad < q.left || r.left - pad > q.right || r.bottom + pad < q.top || r.top - pad > q.bottom));
        el.classList.toggle("dim", hit); if (!hit) placed.push(r);
      }
    });
  }
  map.on("moveend", declutter); map.on("idle", declutter);

  // ------------------------------------------------------------------ camera
  const pad = () => {
    const st = $("#sheet").dataset.state;
    if (desktop()) return { left: 60, right: st === "closed" ? 60 : 470, top: 150, bottom: st === "closed" ? 150 : 60 };
    return { left: 20, right: 20, top: 150, bottom: st === "closed" ? 170 : innerHeight * 0.52 };
  };
  const fly = (center, zoom, duration = 1700) => map.flyTo({ center, zoom, padding: pad(), duration: reduceMotion ? 0 : duration, curve: 1.35, essential: true });
  function flyToGw(gws, zoom) { const pts = gws.map(capital).filter(Boolean); if (pts.length) fly([pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length], zoom ?? Math.max(map.getZoom(), desktop() ? 4 : 3.4)); }

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
    state.playing = setInterval(() => { if (state.year >= LAST) stopPlay(); else setYear(state.year + 1); }, 650); }
  function stopPlay() { clearInterval(state.playing); state.playing = null; $("#playIcon").setAttribute("d", "M7 5v14l12-7z"); playBtn.setAttribute("aria-pressed", "false"); }
  playBtn.addEventListener("click", togglePlay);
  const yStats = []; for (let y = FIRST; y <= LAST; y++) { const a = activeConflicts(y); yStats.push({ n: a.length, war: a.some((c) => c.years[y].int === 2) }); }
  const maxN = Math.max(...yStats.map((s) => s.n), 1);
  function drawSpark() {
    const cv = $("#spark"), dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext("2d"); x.scale(dpr, dpr);
    const X = (y) => 8 + ((y - FIRST) / (LAST - FIRST)) * (w - 16), bw = Math.max(1, (w - 16) / (LAST - FIRST + 1) - 0.8);
    yStats.forEach((s, i) => { if (!s.n) return; const bh = Math.max(1.5, (s.n / maxN) * 10); x.fillStyle = s.war ? "rgba(224,58,47,.85)" : "rgba(242,240,235,.3)"; x.fillRect(X(FIRST + i) - bw / 2, 21 - bh, bw, bh); });
    for (const s of stories) { x.fillStyle = "#F06B60"; x.beginPath(); x.arc(X(s.start), 4, 2, 0, Math.PI * 2); x.fill(); }
    x.font = "400 10.5px Geist, -apple-system, sans-serif"; x.textAlign = "center"; x.fillStyle = "rgba(242,240,235,.36)";
    for (const y of [1900, 1925, 1950, 1975, 2000]) x.fillText(String(y), X(y), 46);
  }
  addEventListener("resize", () => { drawSpark(); declutter(); });

  // ------------------------------------------------------------------ the sheet: states and gestures
  const sheet = $("#sheet"), body = $("#sheetBody");
  const setState = (s) => { sheet.dataset.state = s; setTimeout(declutter, 520); };
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
    // grip, timeline background and header drag on all phones
    for (const el of [$("#grip"), $(".timeline"), $("#sheetHead")]) {
      el.addEventListener("touchstart", (e) => { if (desktop() || e.target.closest("input,button:not(#grip)")) return; begin(e.touches[0].clientY); }, { passive: true });
    }
    // swipe down at the top of the content closes or lowers the sheet; swipe up in peek expands it
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
  function openView(v, { push = true, scrollTo = null } = {}) {
    stopPlay();
    if (push) { const top = state.stack[state.stack.length - 1]; if (!top || JSON.stringify(top) !== JSON.stringify(v)) state.stack.push(v); } else state.stack = [v];
    state.sel = v.kind === "conflict" ? String(v.id) : null;
    if (sheet.dataset.state === "closed") setState(desktop() ? "full" : "peek");
    $("#sheetHead").hidden = false;
    renderSheet(); renderMap(); writeHash();
    body.scrollTop = 0;
    if (scrollTo) requestAnimationFrame(() => { const el = body.querySelector(scrollTo); if (el) body.scrollTop = el.offsetTop - 8; });
    if (v.kind === "conflict") flyToGw(conflicts[v.id].loc); else if (v.kind === "country") flyToGw([v.gw]);
    else if (v.kind === "occupation") flyToGw([occs.find((o) => o.id === v.id).hatch_gw]);
  }
  function openStory(s) { const c = conflicts[s.conflicts[0]]; if (state.year < s.start || state.year > s.end) setYear(s.years.intro, { keepSheet: true });
    openView({ kind: "conflict", id: String(c.id) }, { push: false, scrollTo: ".chapter" }); }
  function closeSheet() { state.stack = []; state.sel = null; setState("closed"); $("#sheetHead").hidden = true; body.innerHTML = ""; renderMap(); writeHash(); }
  $("#sheetClose").addEventListener("click", closeSheet);
  $("#sheetBack").addEventListener("click", () => { state.stack.pop(); const v = state.stack.pop(); if (v) openView(v); else closeSheet(); });
  $("#yearSum").addEventListener("click", () => openView({ kind: "year" }, { push: false }));

  // citations collected per view, listed once at the end
  function citer() { const order = []; return {
    c: (keys) => keys.length ? `<sup class="c">${keys.map((k) => { if (!order.includes(k)) order.push(k); return `<a href="#" data-src="1">${order.indexOf(k) + 1}</a>`; }).join(",")}</sup>` : "",
    list: () => order.length ? `<div class="sec" id="sources">Sources</div><ol class="srclist">${order.map((k, i) => { const s = SRC[k]; return s ? `<li><span class="n">${i + 1}</span><span><span class="tag t-${s.badge.toLowerCase()}">${s.badge === "PEER-REVIEWED" ? "Peer-reviewed" : s.badge === "ACADEMIC" ? "Academic book" : s.badge === "PRIMARY" ? "Original document" : s.badge === "REFERENCE" ? "Reference" : "Dataset"}</span>${esc(s.cite)}${s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">Open</a>` : ""}</span></li>` : ""; }).join("")}</ol>` : "" }; }
  const invRow = (r, attrs) => `<li><button ${attrs}><span class="badge ${r.red ? "red" : ""}">${icon(r.i)}</span><span class="t"><b>${esc(r.text)}</b><span>${esc(r.sub || "")}</span></span><span class="y">${esc(r.right || "")}</span></button></li>`;
  const rowAttrs = (r) => r.c != null ? `data-open-conflict="${r.c}"` : r.occ ? `data-open-occ="${r.occ}"` : "";
  function dateOf(dec) { const yr = Math.floor(dec), d = new Date(Date.UTC(yr, 0, 1) + (dec - yr) * 365.25 * 864e5); return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
  const fmtDate = (s) => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); };

  let observer = null;
  function renderSheet() {
    const v = state.stack[state.stack.length - 1]; if (!v) return;
    const y = state.year, cc = citer(); let k = "", h = "";
    $("#sheetBack").hidden = state.stack.length < 2;
    if (v.kind === "country") {
      const name = nameOf(v.gw, y), roles = rolesOf(v.gw, y), c = countries[v.gw];
      const all = Object.values(conflicts).filter((x) => involves(x, v.gw)).sort((p, q) => q.last - p.last);
      const periods = [...c.periods].sort((p, q) => p[0] - q[0]);
      const st = stories.filter((s) => s.conflicts.some((id) => conflicts[id] && involves(conflicts[id], v.gw)));
      k = "Country · " + y;
      h = `<h2>${esc(name)}</h2>
        <div class="roles">${roles.length ? [...new Map(roles.map((r) => [r.short, r])).values()].map((r) => `<span class="role ${r.red ? "red" : ""}">${icon(r.i)}${esc(r.short)}</span>`).join("") : `<span class="role">No armed conflict recorded in ${y}</span>`}</div>
        ${roles.length ? `<div class="sec">In ${y}</div><ul class="inv">${roles.map((r) => invRow(r, rowAttrs(r))).join("")}</ul>` : ""}
        ${v.gw === 666 && y >= 1967 ? `<p class="note">From June 1967 the border data draws the territory Israel occupied as part of Israel. The striped area marks it. <a href="#" data-open-occ="occ-1967">About the occupied territories</a></p>` : ""}
        ${st.length ? `<div class="sec">Read the full story</div><ul class="inv">${st.map((s) => invRow({ i: "book", red: true, text: s.title, sub: s.teaser, right: span(s.start, s.end) }, `data-story="${s.id}"`)).join("")}</ul>` : ""}
        ${all.length ? `<div class="sec">All armed conflicts involving ${esc(name)}</div><ul class="inv">${all.map((x) => { const g = goalOf(x), yy = x.years[y]; return invRow({ i: g.i, red: yy?.int === 2, text: conflictName(x), sub: g.t, right: span(x.first, x.last) }, `data-open-conflict="${x.id}"`); }).join("")}</ul>` : ""}
        <div class="sec">Border history</div><ul class="inv">${periods.map((p) => invRow({ i: "territory", text: `${Math.floor(p[0])}–${p[1] === 9999 ? "today" : Math.floor(p[1])}`, sub: "From " + dateOf(p[0]), right: "Show" }, `data-year="${Math.ceil(p[0])}"`)).join("")}</ul>
        <p class="fine">Borders: CShapes 2.0${cc.c(["data-cshapes"])}. Conflicts: UCDP${cc.c(["data-acd"])}.</p>`;
    }
    if (v.kind === "conflict") h = conflictHTML(conflicts[v.id], y, cc), k = "Armed conflict";
    if (v.kind === "year") {
      const act = activeConflicts(y), wars = act.filter((c) => c.years[y].int === 2).length, occ = activeOccs(y), pa = peace.filter((p) => p.year === y);
      const st = stories.filter((s) => y >= s.start && y <= s.end);
      const inBox = (p) => p.cx >= ME_BOX[0] && p.cx <= ME_BOX[2] && p.cy >= ME_BOX[1] && p.cy <= ME_BOX[3];
      const changed = visibleFeatures(y).filter((f) => Math.floor(f.properties.s) === y && inBox(f.properties));
      k = "The year " + y;
      h = `<h2>The Middle East in ${y}</h2>
        <p class="sub">${y < ACD_START ? "Conflict records start in 1946. Tap a country to see how its borders changed." : act.length ? `${act.length} armed conflict${act.length > 1 ? "s" : ""}, ${wars} at war level.` : "No armed conflict recorded."}${y >= ACD_START ? cc.c(["data-acd"]) : ""}</p>
        ${st.length ? `<ul class="inv">${st.map((s) => invRow({ i: "book", red: true, text: s.title, sub: "Read the full story", right: span(s.start, s.end) }, `data-story="${s.id}"`)).join("")}</ul>` : ""}
        ${act.length ? `<div class="sec">Armed conflicts</div><ul class="inv">${act.map((c) => { const g = goalOf(c), w = c.years[y].int === 2; return invRow({ i: g.i, red: w, text: conflictName(c), sub: g.t + (w ? ", war level" : ""), right: span(c.first, c.last) }, `data-open-conflict="${c.id}"`); }).join("")}</ul>` : ""}
        ${occ.length ? `<div class="sec">Occupied territory</div><ul class="inv">${occ.map((o) => invRow({ i: "occupy", red: true, text: o.title, sub: "", right: o.to === 9999 ? "since " + o.from : span(o.from, o.to) }, `data-open-occ="${o.id}"`)).join("")}</ul>` : ""}
        ${changed.length ? `<div class="sec">New borders or states</div><ul class="inv">${changed.map((f) => invRow({ i: "territory", text: countryName(f.properties.n, y), sub: "From " + dateOf(f.properties.s) }, `data-open-country="${f.properties.g}"`)).join("")}</ul>` : ""}
        ${pa.length ? `<div class="sec">Peace agreements</div><ul class="inv">${pa.map((p) => invRow({ i: "peace", text: p.name, sub: fmtDate(p.date) }, conflicts[p.conflict] ? `data-open-conflict="${p.conflict}"` : "disabled")).join("")}</ul>` : ""}`;
    }
    if (v.kind === "occupation") {
      const o = occs.find((x) => x.id === v.id); k = "Occupied territory";
      h = `<h2>${esc(o.title)}</h2><div class="prose">${o.notes.map((f) => `<p>${esc(f.t)}${cc.c(f.c)}</p>`).join("")}</div>`;
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

  function conflictHTML(c, y, cc) {
    const ny = nearestYear(c, y), yy = c.years[ny], ys = Object.keys(c.years).map(Number), g = goalOf(c);
    const all = []; for (let i = c.first; i <= c.last; i++) all.push(i);
    const dY = ys.filter((i) => c.years[i].best != null), tot = (key) => dY.reduce((s, i) => s + c.years[i][key], 0);
    const links = support.links.filter((L) => L.conflict === c.id && L.years.includes(y)), by = {};
    for (const L of links) { const r = (by[L.recipient] = by[L.recipient] || { sup: new Set(), types: new Set() }); r.sup.add(gov(L.supporter)); L.types.forEach((t) => r.types.add(t)); }
    const pas = peace.filter((p) => p.conflict === c.id), s = storyFor(c, y);
    const names = (list) => list.map((gw) => nameOf(gw, ny)).join(", ");
    let h = `<h2>${esc(conflictName(c))}</h2>
      <p class="sub">Fighting recorded in ${ys.length} year${ys.length > 1 ? "s" : ""} between ${c.first} and ${c.last}.${cc.c(["data-acd"])}</p>
      <div class="roles"><span class="role">${icon(g.i)}${esc(g.t)}</span>${yy.int === 2 ? `<span class="role red">${icon("fight")}War level in ${ny}</span>` : `<span class="role">${icon("fight")}Smaller conflict in ${ny}</span>`}${s ? `<button class="role red" data-jump=".chapter">${icon("book")}Read the story</button>` : ""}</div>
      ${ny !== y ? `<p class="note">No fighting recorded in ${y}. Showing ${ny}. <a href="#" data-year="${ny}">Go to ${ny}</a></p>` : ""}
      <div class="sec">Who fought in ${ny}</div>
      <div class="vs"><div><small>Side A · white on the globe</small><b>${esc(gov(yy.a))}</b>${yy.sa.length ? `<em>${icon("troops")}<span>Troops from ${esc(names(yy.sa))}</span></em>` : ""}</div>
        <div class="b"><small>Side B · red on the globe</small><b>${esc(gov(yy.b))}</b>${yy.sb.length ? `<em>${icon("troops")}<span>Troops from ${esc(names(yy.sb))}</span></em>` : ""}</div></div>
      <div class="sec">How deadly</div>
      <div class="figs"><div><b class="${yy.int === 2 ? "red" : ""}">${yy.int === 2 ? "War" : "Minor"}</b><span>${yy.int === 2 ? "1,000+" : "25–999"} battle deaths in ${ny}</span></div>
        <div><b>${yy.best != null ? fmt(yy.best) : "–"}</b><span>${yy.best != null ? `deaths in ${ny}, range ${fmt(yy.low)}–${fmt(yy.high)}` : "yearly counts start in 1989"}</span></div>
        <div><b>${dY.length ? fmt(tot("best")) : "–"}</b><span>${dY.length ? `deaths ${dY[0]}–${dY[dY.length - 1]}` : "total since 1989"}</span></div></div>
      <div class="bars" role="img" aria-label="Fighting by year">${all.map((i) => { const q = c.years[i]; return `<i data-year="${i}" class="${q && q.int === 2 ? "war" : ""} ${i === y ? "now" : ""}" style="height:${q ? (q.int === 2 ? 100 : 35) : 4}%" title="${i}"></i>`; }).join("")}</div>
      <div class="axis"><span>${c.first}</span><span>tap a bar to jump</span><span>${c.last}</span></div>
      <div class="sec">Foreign support in ${y}</div>
      ${y < ESD[0] || y > ESD[1] ? `<p class="fine">Foreign support is recorded for 1975–2017.</p>` : links.length ? `<ul class="support">${Object.entries(by).map(([r, o]) => `<li>${icon("support")}<span><b>${esc(gov(r))}</b> (${sideOfRecipient(yy, r) === "a" ? "side A" : "side B"}) was backed by ${esc([...o.sup].join(", "))}.${cc.c(["data-esd"])}<span class="chips">${[...o.types].map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</span></span></li>`).join("")}</ul><p class="fine" style="margin-top:10px">Lines on the globe run from each supporter's capital.</p>` : `<p class="fine">None recorded for ${y}.</p>`}
      ${pas.length ? `<div class="sec">Peace agreements</div><ul class="support">${pas.map((p) => `<li>${icon("peace")}<span><b>${esc(p.name)}</b>, ${esc(fmtDate(p.date))}${cc.c(["data-pa"])}${p.text_url ? ` <a href="${esc(p.text_url)}" target="_blank" rel="noopener">Read it</a>` : ""}</span></li>`).join("")}</ul>` : ""}`;
    if (s) {
      const Z = desktop() ? { close: 4.3, region: 3.6, world: 1.6 } : { close: 4.0, region: 3.2, world: 1.2 };
      const part = (title, yr, z, inner, center) => `<div class="part" data-y="${yr}" data-z="${z}" data-c="${(center || s.focus).join(",")}"><h4>${esc(title)}<small>${yr}</small></h4>${inner}</div>`;
      const ps = (arr) => `<div class="prose">${arr.map((f) => `<p>${esc(f.t)}${cc.c(f.c)}</p>`).join("")}</div>`;
      h += `<div class="chapter part" data-y="${s.years.intro}" data-z="${Z.region}" data-c="${s.focus.join(",")}">
        <div class="chapter-top">${icon("book")}The story · ${span(s.start, s.end)}</div>
        <h3>${esc(s.title)}</h3>
        <div class="names">${s.names.map((n) => `<div>${esc(n.name)}<span>${esc(n.used_by)}</span></div>`).join("")}</div>
        <div class="prose"><p class="lede">${esc(s.summary)}</p></div>
        <p class="fine">Keep scrolling: the globe follows the story.</p></div>
        ${part("How it started", s.years.background, Z.close, ps(s.background))}
        ${part("What happened", s.years.course, Z.close, ps(s.course))}
        ${part("How it ended", s.years.outcome, Z.close, ps(s.outcome))}
        ${part("What it changed in the region", s.years.effects, Z.region, ps(s.effects_region))}
        ${part("What it changed in the world", s.years.effects, Z.world, ps(s.effects_world), [30, 30])}
        ${part("Where historians disagree", s.years.intro, Z.region, s.debates.map((d) => `<p class="debate-q">${esc(d.q)}</p><ul class="views">${d.views.map((x) => `<li>${esc(x.t)}${cc.c(x.c)}</li>`).join("")}</ul>`).join(""))}
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
    const b = e.target.closest("[data-open-conflict],[data-open-country],[data-open-occ],[data-story],[data-year],[data-src],[data-jump]");
    if (!b || b.disabled) return;
    if (b.tagName === "A" && b.target === "_blank") return;
    e.preventDefault();
    if (b.dataset.src) { const el = body.querySelector("#sources"); if (el) body.scrollTo({ top: el.offsetTop - 8, behavior: reduceMotion ? "auto" : "smooth" }); return; }
    if (b.dataset.jump) { const el = body.querySelector(b.dataset.jump); if (el) { body.scrollTo({ top: el.offsetTop - 8, behavior: reduceMotion ? "auto" : "smooth" }); } return; }
    if (b.dataset.story) return openStory(stories.find((s) => s.id === b.dataset.story));
    if (b.dataset.openConflict) return openView({ kind: "conflict", id: b.dataset.openConflict });
    if (b.dataset.openCountry) return openView({ kind: "country", gw: +b.dataset.openCountry });
    if (b.dataset.openOcc) return openView({ kind: "occupation", id: b.dataset.openOcc });
    if (b.dataset.year) setYear(+b.dataset.year);
  });

  // ------------------------------------------------------------------ touching the globe
  const tip = $("#tip");
  const inOcc = (pt) => state.layers.occupation && map.queryRenderedFeatures(pt, { layers: ["occ-hatch"] }).length && !map.queryRenderedFeatures(pt, { layers: ["occ-mask"] }).length;
  if (canHover) {
    map.on("mousemove", (e) => {
      const ev = map.queryRenderedFeatures(e.point, { layers: ["events"] })[0], land = map.queryRenderedFeatures(e.point, { layers: ["land"] })[0];
      map.getCanvas().style.cursor = ev || land ? "pointer" : ""; map.setFilter("hover", land ? ["==", ["id"], land.id] : NONE);
      let h = "";
      if (ev) { const p = ev.properties; h = `<b>${esc(events.types[p.t])}</b><br>${fmt(p.b)} deaths in ${state.year} (range ${fmt(p.lo)}–${fmt(p.hi)})`; }
      else if (land) { const p = land.properties, r = rolesOf(p.g, state.year); h = `<b>${esc(countryName(p.n, state.year))}</b>${inOcc(e.point) ? "<br>Occupied territory" : ""}${r.slice(0, 3).map((x) => "<br>" + esc(x.text)).join("")}`; }
      if (h) { tip.innerHTML = h; tip.hidden = false; tip.style.left = Math.min(e.originalEvent.clientX + 14, innerWidth - 270) + "px"; tip.style.top = e.originalEvent.clientY + 14 + "px"; } else tip.hidden = true;
    });
    map.on("mouseout", () => { tip.hidden = true; map.setFilter("hover", NONE); });
  }
  map.on("click", (e) => {
    tip.hidden = true; if (!$("#keyPanel").hidden) return closeKey();
    const ev = map.queryRenderedFeatures(e.point, { layers: ["events"] })[0];
    if (ev) { const { t, c } = ev.properties; return openView(t === 1 && conflicts[c] ? { kind: "conflict", id: String(c) } : { kind: "group", t, id: c }); }
    if (inOcc(e.point)) { const hit = map.queryRenderedFeatures(e.point, { layers: ["occ-hatch"] })[0]; const o = activeOccs(state.year).find((x) => x.hatch_gw === hit.properties.g); if (o) return openView({ kind: "occupation", id: o.id }); }
    const f = map.queryRenderedFeatures(e.point, { layers: ["land"] })[0];
    if (f) openView({ kind: "country", gw: f.properties.g });
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
      return [...names].map((n) => ({ kind: "Country", ic: "territory", label: n, sub: from + "–" + (to === 9999 ? "today" : Math.floor(to)), terms: n.toLowerCase(), go: () => { if (state.year < from || state.year >= to) setYear(from, { keepSheet: true }); openView({ kind: "country", gw: +gw }, { push: false }); } })); }),
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
  window.__atlas = { map, state, setYear, openView, openStory, closeSheet };
})();
