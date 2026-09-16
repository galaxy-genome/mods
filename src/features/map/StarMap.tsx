import { Maximize, Minus, Plus } from 'lucide-react'
import * as React from 'react'
import { useT } from '@/i18n'
import { STATIONS } from '@/lib/reference'
import type { Severity, Star } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  type Camera, type Flight, CELL_LY, GRID, acrossLy, clampScale, clampView, flight, flyStep, homeLy, panBy, pinchTo, scaleFor, sx, sy, wxOf, wzOf, zoomAt,
} from './camera'
import { DOT_R, INK, Labels, labelBox, dotSm, drawGrid, drawOutline, drawSystems, loadGalaxy, loadGeneration, useGalaxy } from './galaxy'
import { type GeneratedStar, Generator, mix } from './generator'
import { type FitPoint, FIT_PAD, PIN_R, fanPins, fitView } from './declutter'
import { type Circle, type Grab, type Hit, type MapMode, dragTo, grabAt, pick, slop, tapAction, worldAt } from './picking'

export interface MapProblem { id: string; starId: string; severity: Severity }

/** A numbered marker; `text` is drawn inside, `label` beside it. */
export interface OverlayPin { id: string; x: number; y: number; text: string; colour: string; label?: string; start?: boolean; problem?: boolean; ring?: boolean; dim?: boolean; hollow?: boolean }
/** A curved line between two map points; `bend` offsets the curve sideways as a share of its length. */
export interface OverlayLine { x1: number; y1: number; x2: number; y2: number; colour: string; width?: number; dash?: boolean; arrow?: boolean; bend?: number; label?: string; dim?: boolean; step?: number }
export interface OverlayArea { x: number; y: number; r: number; colour: string; dim?: boolean }
/** Read-only drawings over the galaxy: areas, then lines, then pins. */
export interface MapOverlay { areas: OverlayArea[]; lines: OverlayLine[]; pins: OverlayPin[] }

export interface StarMapProps {
  mode: MapMode
  /** This mod's stars. */
  stars: Star[]
  /** Other favorite stars mods' stars, read-only. */
  otherStars?: Star[]
  point?: { x: number; y: number }
  circle?: Circle
  /** Radius in ly of a circle drawn around the view's centre, which follows panning. */
  centreCircle?: number
  /** The view's centre after it moves. */
  onCentre?: (x: number, y: number) => void
  selected?: string | null
  /** Where the view starts, and flies to when it changes. Without `ly` the zoom stays; a new `seq` flies again to the same point. */
  focus?: { x: number; y: number; ly?: number; seq?: number }
  /** Points and circles the view frames instead of `focus`: on first draw, when they change, and from the Fit button. */
  fit?: FitPoint[]
  problems?: MapProblem[]
  overlay?: MapOverlay
  /** The overlay pin drawn as selected. */
  selectedPin?: string | null
  readOnly?: boolean
  className?: string
  onAdd?: (x: number, y: number) => void
  onOpen?: (starId: string) => void
  onMove?: (starId: string, x: number, y: number) => void
  onPoint?: (x: number, y: number) => void
  onCircle?: (x: number, y: number, r: number) => void
  onPick?: (name: string) => void
  /** Catalogue systems drawn in full; the rest are dimmed, unlabelled and untappable. All when unset. */
  systems?: Set<string>
  /** Draws generated systems, loading the generation maps when first needed. */
  showGenerated?: boolean
  /** Pick mode returns generated systems only when set. */
  pickGenerated?: boolean
  onProblem?: (problemId: string) => void
  /** A tap on an overlay pin; `null` for a tap on empty space. */
  onPin?: (pinId: string | null) => void
  /** A tapped line label: the step its line leaves from. */
  onStep?: (step: number) => void
}

const PIN_FONT = '700 10px "JetBrains Mono", monospace'
const LABEL_FONT = '11px "JetBrains Mono", monospace'
const SYSTEM_LY = 2000
const GEN_MAX_LY = 10000
const FLASH_MS = 900
const DIMMED = 0.45
const round1 = (n: number) => Math.round(n * 10) / 10
const STATION_SYSTEMS = new Set(STATIONS.map((s) => s.system))
const fullMapUrl = (c: Camera) => `https://galaxy-genome.github.io/map/?at=${Math.round(c.cx)},${Math.round(c.cz)}&ly=${Math.round(acrossLy(c))}`

interface CatalogueDot { x: number; z: number; colour: string; name: string; rank: number }

