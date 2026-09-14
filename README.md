# Galaxy Genome Quest Editor

A mod editor for [Galaxy Genome](https://play.google.com/store/apps/details?id=com.skvgames.GalaxyGenome),
the space sim by SKV Games. Write side quests and add star systems on your phone or computer, check them
against what the game actually loads, and download files ready to copy onto your device.

**[Open the editor](https://galaxy-genome.github.io/mods/)** ·
**[Wiki](https://galaxy-genome.github.io/wiki/)** ·
**[Map](https://galaxy-genome.github.io/map/)** ·
**[Discord](https://discord.gg/7zKeYt2SwU)** ·
**[Reddit](https://www.reddit.com/r/galaxygenome)**

It runs in the browser, works offline once loaded, and can be installed as an app. Your mods stay on your
device. Galaxy Genome and all of its data belong to SKV Games; this is an unofficial fan project.

## What it does

- **Side quests, step by step.** Bar contacts, dialogue with choices, ships to spawn and order around, station
  missions, rewards and rumors. Every place and condition is picked from the game's own lists, so a quest
  cannot wait for an event the game never sends.
- **Star systems and stations.** Add stars, planets and stations, placed on the editor's own copy of the
  galaxy map.
- **Problems that match the game.** Each rule comes from the game's loader. An error means the game will not
  load part of your mod as intended; a warning is everything else, from a checkpoint that strands a ship on
  reload to a station hidden behind another star.
- **Flow and map views.** See a quest as cards joined by arrows, labelled with each choice, or as numbered
  pins routed across the galaxy.
- **Undo and history.** Every change can be undone, and earlier versions of a mod can be restored.
- **Download.** Favourite the mods you want and download one zip. Quest IDs that clash are renumbered, and the
  game's limit of 200 quest files is checked first.
- **Library.** Ready-made mods to add, edit or learn from, each with its author and licence. See
  [CREDITS.md](CREDITS.md).
- **Help.** Searchable articles on installing mods, how the game runs quests, and every field.

## What is here

- `src/` — the app (React, TypeScript, Vite).
- `community/` — library mods, one entry per mod with its provenance. `npm run credits` rebuilds
  `CREDITS.md` from these entries.
- `src/data/defaults/` — the example mods a new visitor starts with.
- `docs/design/` — the design documents.

```
npm install
npm run dev     # the editor at http://localhost:5173/
npm test
npm run build   # what GitHub Pages serves, under /mods/
```

Every push to `master` builds and publishes the site.

## Sharing a mod

Use **Submit to library** in the editor, or share the zip on [Discord](https://discord.gg/7zKeYt2SwU). A mod
joins the library once its author agrees to its licence.

## Licence

The editor is MIT licensed (see [LICENSE](LICENSE)). Each library mod keeps its own author's licence, listed
in [CREDITS.md](CREDITS.md). Game names, places and characters that mods refer to belong to SKV Games.
