// Generated systems, from the published map (tools/port/generated.js, galaxygrid.js). The game scatters stars through
// every cell of a 2048 × 2048 density map, seeded per cell, so the same cell always holds the same stars.
import { CELL_LY, GRID } from './camera'

/** [raw, weight, zone, colour, label, fuel] */
export type StarTableRow = [string, number, string, string, string, number]
export interface SectorAnchors { sectors: string[]; x: number[]; y: number[] }

export interface GeneratedStar {
  x: number
  z: number
  type: string
  colour: string
  fuel: boolean
  raw: string
  name: string
  seed: number
  /** Where a thinned field draws it, spread across its cell. */
  at?: [number, number]
}

/** The game's own PRNG: BitmapData.noise seeded per cell, walked as a stream. */
export class Rndm {
  x: number
  p = 0
  buf: number[] = []
  constructor(seed: number) { this.x = (seed <= 0 ? -seed + 1 : seed) >>> 0 }
  byte() { this.x = (this.x * 16807) % 2147483647; return this.x % 256 }
  random() {
    this.p = (this.p + 1) % 200000
    while (this.buf.length <= this.p) {
      const r = this.byte(), g = this.byte(), b = this.byte(), a = this.byte()
      this.buf.push(((a << 24) | (r << 16) | (g << 8) | b) >>> 0)
    }
    return (this.buf[this.p] * 0.999999999999998 + 1e-15) / 4294967295
  }
  float(a: number, b: number) { return this.random() * (b - a) + a }
  integer(a: number, b: number) { return Math.floor(this.float(a, b)) }
}

const ZONE_LEN = 10000, ZONE_ANGLE = Math.PI / 6
const CAP = 20000

