#!/usr/bin/env python3
"""Writes the editor's copy of the galaxy for its star map.

    public/data/galaxy.json                 catalogue systems, star types, outline, generator tables
    public/data/side.webp, zones.webp       generation maps, copied unchanged
    src/features/map/fixtures/cells.json    decoded generation bytes for 12 cells, with the published map's own
                                            cellStars output for them (run through node)

Reads tools/port/galaxy.db and map/docs/data/ and changes neither. Run after build_site.py.

    python3 scripts/build-galaxy.py
"""
import json
import pathlib
import shutil
import sqlite3
import subprocess

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
GG = ROOT.parent
DB = GG / "tools/port/galaxy.db"
MAP_DATA = GG / "map/docs/data"
OUT = ROOT / "public/data"
FIXTURE = ROOT / "src/features/map/fixtures/cells.json"
GRID, CELL_LY = 2048, 43.74

db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
published = json.loads((MAP_DATA / "galaxy.json").read_text())

types = db.execute("SELECT display, colour FROM star_type ORDER BY display").fetchall()
type_index = {}
for i, (raw, _) in enumerate(types):
    type_index[raw] = i
rows = db.execute("""SELECT s.name, s.map_x, s.map_z, t.display, s.security, s.reachable
                     FROM system s JOIN star_type t ON t.name = s.star_type ORDER BY s.ly_from_sol, s.name""").fetchall()
systems = [[n, round(x, 1), round(z, 1), type_index[t], sec, r] for n, x, z, t, sec, r in rows]
assert len(systems) == 14906, len(systems)
assert sum(s[5] for s in systems) == len(published["systems"]), "reachable count differs from the published map"

galaxy = {
    "systems": systems,
    "types": [[raw, colour] for raw, colour in types],
    "outline": published["outline"],
    "starTable": published["starTable"],
    "sectorAnchors": published["sectorAnchors"],
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "galaxy.json").write_text(json.dumps(galaxy, separators=(",", ":"), ensure_ascii=False))
for name in ("side.webp", "zones.webp"):
    shutil.copyfile(MAP_DATA / name, OUT / name)

# Fixture cells: Sol's, the busiest catalogue cells, the core, and one cell per stars-per-side value from 1 to 10.
side = Image.open(MAP_DATA / "side.webp").convert("RGB")
zones = Image.open(MAP_DATA / "zones.webp").convert("RGB")
cell_of = lambda x, z: (int(x // CELL_LY + 1025), int(-z // CELL_LY + 1591))
counts = {}
for s in published["systems"]:
    c = cell_of(s[1], s[2])
    counts[c] = counts.get(c, 0) + 1
cells = [(1025, 1591)]
for c, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:2]:
    if c not in cells:
        cells.append(c)
cells.append(cell_of(25, 25898))
for want in range(1, 11):
    if len(cells) >= 12:
        break
    for cy in range(1591, 400, -37):
        cx = 1025 + (1591 - cy) // 3
        if side.getpixel((cx, cy))[0] == want and (cx, cy) not in cells:
            cells.append((cx, cy))
            break
assert len(cells) == 12, cells

fixture = {"cells": [{"cx": cx, "cy": cy, "side": side.getpixel((cx, cy))[0], "zones": list(zones.getpixel((cx, cy)))}
                     for cx, cy in cells],
           "shares": [1, 0.5, 0.1]}

JS = r"""
const fs = require('node:fs'), vm = require('node:vm');
const [dataPath, fixturePath, portDir] = process.argv.slice(1);
const D = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const code = fs.readFileSync(portDir + '/galaxygrid.js', 'utf8') + fs.readFileSync(portDir + '/generated.js', 'utf8') + `
  GEN.side = new Uint8Array(GRID * GRID); GEN.zones = new Uint8Array(GRID * GRID * 3);
  for (const c of fixture.cells){ const i = c.cy * GRID + c.cx; GEN.side[i] = c.side; GEN.zones.set(c.zones, i * 3); }
  fixture.cells.map(c => fixture.shares.map(share => cellStars(c.cx, c.cy, share).map(s => ({name: s.name, x: s.x, z: s.z, type: s.type, colour: s.colour, raw: s.raw, fuel: s.fuel, seed: s.seed}))));`;
const ctx = vm.createContext({D, fixture, console});
vm.runInContext('const S = D.systems, X = 1, Z = 2;', ctx);
process.stdout.write(JSON.stringify(vm.runInContext(code, ctx)));
"""
FIXTURE.parent.mkdir(parents=True, exist_ok=True)
FIXTURE.write_text(json.dumps(fixture))
expected = subprocess.run(["node", "-e", JS, str(MAP_DATA / "galaxy.json"), str(FIXTURE), str(GG / "tools/port")],
                          check=True, capture_output=True, text=True).stdout
fixture["expected"] = json.loads(expected)
FIXTURE.write_text(json.dumps(fixture, separators=(",", ":")))
print(f"galaxy.json {(OUT / 'galaxy.json').stat().st_size:,} bytes, {len(systems):,} systems; "
      f"fixture {len(cells)} cells, {sum(len(e[0]) for e in fixture['expected'])} generated systems")
