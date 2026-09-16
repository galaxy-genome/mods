// The editor's copy of the galaxy (public/data/galaxy.json, written by scripts/build-galaxy.py) and the drawing routines
// for it, from the published map's renderer (tools/port/starmap_js.js).
import * as React from 'react'
import { type Camera, acrossLy, gridStep, sx, sy, wxOf, wzOf } from './camera'
import { Generator, type SectorAnchors, type StarTableRow, loadGenerationMaps } from './generator'

/** [name, x, y, typeIndex, security, reachable] */
export type SystemRow = [string, number, number, number, string | null, 0 | 1]

export interface GalaxyData {
  systems: SystemRow[]
  /** [raw type name, colour] */
  types: [string, string][]
  outline: [number, number][]
  starTable: StarTableRow[]
  sectorAnchors: SectorAnchors
}

export interface Galaxy {
  data: GalaxyData
  /** The systems the published map draws and the generator avoids. */
  reachable: SystemRow[]
  /** Every catalogue system by name, reachable or not. */
  byName: Map<string, SystemRow>
  colourOf: (type: string) => string
  /** Catalogue-only generator, for checks. */
  generator: Generator
}

export function makeGalaxy(data: GalaxyData): Galaxy {
  const reachable = data.systems.filter((s) => s[5])
  const colours = new Map(data.types)
  const generator = new Generator(data.starTable, data.sectorAnchors)
  generator.setReal(reachable.map((s) => [s[1], s[2]] as const))
  return {
    data,
    reachable,
    byName: new Map(data.systems.map((s) => [s[0], s])),
    colourOf: (type) => colours.get(type) ?? colours.get('M-RedDwarf') ?? '#cf3a38',
    generator,
  }
}

/* ---------- loading: one copy for the app, shared by the map and the checks ---------- */

let galaxy: Galaxy | null = null
let galaxyLoad: Promise<Galaxy> | null = null
let maps: { side: Uint8Array; zones: Uint8Array } | null = null
let mapsLoad: Promise<void> | null = null
let version = 0
const listeners = new Set<() => void>()
const changed = () => { version++; listeners.forEach((l) => l()) }

export const getGalaxy = () => galaxy
export const getGenerationMaps = () => maps

export function loadGalaxy(): Promise<Galaxy> {
  galaxyLoad ??= fetch(`${import.meta.env.BASE_URL}data/galaxy.json`)
    .then((r) => { if (!r.ok) throw new Error(`galaxy.json ${r.status}`); return r.json() })
    .then((d: GalaxyData) => { galaxy = makeGalaxy(d); if (maps) galaxy.generator.setMaps(maps.side, maps.zones); changed(); return galaxy })
    .catch((e) => { galaxyLoad = null; throw e })
  return galaxyLoad
}

/** side.webp and zones.webp, about a megabyte, fetched once something needs generated systems. */
export function loadGeneration(): Promise<void> {
  mapsLoad ??= loadGenerationMaps(import.meta.env.BASE_URL)
    .then((m) => { maps = m; galaxy?.generator.setMaps(m.side, m.zones); changed() })
    .catch((e) => { mapsLoad = null; throw e })
  return mapsLoad
}

/** Re-renders when the galaxy or the generation maps arrive. */
export function useGalaxy() {
  const v = React.useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => version)
  return { galaxy, maps, version: v }
}

/* ---------- drawing ---------- */

export const DOT_R = 2.0
const DOT_FULL_LY = 600
/** A dot is full size while the view reads as individual systems and shrinks past that. */
export const dotSm = (c: Camera) => Math.max(0.35, Math.min(DOT_R, DOT_R * DOT_FULL_LY / acrossLy(c)))
export const INK = 'rgba(188,219,230,.78)'

export function drawGrid(ctx: CanvasRenderingContext2D, c: Camera) {
  const step = gridStep(c.scale)
  const x0 = Math.floor(wxOf(c, 0) / step) * step, x1 = wxOf(c, c.W)
  const z1 = Math.floor(wzOf(c, c.H) / step) * step, z0 = wzOf(c, 0)
  ctx.lineWidth = 1
  ctx.font = '11px "JetBrains Mono", monospace'
  ctx.fillStyle = '#3f6a78'
  for (let x = x0; x <= x1; x += step) {
    const p = Math.round(sx(c, x)) + 0.5
    ctx.strokeStyle = x === 0 ? 'rgba(30,147,166,.55)' : 'rgba(23,113,128,.22)'
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, c.H); ctx.stroke()
    ctx.fillText(String(Math.round(x)), p + 4, c.H - 8)
  }
  for (let z = z1; z <= z0; z += step) {
    const p = Math.round(sy(c, z)) + 0.5
    ctx.strokeStyle = z === 0 ? 'rgba(30,147,166,.55)' : 'rgba(23,113,128,.22)'
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(c.W, p); ctx.stroke()
    ctx.fillText(String(Math.round(z)), 6, p - 5)
  }
}

