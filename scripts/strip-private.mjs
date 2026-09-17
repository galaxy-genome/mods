// Runs after `vite build`. Vite copies all of public/ into dist/, including the gitignored game data that exists only on a
// maintainer's machine; none of it may ship. Deletes it, then fails if any game text file is still in dist/.
import { existsSync, readdirSync, rmSync } from 'node:fs'

const PRIVATE = /^game-(quests|story).*\.json$/
const dir = new URL('../dist/data/', import.meta.url)
if (existsSync(dir)) for (const name of readdirSync(dir)) if (PRIVATE.test(name)) rmSync(new URL(name, dir))
const left = existsSync(dir) ? readdirSync(dir).filter((n) => PRIVATE.test(n)) : []
if (left.length) { console.error(`strip-private: still in dist/data: ${left.join(', ')}`); process.exit(1) }
