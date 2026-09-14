#!/usr/bin/env python3
"""Writes src/data/reference.json (systems, stations, bodies) and public/data/game-quests.json from game.db.

game-quests.json holds the game's own quest text; it is gitignored and served only from a local copy, so a public
build ships without it.

    python3 scripts/build-reference.py [path/to/game.db]
"""
import json
import pathlib
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path.home() / "code/galaxy-genome/tools/port/game.db")

db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
q = lambda sql, *a: db.execute(sql, a).fetchall()

stations = [dict(name=n, system=s, type=t, faction=f, planetIndex=p)
            for n, s, t, f, p in q("SELECT name, system, type, faction, planet_index FROM galaxy_station ORDER BY name")]
station_systems = {s["system"] for s in stations}
systems = [dict(name=n, x=round(x, 2), y=round(z, 2), security=sec, starType=t)
           for n, x, z, sec, t in q("SELECT name, map_x, map_z, security, star_type FROM galaxy_system WHERE authored = 1 ORDER BY ly_from_sol")]
bodies = {}
for system, ordinal, name, kind, type_ in q("SELECT system, ordinal, name, kind, type FROM galaxy_body ORDER BY system, ordinal"):
    if system in station_systems:
        bodies.setdefault(system, []).append(dict(ordinal=ordinal, name=name, kind=kind, type=type_))

quests = []
for fid, qid, name, desc, char, char_name, station, requires, space in q(
        """SELECT q._file, q.ID, q.QuestName, q.QuestDescription, q.CharImage, q.CharName, q.StationName,
                  q.RequestedQuestIDCompleted, q.isRandomSpaceQuest
           FROM quest q JOIN quest_file f ON f.id = q._file
           WHERE f.source = 'builtin' AND f.lang_dir = 'questsen' ORDER BY q.ID"""):
    steps = q("SELECT name, TODO, completeAction FROM quest_step WHERE _file = ? AND _parent IS NULL ORDER BY _ord", fid)
    quests.append(dict(id=qid, name=name, description=desc, charImage=char, charName=char_name, station=station,
                       randomSpace=bool(space), requires=str(requires or ""),
                       steps=[dict(name=a, todo=b, completeAction=c) for a, b, c in steps]))

(ROOT / "src/data/reference.json").write_text(json.dumps(dict(systems=systems, stations=stations, bodies=bodies), ensure_ascii=False))
(ROOT / "public/data").mkdir(parents=True, exist_ok=True)
(ROOT / "public/data/game-quests.json").write_text(json.dumps(quests, ensure_ascii=False))
print(f"{len(systems)} systems, {len(stations)} stations, {len(bodies)} systems with bodies, {len(quests)} game quests")