export function drawOutline(ctx: CanvasRenderingContext2D, c: Camera, outline: [number, number][]) {
  ctx.save()
  ctx.strokeStyle = 'rgba(53,224,245,.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const [x, z] of outline) ctx.lineTo(sx(c, x), sy(c, z))
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

export interface Dot { x: number; z: number; colour: string }

/** Dots within the view plus a margin, filled in one path per colour. Returns the ones on screen. */
export function drawSystems<T extends Dot>(ctx: CanvasRenderingContext2D, c: Camera, rows: Iterable<T>, r: number, alpha = 1): T[] {
  const pad = 40
  const kept: T[] = []
  const byColour = new Map<string, number[]>()
  for (const row of rows) {
    const px = sx(c, row.x), py = sy(c, row.z)
    if (px < -pad || px > c.W + pad || py < -pad || py > c.H + pad) continue
    kept.push(row)
    let list = byColour.get(row.colour)
    if (!list) byColour.set(row.colour, list = [])
    list.push(px, py)
  }
  ctx.globalAlpha = alpha
  for (const [colour, pts] of byColour) {
    ctx.fillStyle = colour
    ctx.beginPath()
    for (let i = 0; i < pts.length; i += 2) { ctx.moveTo(pts[i] + r, pts[i + 1]); ctx.arc(pts[i], pts[i + 1], r, 0, 6.283) }
    ctx.fill()
  }
  ctx.globalAlpha = 1
  return kept
}

/* ---------- labels: ranked, collision-free, held steady until the view moves a fifth of itself ---------- */

const LBL_W = 6, LBL_H = 10
const RESETTLE = 0.2

/** `always` draws even over other names, for labels a reader needs; `leftOf` is where a name ends when it would run off the right edge. */
export interface Label { px: number; py: number; rank: number; key: string; text: string; colour: string; always?: boolean; leftOf?: number; pill?: boolean }

/** Room the zoom buttons take at the map's right edge. */
const ZOOM_W = 60

/** The pixels a label takes beside its marker with `room` to draw in: its lines' widest, and how many lines. */
export function labelBox(ctx: CanvasRenderingContext2D, text: string, room: number) {
  const full = ctx.measureText(text).width
  if (full <= room) return { w: full, lines: 1 }
  const lines = wrap(ctx, text, room)
  return { w: Math.max(...lines.map((l) => ctx.measureText(l).width)), lines: lines.length }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = []
  for (const part of text.split(/(?<=[:,] )/)) {
    const last = out.length - 1
    if (last >= 0 && ctx.measureText(out[last] + part).width <= width) out[last] += part
    else out.push(part)
  }
  return out.map((l) => l.trimEnd())
}

export class Labels {
  private cells = new Set<number>()
  private list: Label[] = []
  private drawn = new Set<string>()
  private settledAt = 0
  private settledX = 0
  private settledZ = 0

  /** Starts a frame. */
  clear() { this.cells.clear(); this.list = [] }
  /** Forces the next frame to choose names afresh. */
  resettle() { this.settledAt = 0 }
  add(label: Label) { this.list.push(label) }

  /** Reserves ground without text, so names do not print over a handle. */
  claim(x: number, y: number, w: number) {
    const gy0 = Math.floor((y - 9) / LBL_H) + 4096, gy1 = Math.floor((y + 2) / LBL_H) + 4096
    const gx0 = Math.floor(x / LBL_W) + 4096, gx1 = Math.floor((x + w) / LBL_W) + 4096
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) if (this.cells.has(gy * 8192 + gx)) return false
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) this.cells.add(gy * 8192 + gx)
    return true
  }

  draw(ctx: CanvasRenderingContext2D, c: Camera) {
    const here = [wxOf(c, c.W / 2), wzOf(c, c.H / 2)]
    const resettle = !this.settledAt
      || Math.abs(c.scale - this.settledAt) > this.settledAt * RESETTLE
      || Math.hypot(here[0] - this.settledX, here[1] - this.settledZ) > acrossLy(c) * RESETTLE
    this.list.sort((a, b) => a.rank - b.rank)
    const held = new Set<string>()
    ctx.globalAlpha = 1
    ctx.font = '11px "JetBrains Mono", monospace'
    for (const { px: x0, py, rank, key, text, colour, always, leftOf, pill } of this.list) {
      const tw = ctx.measureText(text).width
      const overflows = leftOf !== undefined && x0 + 10 + tw > c.W - ZOOM_W
      const fitsLeft = overflows && leftOf - tw - 10 >= 0
      const px = fitsLeft ? leftOf - tw - 10 : x0
      // Too long for either side: break after ": " and ", " to fit right of the marker.
      const lines = overflows && !fitsLeft ? wrap(ctx, text, c.W - x0 - ZOOM_W) : [text]
      // Names ranked 1 or better appear the moment they exist; the rest keep the settled set.
      if (!resettle && rank > 1 && !this.drawn.has(key)) continue
      // A name claims its marker with its text; one that loses still claims the marker.
      if (!this.claim(px - 8, py + 4, tw + 18) && !always) {
        this.claim(px - 8, py + 4, 17)
        continue
      }
      held.add(key)
      if (pill) {
        // A route's place names sit on an opaque pill so star dots and grid lines never run through them.
        const w = Math.max(...lines.map((l) => ctx.measureText(l).width))
        ctx.fillStyle = '#04060e'; ctx.strokeStyle = 'rgba(120,150,170,.35)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(px + 5, py - 8, w + 10, lines.length * 13 + 3, 3); ctx.fill(); ctx.stroke()
      }
      ctx.fillStyle = colour
      lines.forEach((line, i) => ctx.fillText(line, px + 10, py + 4 + i * 13))
    }
    if (resettle) { this.drawn = held; this.settledAt = c.scale; [this.settledX, this.settledZ] = here }
    this.list = []
  }
}

/** Point in the galaxy outline polygon (even-odd). */
export function insideOutline(outline: [number, number][], x: number, z: number) {
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i], [xj, zj] = outline[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