export function mix(h: number) {
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * GalaxyMap.GetRealStars: a cell holds one real star per 1/100-cell reservation slot, first loaded wins.
 * "cellX,cellY,slotX,slotY".
 */
export function slotOf(x: number, z: number) {
  const px = x / CELL_LY + 1025, py = 1591 - z / CELL_LY
  const cx = Math.floor(px), cy = Math.floor(py)
  return `${cx},${cy},${Math.min(99, Math.round((px - cx) * 100))},${Math.min(99, Math.round((py - cy) * 100))}`
}

export class Generator {
  side: Uint8Array | null = null
  zones: Uint8Array | null = null
  private cache = new Map<number, GeneratedStar[]>()
  private starTotal: number
  private real = new Map<number, [number, number][]>()

  private starTable: StarTableRow[]
  private anchors: SectorAnchors

  constructor(starTable: StarTableRow[], anchors: SectorAnchors) {
    this.starTable = starTable
    this.anchors = anchors
    this.starTotal = starTable.reduce((s, t) => s + t[1], 0)
  }

  /** Stars per side (one byte per cell) and the RGB zone gate (three bytes per cell). */
  setMaps(side: Uint8Array, zones: Uint8Array) {
    this.side = side
    this.zones = zones
    this.cache.clear()
  }

  /** Real stars, in light years and load order; generated stars are not placed on top of them. A star in a taken slot is hidden and ignored. */
  setReal(points: Iterable<readonly [number, number]>) {
    this.real = new Map()
    const taken = new Set<string>()
    for (const [x, z] of points) {
      const slot = slotOf(x, z)
      if (taken.has(slot)) continue
      taken.add(slot)
      const px = x / CELL_LY + 1025, py = 1591 - z / CELL_LY
      const k = (py | 0) * GRID + (px | 0)
      let bucket = this.real.get(k)
      if (!bucket) this.real.set(k, bucket = [])
      bucket.push([px, py])
    }
    this.cache.clear()
  }

  catalogueInCell(cx: number, cy: number) {
    return this.real.get(cy * GRID + cx) || []
  }

  private starGetType(rng: Rndm) {
    const roll = rng.float(0, this.starTotal)
    let low = 0, high = 0
    for (const t of this.starTable) {
      high += t[1]
      if (roll >= low && roll <= high) return t
      low += t[1]
    }
    return this.starTable[this.starTable.length - 1]
  }

  /** StarGroups.GetByZone: keep drawing until a type suits this part of the galaxy. */
  starByZone(rng: Rndm, r: number, g: number, b: number) {
    for (;;) {
      const t = this.starGetType(rng)
      const zone = t[2]
      if (zone === 'NoZone') return t
      const gate = zone === 'Center' ? r : zone === 'OuterArmSide' ? g : zone === 'AnomalyZones' ? b : -1
      if (rng.integer(0, 255) <= gate) return t
      if (rng.integer(0, 255) < 25) return t
    }
  }

  sectorId(cx: number, cy: number) {
    let a = Math.PI - Math.atan2(-(1591 - cy), 1025 - cx)
    if (a < 0) a += Math.PI * 2
    const zone = Math.trunc(a / ZONE_ANGLE)
    let r = Math.trunc(Math.hypot(1025 - cx, 1591 - cy))
    r = Math.trunc(r / (ZONE_LEN / CELL_LY))
    const i = zone * 8 + r
    return i >= this.anchors.sectors.length ? 0 : i
  }

  sectorName(cx: number, cy: number) {
    const i = this.sectorId(cx, cy)
    const dx = this.anchors.x[i] - cx, dy = this.anchors.y[i] - cy
    const q = (dx < 0 && dy > 0) ? 4 : (dx > 0 && dy > 0) ? 1 : (dx < 0 && dy < 0) ? 3 : (dx > 0 && dy < 0) ? 2 : 1
    const ax = Math.abs(dx), ay = Math.abs(dy)
    const pair = (n: number) => String.fromCharCode(((n / 26) | 0) + 65) + String.fromCharCode((n % 26) + 97)
    return { zone: this.anchors.sectors[i], sector: `${pair(ax)}-${pair(ay)} ${String.fromCharCode(q + 65)}` }
  }

  /**
   * The stars inside one cell. `share` < 1 stops the walk once that fraction of the cell is built; the walk is a
   * sequence, so the share is always the cell's first stars.
   */
  cellStars(cx: number, cy: number, share = 1): GeneratedStar[] {
    if (!this.side || !this.zones || cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return []
    const cell = cy * GRID + cx
    const key = share >= 1 ? cell * 64 : cell * 64 + Math.min(63, Math.round(1 / share))
    const hit = this.cache.get(key)
    if (hit) return hit

    const side = this.side[cell]
    if (!side) return []
    const rng = new Rndm(cx * 10000 + cy)
    const r = this.zones[cell * 3], g = this.zones[cell * 3 + 1], b = this.zones[cell * 3 + 2]
    const step = 1 / side
    const real = this.catalogueInCell(cx, cy)
    const name = this.sectorName(cx, cy)

    const want = share >= 1 ? Infinity : Math.max(1, Math.round(side * side * share))
    let gx = cx + step / 2, gy = cy
    const out: GeneratedStar[] = []
    for (let i = 0; i < side * side && out.length < want; i++) {
      const x = gx + rng.float(0, step / 1.3)
      const y = gy + rng.float(0, step / 1.3)
      let clash = false
      for (const [rx, ry] of real) if (step * step / 2 > (rx - x) ** 2 + (ry - y) ** 2) { clash = true; break }
      if (!clash) {
        const t = this.starByZone(rng, r, g, b)
        out.push({
          x: (x - 1025) * CELL_LY, z: (1591 - y) * CELL_LY,
          type: t[4], colour: t[3], fuel: !!t[5], raw: t[0],
          name: `${name.zone} ${name.sector}${i}`,
          seed: (((cx & 0xFFF) << 20) + ((cy & 0xFFF) << 8) + ((real.length + i) & 0xFF)) >>> 0,
        })
      }
      gx += step
      if (gx > cx + 1) { gx = cx + step / 2; gy += step }
    }
    // Oldest half: a view wider than the cache would otherwise wipe it on the frame that filled it.
    if (this.cache.size > CAP) {
      let n = this.cache.size >> 1
      for (const k of this.cache.keys()) { this.cache.delete(k); if (--n <= 0) break }
    }
    this.cache.set(key, out)
    return out
  }
}

/** Decodes side.webp and zones.webp the way the published map does: drawn to a canvas, channels read back. */
export async function loadGenerationMaps(base: string) {
  const read = async (src: string, channels: number) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const c = document.createElement('canvas')
    c.width = c.height = GRID
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, GRID, GRID).data
    const out = new Uint8Array(GRID * GRID * channels)
    for (let i = 0; i < GRID * GRID; i++) for (let ch = 0; ch < channels; ch++) out[i * channels + ch] = px[i * 4 + ch]
    return out
  }
  const [side, zones] = await Promise.all([read(`${base}data/side.webp`, 1), read(`${base}data/zones.webp`, 3)])
  return { side, zones }
}
