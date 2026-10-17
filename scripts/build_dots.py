"""Turn the CShapes borders into a dotted globe.

Reads  app/data/borders.geojson  (built by build_data.py)
Writes app/data/dots.json    dots anchored to the ground, each with the history of which state held it
       app/data/places.json  the same border records without their shapes (names, dates, capitals)

Dots sit on rows of latitude, evenly spaced along each row so they look even on a sphere.
Two grids: a coarse one for the whole world and a fine one around Europe, Africa and the Middle East,
shown when you zoom in. Pure standard library, like the rest of the pipeline.
"""
import json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "app", "data")
LEVELS = [
    {"step": 0.9, "box": (-180, -58, 180, 84)},
    {"step": 0.3, "box": (-25, -12, 100, 64)},
    {"step": 0.15, "box": (24.5, 12, 63, 42)},
]
PRE67_ISRAEL = lambda p: p["g"] == 666 and p["s"] < 1967.4


def rings_of(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return [ring for poly in polys for ring in poly]


def rows_for(level):
    step, (x0, y0, x1, y1) = level["step"], level["box"]
    rows, i = [], 0
    while y0 + step / 2 + i * step < y1:
        lat = round(y0 + step / 2 + i * step, 6)  # exact, no drift from repeated adding
        dlon = step / max(0.15, math.cos(math.radians(lat)))
        off = (i % 2) * dlon / 2
        rows.append((lat, dlon, x0 + off + dlon / 2))
        i += 1
    if not rows:  # a place thinner than one row: one row through its middle
        lat = (y0 + y1) / 2; dlon = step / max(0.15, math.cos(math.radians(lat))); rows.append((lat, dlon, x0 + dlon / 2))
    return rows


def covered(rings, rows, x1):
    """Scanline fill: for each row, which dot columns fall inside the polygon (even-odd rule)."""
    xs = {}
    lat0, step = rows[0][0], (rows[1][0] - rows[0][0]) if len(rows) > 1 else 1
    for ring in rings:
        n = len(ring)
        for k in range(n - 1):
            ax, ay = ring[k]; bx, by = ring[k + 1]
            if ay == by: continue
            lo, hi = (ay, by) if ay < by else (by, ay)
            r0 = max(0, math.ceil((lo - lat0) / step) - 1); r1 = min(len(rows) - 1, math.floor((hi - lat0) / step) + 1)
            for r in range(r0, r1 + 1):
                lat = rows[r][0]
                if lat < lo or lat >= hi: continue
                xs.setdefault(r, []).append(ax + (lat - ay) * (bx - ax) / (by - ay))
    out = []
    for r, l in xs.items():
        l.sort(); lat, dlon, start = rows[r]
        for a, b in zip(l[0::2], l[1::2]):
            j0 = max(0, math.ceil((a - start) / dlon)); j1 = math.floor((min(b, x1) - start) / dlon)
            for j in range(j0, j1 + 1):
                if start + j * dlon < b: out.append((r, j))
    return out


MIN_DOTS = [0, 5, 8]   # small places (Gaza, Bahrain…) get extra, finer dots so they never vanish when zoomed in


def grid(feats, bboxes, step, box):
    """All dots of a grid inside box, each with the list of features covering it."""
    rows = rows_for({"step": step, "box": box}); x0, y0, x1, y1 = box
    cells, pre67 = {}, set()
    for fi, f in enumerate(feats):
        fx0, fy0, fx1, fy1 = bboxes[fi]
        if fx1 < x0 or fx0 > x1 or fy1 < y0 or fy0 > y1: continue
        for cell in covered(rings_of(f["geometry"]), rows, x1):
            cells.setdefault(cell, []).append(fi)
            if PRE67_ISRAEL(f["properties"]): pre67.add(cell)
    out = []
    for (r, j), fis in cells.items():
        lat, dlon, start = rows[r]
        out.append((start + j * dlon, lat, fis, (r, j) in pre67))
    return out


def main():
    borders = json.load(open(os.path.join(DATA, "borders.geojson")))
    feats = borders["features"]
    bboxes = []
    for f in feats:
        pts = [pt for r in rings_of(f["geometry"]) for pt in r]
        bboxes.append((min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)))
    histories, hid = [], {}
    result = {"levels": []}
    for li, level in enumerate(LEVELS):
        x0, y0, x1, y1 = level["box"]
        dots = grid(feats, bboxes, level["step"], level["box"])
        # top up small places with a finer grid inside their own outline
        if MIN_DOTS[li]:
            count = {}
            for d in dots:
                for fi in d[2]: count[fi] = count.get(fi, 0) + 1
            seen = {(round(d[0], 3), round(d[1], 3)) for d in dots}
            extra = 0
            small_km2 = max(MIN_DOTS[li], 8) * (level["step"] * 111) ** 2
            for fi, bb in enumerate(bboxes):
                if count.get(fi, 0) >= MIN_DOTS[li] or (feats[fi]["properties"].get("a") or 0) > small_km2: continue
                if bb[0] < x0 or bb[2] > x1 or bb[1] < y0 or bb[3] > y1: continue
                for sub in (level["step"] / 2, level["step"] / 3, level["step"] / 4, level["step"] / 6):
                    got = [d for d in grid(feats, bboxes, sub, bb) if fi in d[2]]
                    if len(got) >= MIN_DOTS[li] or sub < level["step"] / 5:
                        for d in got:
                            k = (round(d[0], 3), round(d[1], 3))
                            if k not in seen: seen.add(k); dots.append(d); extra += 1
                        break
            print(f"  level {li}: {extra} extra dots for small places", file=sys.stderr)
        flat = []
        inner = LEVELS[li + 1]["box"] if li + 1 < len(LEVELS) else None
        for lon, lat, fis, in67 in sorted(dots, key=lambda d: (d[1], d[0])):
            segs = sorted({(feats[i]["properties"]["g"], round(feats[i]["properties"]["s"], 3), round(min(feats[i]["properties"]["e"], 9999), 3)) for i in fis}, key=lambda t: t[1])
            key = tuple(segs)
            if key not in hid: hid[key] = len(histories); histories.append([v for t in segs for v in t])
            flags = (1 if in67 else 0) | (2 if inner and inner[0] <= lon <= inner[2] and inner[1] <= lat <= inner[3] else 0)
            flat += [round(lon * 100), round(lat * 100), hid[key], flags]
        result["levels"].append({"step": level["step"], "box": level["box"], "d": flat})
        print(f"level {li}: step {level['step']}, {len(flat)//4} dots", file=sys.stderr)
    result["H"] = histories
    print(f"{len(histories)} distinct histories", file=sys.stderr)
    with open(os.path.join(DATA, "dots.json"), "w") as fh: json.dump(result, fh, separators=(",", ":"))
    places = [{"id": f.get("id", i), **f["properties"]} for i, f in enumerate(feats)]
    with open(os.path.join(DATA, "places.json"), "w") as fh: json.dump(places, fh, separators=(",", ":"))
    for n in ("dots.json", "places.json"): print(n, os.path.getsize(os.path.join(DATA, n)) // 1024, "KB", file=sys.stderr)


if __name__ == "__main__":
    main()
