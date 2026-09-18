# Galaxy Genome Quest Editor

<a href="https://github.com/galaxy-genome/mods/releases/download/demo/demo.mp4">
  <picture>
    <img alt="Building a Galaxy Genome quest on a phone: writing dialogue with choices, seeing them as arrows in the flow view, fixing a problem, viewing the quest on the galaxy map, and downloading a zip." src="https://github.com/galaxy-genome/mods/releases/download/demo/demo-dark.webp" width="320">
  </picture>
</a>

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
- **Play it before the game does.** Test plays your quest right in the editor: dialogue types itself out,
  choices branch, and you can pretend a step happened or a ship was destroyed. It shows the path you took and
  offers the ones you did not, so a mistake costs seconds instead of copying files to the phone and flying
  across a system to find out.
- **Flow and map views.** See a quest as cards joined by arrows, labelled with each choice, or as numbered
  pins routed across the galaxy, starting from the bar where it is offered.
- **Places with context.** Every station and system shows where it is, how far from Sol, with a small map of
  its neighbours. Quests in a mod that unlock one another are listed in the order they are played.
- **Undo and history.** Every change can be undone, and earlier versions of a mod can be restored.
- **Download.** Favourite the mods you want and download one zip. Quest IDs that clash are renumbered, and the
  game's limit of 200 quest files is checked first.
- **Library.** Ready-made mods to add, edit or learn from, each with its author and licence. See
  [CREDITS.md](docs/CREDITS.md).
- **Help.** Searchable articles on installing mods, how the game runs quests, and every field.
- **Keyboard.** ⌘K command palette, ⌘Z undo, and `?` for every shortcut.

## What is here

- `src/` — the app (React, TypeScript, Vite).
- `src/data/library/` — library mods, one entry per mod with its provenance. `npm run credits` rebuilds
  `docs/CREDITS.md` from these entries.
- `src/data/defaults/` — the example mods a new visitor starts with.
- `docs/design/` — the design documents.

```
npm install
npm run dev     # the editor at http://localhost:5173/
npm test
npm run build   # what GitHub Pages serves, under /mods/
npm run demo    # records the animation at the top of this page
DEMO_ONLY=quickbuild npm run demo  # re-records only the named or numbered segments, reuses the rest
npm run credits # rebuilds docs/CREDITS.md
```

Every push to `master` builds and publishes the site and re-records the demo.

## Sharing a mod

Use **Submit to library** in the editor: it downloads your mod and opens a prefilled GitHub issue. A check runs
the editor's own rules on the attached zip and comments the result; a mod with no errors gets a pull request
into the library. No GitHub account? Share the zip on [Discord](https://discord.gg/7zKeYt2SwU). A mod joins the
library once its author agrees to its licence.

## Link to a mod

`/community/<entry-id>` opens a library mod's contents on whoever's device follows the link, adding the entry
there first if it is missing. Anything after the entry id is a screen inside the mod, and a mod with several
parts can name one first by quest id, 1-based number, or `stars`. While an untouched library mod is open the
address bar stays on this form, so the URL is always ready to paste; a mod you have changed shows its own
address instead:

```
https://galaxy-genome.github.io/mods/community/community-humanity-at-war/test
https://galaxy-genome.github.io/mods/community/owner-of-record/2/flow
```

Each way to start a mod has its own address, which shows a setup page and creates nothing until Create: `/new`, `/new/quest`, `/new/quest/<template>` (`blank`, `delivery`, `ambush`, `choice`, `space`, `job`), `/new/stars` and `/new/stars/build`, for example `https://galaxy-genome.github.io/mods/new/quest/delivery` or `https://galaxy-genome.github.io/mods/new/stars/build`.

## Licence

The editor is MIT licensed (see [LICENSE](LICENSE)). Each library mod keeps its own author's licence, listed
in [CREDITS.md](docs/CREDITS.md). Galaxy Genome's names, places, characters and character portraits belong to SKV Games.