/** The galaxy map canvas: grid, outline, catalogue systems, favorite mods' stars, generated systems when `showGenerated`, and the editor's layers for `mode`. */
export function StarMap(props: StarMapProps) {
  const t = useT()
  const { galaxy, maps } = useGalaxy()
  const wrap = React.useRef<HTMLDivElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const link = React.useRef<HTMLAnchorElement>(null)
  const propsRef = React.useRef(props)
  propsRef.current = props

  // Instance state: everything a frame reads that React does not need to render.
  const s = React.useRef({
    cam: null as Camera | null,
    dpr: 1,
    touch: typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches,
    calm: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    raf: 0,
    ptrs: new Map<number, { x: number; y: number }>(),
    pinch: null as null | { d: number; scale: number; wx: number; wz: number },
    drag: null as null | { x: number; y: number; cam: Camera; grab: Grab; moved: boolean },
    preview: null as null | { x: number; y: number; r?: number },
    flight: null as Flight | null,
    flightLast: 0,
    labels: new Labels(),
    generator: null as Generator | null,
    catalogue: [] as CatalogueDot[],
    layers: { mod: [] as Hit[], other: [] as Hit[], catalogue: [] as Hit[], generated: [] as Hit[] },
    badges: [] as { id: string; px: number; py: number }[],
    lineLabels: [] as { step: number; x: number; y: number; w: number; h: number }[],
    pins: [] as { id: string; px: number; py: number; w: number }[],
    selectedOther: null as Hit | null,
    pulseAt: 0,
    centre: { x: NaN, y: NaN },
  }).current

  // Frames run from requestAnimationFrame, so they read this render's closures through a ref.
  const frameRef = React.useRef(frame)
  frameRef.current = frame
  const invalidate = React.useCallback(() => {
    if (!s.raf) s.raf = requestAnimationFrame(() => frameRef.current())
  }, [s])

  // Real stars for the generator, and catalogue dots with the systems mods move taken out.
  React.useEffect(() => {
    if (!galaxy) return
    const { stars, otherStars = [] } = props
    const moved = new Set([...stars, ...otherStars].map((st) => st.name))
    const types = galaxy.data.types
    s.catalogue = galaxy.reachable.filter((r) => !moved.has(r[0])).map((r) => ({
      x: r[1], z: r[2], colour: types[r[3]][1], name: r[0], rank: r[1] === 0 && r[2] === 0 ? 0 : STATION_SYSTEMS.has(r[0]) ? 2 : 4,
    }))
    if (!props.showGenerated) { s.labels.resettle(); invalidate(); return }
    s.generator ??= new Generator(galaxy.data.starTable, galaxy.data.sectorAnchors)
    s.generator.setReal([...s.catalogue.map((d) => [d.x, d.z] as const), ...[...stars, ...otherStars].map((st) => [st.x, st.y] as const)])
    if (maps) s.generator.setMaps(maps.side, maps.zones)
    s.labels.resettle()
    invalidate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galaxy, maps, props.stars, props.otherStars, props.showGenerated])

  React.useEffect(() => { loadGalaxy().catch(() => {}) }, [])
  React.useEffect(() => { s.preview = null; invalidate() }, [props.stars, props.point, props.circle, props.centreCircle, props.problems, props.mode, props.overlay, props.selectedPin, props.systems, invalidate, s])
  React.useEffect(() => { if (props.selected) { s.pulseAt = performance.now(); invalidate() } }, [props.selected, invalidate, s])

  // Fly to a new focus; the first one only sets the view.
  const focusKey = props.focus ? `${props.focus.x},${props.focus.y},${props.focus.ly},${props.focus.seq}` : ''
  React.useEffect(() => {
    const f = propsRef.current.focus
    if (!f || !s.cam) return
    const scale = f.ly ? clampScale(s.cam.W, scaleFor(s.cam.W, f.ly)) : s.cam.scale
    if (s.calm) { s.cam = clampView({ ...s.cam, cx: f.x, cz: f.y, scale }); invalidate(); return }
    s.flight = flight(f.x, f.y, scale)
    s.flightLast = performance.now()
    invalidate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  /** The fit points, plus the pixels each overlay pin and label draws over and the outermost point of each bowed line. */
  const framing = (W: number): FitPoint[] | undefined => {
    const { fit, overlay: o } = propsRef.current
    const ctx = canvas.current?.getContext('2d')
    if (!fit || !o || !ctx) return fit
    ctx.save()
    const pins = o.pins.map((pin) => {
      ctx.font = PIN_FONT
      const w = Math.max(2 * PIN_R, ctx.measureText(pin.text).width + 8)
      ctx.font = LABEL_FONT
      // A label too long for the room a fit can give it wraps, so its box is the wrapped shape, not the whole line.
      const l = pin.label ? labelBox(ctx, pin.label, Math.max(1, W - 2 * FIT_PAD.x - w - 9)) : { w: 0, lines: 1 }
      return { x: pin.x, y: pin.y, box: { l: w / 2, r: w / 2 + (pin.label ? 9 + l.w : 0), t: PIN_R, b: PIN_R + (l.lines - 1) * 13 } }
    })
    ctx.restore()
    // A bend pulls the curve's control point off the straight leg; the curve reaches half that far.
    const bows = o.lines.filter((l) => l.bend).map((l) => {
      const dx = l.x2 - l.x1, dy = l.y2 - l.y1
      return { x: (l.x1 + l.x2) / 2 + dy * l.bend! / 2, y: (l.y1 + l.y2) / 2 - dx * l.bend! / 2 }
    })
    return [...fit, ...pins, ...bows]
  }

  const fitFrame = (W: number, H: number) => {
    const pts = framing(W)
    return pts && fitView(pts, W, H)
  }

  const fitTo = () => {
    const v = s.cam && fitFrame(s.cam.W, s.cam.H)
    if (!v || !s.cam) return
    if (s.calm) { s.cam = clampView({ ...s.cam, cx: v.x, cz: v.y, scale: v.scale }); invalidate(); return }
    s.flight = flight(v.x, v.y, v.scale)
    s.flightLast = performance.now()
    invalidate()
  }
  const fitKey = props.fit?.map((p) => `${p.x},${p.y},${p.r ?? 0}`).join(';') ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (s.cam) fitTo() }, [fitKey])

  // Canvas size follows the element, at devicePixelRatio capped at 2.
  React.useLayoutEffect(() => {
    const el = wrap.current!, cv = canvas.current!
    const resize = () => {
      const W = el.clientWidth, H = el.clientHeight
      if (W <= 0 || H <= 0) return
      s.dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = Math.round(W * s.dpr); cv.height = Math.round(H * s.dpr)
      if (!s.cam) {
        const f = propsRef.current.focus
        s.cam = clampView({ cx: f?.x ?? 0, cz: f?.y ?? 0, W, H, scale: clampScale(W, scaleFor(W, f?.ly ?? homeLy(s.touch))) })
        const v = fitFrame(W, H)
        if (v) s.cam = clampView({ ...s.cam, cx: v.x, cz: v.y, scale: v.scale })
      } else s.cam = { ...s.cam, W, H }
      frameRef.current()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    return () => { ro.disconnect(); cancelAnimationFrame(s.raf); s.raf = 0 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function frame() {
    s.raf = 0
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || !s.cam) return
    let again = false
    if (s.flight) {
      const now = performance.now()
      const step = flyStep(s.cam, s.flight, (now - s.flightLast) / 1000)
      s.flightLast = now
      s.cam = step.camera
      if (step.done) s.flight = null; else again = true
    }
    draw(ctx, s.cam)
    const { onCentre } = propsRef.current
    if (onCentre && (s.cam.cx !== s.centre.x || s.cam.cz !== s.centre.y)) { s.centre = { x: s.cam.cx, y: s.cam.cz }; onCentre(round1(s.cam.cx), round1(s.cam.cz)) }
    if (s.pulseAt && performance.now() - s.pulseAt < FLASH_MS) again = true
    if (again) invalidate()
  }

  function draw(ctx: CanvasRenderingContext2D, c: Camera) {
    const p = propsRef.current
    const g = galaxy
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
    ctx.fillStyle = '#04060e'
    ctx.fillRect(0, 0, c.W, c.H)
    s.labels.clear()
    drawGrid(ctx, c)
    if (g) drawOutline(ctx, c, g.data.outline)
    if (link.current) link.current.href = fullMapUrl(c)
    s.layers = { mod: [], other: [], catalogue: [], generated: [] }
    if (!g) return

    const r = dotSm(c)
    const catalogue = drawSystems(ctx, c, p.systems ? s.catalogue.filter((d) => p.systems!.has(d.name)) : s.catalogue, r)
    if (p.systems) drawSystems(ctx, c, s.catalogue.filter((d) => !p.systems!.has(d.name)), r, 0.2)
    for (const d of catalogue) {
      s.layers.catalogue.push({ kind: 'catalogue', name: d.name, x: d.x, y: d.z })
      if (c.scale > 4 || (c.scale > 2.2 && d.rank < 4)) s.labels.add({ px: sx(c, d.x), py: sy(c, d.z), rank: d.rank, key: d.name, text: d.name, colour: INK })
    }
    if (p.showGenerated) drawGenerated(ctx, c)

    const dim = p.mode === 'circle' ? DIMMED : 1
    const others = drawSystems(ctx, c, (p.otherStars ?? []).map((st) => ({ x: st.x, z: st.y, colour: g.colourOf(st.type), star: st })), DOT_R, DIMMED)
    for (const o of others) {
      s.layers.other.push({ kind: 'other', name: o.star.name, x: o.x, y: o.z })
      if (c.scale > 2.2) s.labels.add({ px: sx(c, o.x), py: sy(c, o.z), rank: 3, key: `other:${o.star.id}`, text: o.star.name, colour: 'rgba(188,219,230,.5)' })
    }
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,180,84,.55)'
    ctx.lineWidth = 1
    for (const st of [...(p.otherStars ?? []), ...p.stars]) {
      const from = g.byName.get(st.name)
      if (!from) continue
      const at = draggedStar(st)
      ctx.beginPath(); ctx.moveTo(sx(c, from[1]), sy(c, from[2])); ctx.lineTo(sx(c, at.x), sy(c, at.y)); ctx.stroke()
    }
    ctx.restore()

    // This mod's stars: bright dot, cyan ring, always labelled.
    s.badges = []
    const worst = new Map<string, MapProblem>()
    for (const pr of p.problems ?? []) if (!worst.has(pr.starId) || (pr.severity === 'warning' && worst.get(pr.starId)!.severity === 'tip')) worst.set(pr.starId, pr)
    ctx.globalAlpha = dim
    for (const st of p.stars) {
      const at = draggedStar(st)
      const px = sx(c, at.x), py = sy(c, at.y)
      s.layers.mod.push({ kind: 'mod', name: st.name, x: at.x, y: at.y, id: st.id })
      if (px < -60 || px > c.W + 60 || py < -60 || py > c.H + 60) continue
      const on = st.id === p.selected
      ctx.strokeStyle = '#35e0f5'; ctx.lineWidth = on ? 1.6 : 1.2
      ctx.beginPath(); ctx.arc(px, py, 7, 0, 6.283); ctx.stroke()
      ctx.fillStyle = g.colourOf(st.type)
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 6.283); ctx.fill()
      s.labels.add({ px, py, rank: on ? -3 : -2, key: `mod:${st.id}`, text: st.name || t('stars.untitledStar'), colour: on ? '#35e0f5' : '#ffffff' })
      const pr = worst.get(st.id)
      if (pr && p.mode === 'edit') {
        const bx = px + 8, by = py - 8
        ctx.fillStyle = pr.severity === 'warning' ? '#ffab3d' : '#35e0f5'
        ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, 6.283); ctx.fill()
        ctx.fillStyle = '#04060e'; ctx.font = '700 9px "JetBrains Mono", monospace'
        ctx.fillText('!', bx - 2.5, by + 3.2)
        s.badges.push({ id: pr.id, px: bx, py: by })
      }
    }
    ctx.globalAlpha = 1

    if (p.overlay) drawOverlay(ctx, c, p.overlay, p.selectedPin)

    if (p.mode === 'point' && p.point) {
      const at = s.preview && s.drag?.grab.kind === 'point' ? s.preview : p.point
      const px = sx(c, at.x), py = sy(c, at.y)
      ctx.strokeStyle = '#35e0f5'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(px, py, 10, 0, 6.283); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(px - 16, py); ctx.lineTo(px - 5, py); ctx.moveTo(px + 5, py); ctx.lineTo(px + 16, py)
      ctx.moveTo(px, py - 16); ctx.lineTo(px, py - 5); ctx.moveTo(px, py + 5); ctx.lineTo(px, py + 16); ctx.stroke()
      s.labels.claim(px - 16, py + 4, 32)
    }
    if (p.mode === 'circle' && p.circle) {
      const cc = currentCircle()!
      const px = sx(c, cc.x), py = sy(c, cc.y), rp = cc.r * c.scale
      ctx.fillStyle = 'rgba(255,180,84,.07)'; ctx.strokeStyle = '#ffb454'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(px, py, Math.max(rp, 0.5), 0, 6.283); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#ffb454'
      ctx.beginPath(); ctx.arc(px, py, 6, 0, 6.283); ctx.fill()
      ctx.fillStyle = '#04060e'; ctx.strokeStyle = '#ffb454'
      ctx.beginPath(); ctx.rect(px + rp - 5, py - 5, 10, 10); ctx.fill(); ctx.stroke()
      s.labels.claim(px - 8, py + 4, 16)
    }

    if (p.centreCircle !== undefined) {
      const px = c.W / 2, py = c.H / 2, rp = p.centreCircle * c.scale
      ctx.fillStyle = 'rgba(255,180,84,.07)'; ctx.strokeStyle = '#ffb454'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(px, py, Math.max(rp, 0.5), 0, 6.283); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(px - 14, py); ctx.lineTo(px - 4, py); ctx.moveTo(px + 4, py); ctx.lineTo(px + 14, py)
      ctx.moveTo(px, py - 14); ctx.lineTo(px, py - 4); ctx.moveTo(px, py + 4); ctx.lineTo(px, py + 14); ctx.stroke()
    }

    const sel = p.selected ? s.layers.mod.find((m) => m.id === p.selected) : s.selectedOther
    if (sel) {
      const px = sx(c, sel.x), py = sy(c, sel.y)
      const tt = s.pulseAt ? (performance.now() - s.pulseAt) / FLASH_MS : 1
      const a = tt >= 1 ? 1 : s.calm ? 1 : 0.4 + 0.6 * Math.abs(Math.cos(tt * Math.PI))
      ctx.save()
      ctx.strokeStyle = '#35e0f5'; ctx.lineWidth = 1.6
      ctx.globalAlpha = a
      ctx.beginPath(); ctx.arc(px, py, 14, 0, 6.283); ctx.stroke()
      ctx.globalAlpha = a * 0.4
      ctx.beginPath(); ctx.arc(px, py, 22 + (1 - a) * 6, 0, 6.283); ctx.stroke()
      ctx.restore()
      if (!p.selected) s.labels.add({ px, py, rank: -1, key: `sel:${sel.name}`, text: sel.name, colour: '#35e0f5' })
    }
    s.labels.draw(ctx, c)
  }

  function drawOverlay(ctx: CanvasRenderingContext2D, c: Camera, o: MapOverlay, selectedPin: string | null | undefined) {
    const off = (px: number, py: number, pad: number) => px < -pad || px > c.W + pad || py < -pad || py > c.H + pad
    ctx.save()
    for (const a of o.areas) {
      const px = sx(c, a.x), py = sy(c, a.y), rp = Math.max(a.r * c.scale, 6)
      if (off(px, py, rp + 40)) continue
      ctx.globalAlpha = a.dim ? 0.35 : 1
      ctx.setLineDash([5, 4])
      ctx.fillStyle = `${a.colour}14`; ctx.strokeStyle = a.colour; ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.arc(px, py, rp, 0, 6.283); ctx.fill(); ctx.stroke()
    }
    ctx.setLineDash([])
    // Pins too close to read fan out around their places; lines join the displayed pins.
    ctx.font = PIN_FONT
    const placed = o.pins.map((pin) => ({ pin, px: sx(c, pin.x), py: sy(c, pin.y), w: Math.max(2 * PIN_R, ctx.measureText(pin.text).width + 8) }))
    const shown = fanPins(placed)
    const at = new Map(placed.map((p, i) => [`${p.pin.x},${p.pin.y}`, shown[i]]))
    // Pins claim their ground, short of the grid cell where their own name starts, before any line label or system name.
    placed.forEach((p, i) => { if (!off(p.px, p.py, 60)) s.labels.claim(shown[i].x - p.w / 2, shown[i].y + 4, p.w - 6) })
    const screen = (x: number, y: number) => at.get(`${x},${y}`) ?? { x: sx(c, x), y: sy(c, y) }
    s.lineLabels = []
    for (const l of o.lines) {
      const { x: ax, y: ay } = screen(l.x1, l.y1), { x: bx, y: by } = screen(l.x2, l.y2)
      const len = Math.hypot(bx - ax, by - ay)
      if (Math.max(ax, bx) < -40 || Math.min(ax, bx) > c.W + 40 || Math.max(ay, by) < -40 || Math.min(ay, by) > c.H + 40) continue
      ctx.globalAlpha = l.dim ? 0.3 : 1
      ctx.strokeStyle = l.colour; ctx.fillStyle = l.colour; ctx.lineWidth = l.width ?? 1.5
      ctx.setLineDash(l.dash ? [5, 4] : [])
      let mx: number, my: number, tx: number, ty: number, ex: number, ey: number
      if (len < 2 * PIN_R + 4) {
        // Both ends on one place: a small loop above the pin.
        const k = 1 + (l.bend ?? 0) * 4
        const cx0 = ax, cy0 = ay - PIN_R - 7 * k
        ctx.beginPath(); ctx.arc(cx0, cy0, 7 * k, 0.75 * Math.PI, 2.25 * Math.PI); ctx.stroke()
        mx = cx0; my = cy0 - 7 * k; ex = cx0 + 7 * k * Math.cos(2.25 * Math.PI); ey = cy0 + 7 * k * Math.sin(2.25 * Math.PI); tx = -1; ty = 1
      } else {
        const ux = (bx - ax) / len, uy = (by - ay) / len
        const bend = (l.bend ?? 0) * len
        const qx = (ax + bx) / 2 - uy * bend, qy = (ay + by) / 2 + ux * bend
        const trim = (fx: number, fy: number, toX: number, toY: number) => { const d = Math.hypot(toX - fx, toY - fy) || 1; return [fx + (toX - fx) / d * (PIN_R + 2), fy + (toY - fy) / d * (PIN_R + 2)] }
        const [sx0, sy0] = trim(ax, ay, qx, qy)
        ;[ex, ey] = trim(bx, by, qx, qy)
        ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.quadraticCurveTo(qx, qy, ex, ey); ctx.stroke()
        mx = 0.25 * ax + 0.5 * qx + 0.25 * bx; my = 0.25 * ay + 0.5 * qy + 0.25 * by
        tx = ex - qx; ty = ey - qy
      }
      if (l.arrow) {
        const d = Math.hypot(tx, ty) || 1, ux = tx / d, uy = ty / d
        ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * 7 - uy * 4, ey - uy * 7 + ux * 4); ctx.lineTo(ex - ux * 7 + uy * 4, ey - uy * 7 - ux * 4); ctx.closePath(); ctx.fill()
      }
      if (l.label && !l.dim) {
        ctx.font = '10px "JetBrains Mono", monospace'
        const w = ctx.measureText(l.label).width
        if (s.labels.claim(mx - w / 2 - 3, my + 4, w + 6)) {
          if (l.step !== undefined) s.lineLabels.push({ step: l.step, x: mx - w / 2 - 3, y: my - 6, w: w + 6, h: 13 })
          ctx.setLineDash([])
          ctx.fillStyle = 'rgba(4,6,14,.85)'
          ctx.beginPath(); ctx.roundRect(mx - w / 2 - 3, my - 6, w + 6, 13, 2); ctx.fill()
          ctx.fillStyle = l.colour
          ctx.fillText(l.label, mx - w / 2, my + 3.5)
        }
      }
    }
    ctx.setLineDash([])
    s.pins = []
    ctx.font = PIN_FONT
    // Every place keeps a dot where it really is; a fanned pin draws a leader back to it.
    for (const [i, { pin, px, py }] of placed.entries()) {
      if (off(px, py, 60)) continue
      ctx.globalAlpha = pin.dim ? 0.35 : 1
      ctx.strokeStyle = pin.colour; ctx.fillStyle = pin.colour; ctx.lineWidth = 1
      if (shown[i].fanned) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(shown[i].x, shown[i].y); ctx.stroke() }
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, 6.283); ctx.fill()
      s.labels.claim(px - 4, py + 4, 8)
    }
    for (const [i, { pin, w, px: tx, py: ty }] of placed.entries()) {
      if (off(tx, ty, 60)) continue
      const { x: px, y: py } = shown[i]
      const on = pin.id === selectedPin
      ctx.globalAlpha = pin.dim ? 0.35 : 1
      if (pin.ring) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, w / 2 + 4, 0, 6.283); ctx.stroke() }
      ctx.fillStyle = pin.colour
      ctx.beginPath(); ctx.roundRect(px - w / 2, py - PIN_R, w, 2 * PIN_R, PIN_R)
      if (pin.hollow) { ctx.fillStyle = '#04060e'; ctx.fill(); ctx.strokeStyle = on ? '#ffffff' : pin.colour; ctx.lineWidth = on ? 2 : 1.2; ctx.stroke(); ctx.fillStyle = pin.colour }
      else {
        ctx.fill()
        if (on) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke() }
        ctx.fillStyle = '#04060e'
      }
      ctx.fillText(pin.text, px - ctx.measureText(pin.text).width / 2, py + 3.5)
      if (pin.problem) {
        const bx = px + w / 2, by = py - PIN_R
        ctx.fillStyle = '#ffab3d'; ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, 6.283); ctx.fill()
        ctx.fillStyle = '#04060e'; ctx.font = '700 9px "JetBrains Mono", monospace'; ctx.fillText('!', bx - 2.5, by + 3.2)
        ctx.font = PIN_FONT
      }
      if (pin.label && !pin.dim) s.labels.add({ px: px + w / 2 + 9, py, rank: on ? -3 : -2, key: `pin:${pin.id}`, pill: true, text: pin.label, colour: on ? '#ffffff' : '#ffb454', always: !pin.hollow, leftOf: px - w / 2 - 9 })
      if (!pin.dim) s.pins.push({ id: pin.id, px, py, w })
    }
    ctx.restore()
  }

  function drawGenerated(ctx: CanvasRenderingContext2D, c: Camera) {
    const gen = s.generator
    if (!gen || c.scale < c.W / GEN_MAX_LY) return
    if (!gen.side) { loadGeneration().catch(() => {}); return }
    const pad = 40
    const x0 = Math.floor(wxOf(c, -pad) / CELL_LY + 1025), x1 = Math.ceil(wxOf(c, c.W + pad) / CELL_LY + 1025)
    const y0 = Math.floor(1591 - wzOf(c, -pad) / CELL_LY), y1 = Math.ceil(1591 - wzOf(c, c.H + pad) / CELL_LY)
    if ((x1 - x0) * (y1 - y0) > 60000) return
    const share = Math.min(1, (SYSTEM_LY / acrossLy(c)) ** 2 / 4)
    const side = gen.side
    const spread = (st: GeneratedStar) => {
      if (share >= 1 || st.at) return
      const h = mix(st.seed)
      const cx0 = Math.floor(st.x / CELL_LY + 1025), cy0 = Math.floor(1591 - st.z / CELL_LY)
      st.at = [((cx0 + (h & 0xFFFF) / 65536) - 1025) * CELL_LY, (1591 - (cy0 + ((h >>> 16) & 0xFFFF) / 65536)) * CELL_LY]
    }
    function* cells() {
      for (let cy = Math.max(0, y0); cy <= Math.min(GRID - 1, y1); cy++) {
        for (let cx = Math.max(0, x0); cx <= Math.min(GRID - 1, x1); cx++) {
          if (share < 1) {
            const n = share * side[cy * GRID + cx] ** 2
            if (n < 1 && mix(Math.imul(cx, 374761393) + Math.imul(cy, 668265263)) / 4294967296 > n) continue
          }
          for (const st of gen!.cellStars(cx, cy, share)) {
            spread(st)
            const [x, z] = st.at && share < 1 ? st.at : [st.x, st.z]
            yield { x, z, colour: st.colour, st }
          }
        }
      }
    }
    const kept = drawSystems(ctx, c, cells(), dotSm(c))
    for (const { st } of kept) {
      if (share >= 1) s.layers.generated.push({ kind: 'generated', name: st.name, x: st.x, y: st.z })
      if (c.scale > 4) s.labels.add({ px: sx(c, st.x), py: sy(c, st.z), rank: 4, key: st.name, text: st.name, colour: INK })
    }
  }

  function draggedStar(st: Star) {
    return s.preview && s.drag?.grab.kind === 'star' && s.drag.grab.id === st.id ? s.preview : { x: st.x, y: st.y }
  }
  function currentCircle(): Circle | undefined {
    const c = propsRef.current.circle
    if (!c) return undefined
    const g = s.drag?.grab.kind
    return s.preview && (g === 'centre' || g === 'ring') ? { x: s.preview.x, y: s.preview.y, r: s.preview.r ?? c.r } : c
  }

  /* ---------- input ---------- */

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!s.cam) return
    s.flight = null
    const at = local(e)
    s.ptrs.set(e.pointerId, at)
    try { canvas.current!.setPointerCapture(e.pointerId) } catch { /* synthetic pointers have no capture */ }
    if (s.ptrs.size === 2) {
      s.drag = null; s.preview = null
      const [a, b] = [...s.ptrs.values()]
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      s.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: s.cam.scale, wx: wxOf(s.cam, mx), wz: wzOf(s.cam, my) }
      invalidate()
    } else if (s.ptrs.size === 1) {
      const p = propsRef.current
      const grab: Grab = p.readOnly ? { kind: 'pan' } : grabAt(p.mode, s.cam, at.x, at.y, { stars: s.layers.mod, point: p.point, circle: p.circle, touch: s.touch })
      s.drag = { x: at.x, y: at.y, cam: s.cam, grab, moved: false }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!s.ptrs.has(e.pointerId) || !s.cam) return
    const at = local(e)
    s.ptrs.set(e.pointerId, at)
    if (s.pinch && s.ptrs.size >= 2) {
      const [a, b] = [...s.ptrs.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (!d) return
      s.cam = pinchTo(s.cam, s.pinch, d, (a.x + b.x) / 2, (a.y + b.y) / 2)
      invalidate()
      return
    }
    const drag = s.drag
    if (!drag) return
    const dx = at.x - drag.x, dy = at.y - drag.y
    if (Math.abs(dx) + Math.abs(dy) > slop(s.touch)) drag.moved = true
    if (!drag.moved) return
    if (drag.grab.kind === 'pan') s.cam = panBy({ ...drag.cam, W: s.cam.W, H: s.cam.H, scale: s.cam.scale }, dx, dy)
    else s.preview = dragTo(drag.grab, worldAt(s.cam, at.x, at.y), propsRef.current.circle)
    invalidate()
  }

  const onPointerEnd = (e: React.PointerEvent) => {
    if (!s.ptrs.has(e.pointerId)) return
    const many = s.ptrs.size > 1 || !!s.pinch
    s.ptrs.delete(e.pointerId)
    if (s.ptrs.size < 2) s.pinch = null
    const drag = s.drag
    s.drag = null
    const cam = s.cam
    const p = propsRef.current
    if (!drag || !cam) return
    if (e.type === 'pointercancel' || many) { s.preview = null; invalidate(); return }
    if (drag.moved) {
      const v = s.preview
      s.preview = null
      invalidate()
      if (!v) return
      if (drag.grab.kind === 'star') p.onMove?.(drag.grab.id, round1(v.x), round1(v.y))
      else if (drag.grab.kind === 'point') p.onPoint?.(round1(v.x), round1(v.y))
      else if (drag.grab.kind === 'centre' || drag.grab.kind === 'ring') p.onCircle?.(Math.round(v.x), Math.round(v.y), Math.max(0, Math.round(v.r ?? 0)))
      return
    }
    const at = local(e)
    if (p.mode === 'edit') {
      const badge = s.badges.find((b) => Math.hypot(b.px - at.x, b.py - at.y) < (s.touch ? 14 : 9))
      if (badge) { p.onProblem?.(badge.id); return }
    }
    if (p.overlay && p.onStep) {
      const slop = s.touch ? 8 : 3
      const hitLabel = s.lineLabels.find((b) => at.x >= b.x - slop && at.x <= b.x + b.w + slop && at.y >= b.y - slop && at.y <= b.y + b.h + slop)
      if (hitLabel) { p.onStep(hitLabel.step); invalidate(); return }
    }
    if (p.overlay && p.onPin) {
      let best: string | null = null, bd = (s.touch ? 22 : 14) ** 2
      // A pin's whole badge is its target: distance is measured to the badge's edge, so a long `4·5·6·…` badge taps anywhere along it.
      for (const pin of s.pins) {
        const dx = Math.max(0, Math.abs(pin.px - at.x) - pin.w / 2), dy = Math.max(0, Math.abs(pin.py - at.y) - PIN_R)
        const d = dx ** 2 + dy ** 2
        if (d < bd || (d === 0 && bd > 0)) { bd = d; best = pin.id }
      }
      p.onPin(best)
      if (best) { invalidate(); return }
    }
    const hit = pick(cam, at.x, at.y, p.mode === 'pick' && !p.pickGenerated ? { ...s.layers, generated: [] } : s.layers, s.touch)
    const action = tapAction(p.mode, hit, worldAt(cam, at.x, at.y), p.circle)
    s.selectedOther = null
    switch (action.kind) {
      case 'add': if (!p.readOnly) p.onAdd?.(round1(action.x), round1(action.y)); break
      case 'open': p.onOpen?.(action.id); break
      case 'select': s.selectedOther = action.hit; s.pulseAt = performance.now(); break
      case 'point': if (!p.readOnly) p.onPoint?.(round1(action.x), round1(action.y)); break
      case 'circle': p.onCircle?.(Math.round(action.x), Math.round(action.y), Math.round(action.r)); break
      case 'pick': p.onPick?.(action.name); break
    }
    invalidate()
  }

  React.useEffect(() => {
    const cv = canvas.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (!s.cam) return
      s.flight = null
      const at = local(e)
      s.cam = zoomAt(s.cam, at.x, at.y, s.cam.scale * Math.exp(-e.deltaY * 0.0016))
      invalidate()
    }
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => cv.removeEventListener('wheel', onWheel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const zoomStep = (f: number) => {
    if (!s.cam) return
    const base = s.flight ? Math.exp(s.flight.to[2]) : s.cam.scale
    const [x, z] = s.flight ? [s.flight.to[0], s.flight.to[1]] : [s.cam.cx, s.cam.cz]
    const scale = clampScale(s.cam.W, base * f)
    if (s.calm) { s.cam = clampView({ ...s.cam, cx: x, cz: z, scale }); invalidate(); return }
    s.flight = flight(x, z, scale, 4)
    s.flightLast = performance.now()
    invalidate()
  }

  return (
    <div ref={wrap} className={cn('relative overflow-hidden bg-void', props.className)}>
      <canvas
        ref={canvas}
        role="application"
        aria-label={t(`map.aria_${props.mode}`)}
        className="absolute inset-0 size-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!galaxy && <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center font-mono text-[12px] text-dim">{t('map.loading')}</p>}
      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-[2px] border border-edge bg-deep/90">
        <button type="button" aria-label={t('map.zoomIn')} onClick={() => zoomStep(1.6)} className="grid size-11 place-items-center text-ink hover:text-cyan"><Plus className="size-4" /></button>
        <button type="button" aria-label={t('map.zoomOut')} onClick={() => zoomStep(1 / 1.6)} className="grid size-11 place-items-center border-t border-edge text-ink hover:text-cyan"><Minus className="size-4" /></button>
        {props.fit && <button type="button" aria-label={t('map.fit')} title={t('map.fit')} onClick={fitTo} className="grid size-11 place-items-center border-t border-edge text-ink hover:text-cyan"><Maximize className="size-4" /></button>}
      </div>
      <a ref={link} href="https://galaxy-genome.github.io/map/" target="_blank" rel="noreferrer"
        className="absolute bottom-7 right-2 rounded-[2px] bg-deep/80 px-2 py-1 text-[12px] text-cyan hover:underline">
        {t('map.openFullMap')}<span aria-hidden> ↗</span>
      </a>
    </div>
  )
}
