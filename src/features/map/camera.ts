// View state and projection, from the published map's renderer (tools/port/starmap_js.js). World units are light years,
// Sol at 0, 0; `cz` and world `z` are a star's `y`, growing toward the top of the screen.

export const GRID = 2048
export const CELL_LY = 43.74

export interface Camera {
  cx: number
  cz: number
  /** Pixels per light year. */
  scale: number
  W: number
  H: number
}

export const sx = (c: Camera, wx: number) => (wx - c.cx) * c.scale + c.W / 2
export const sy = (c: Camera, wz: number) => (c.cz - wz) * c.scale + c.H / 2
export const wxOf = (c: Camera, px: number) => (px - c.W / 2) / c.scale + c.cx
export const wzOf = (c: Camera, py: number) => c.cz - (py - c.H / 2) / c.scale

export const acrossLy = (c: Camera) => c.W / c.scale
export const scaleFor = (W: number, lyAcross: number) => W / lyAcross

/** Light years across the view at home zoom; a phone starts closer in. */
export const homeLy = (touch: boolean) => (touch ? 75 : 150)

const MAX_OUT_LY = 200000
export const clampScale = (W: number, v: number) => Math.max(W / MAX_OUT_LY, Math.min(v, 40))

const WORLD = { x0: -1025 * CELL_LY, x1: (GRID - 1 - 1025) * CELL_LY, z0: (1591 - (GRID - 1)) * CELL_LY, z1: 1591 * CELL_LY }
export function clampView(c: Camera): Camera {
  return { ...c, cx: Math.min(WORLD.x1, Math.max(WORLD.x0, c.cx)), cz: Math.min(WORLD.z1, Math.max(WORLD.z0, c.cz)) }
}

export const cellOf = (x: number, z: number): [number, number] => [Math.floor(x / CELL_LY + 1025), Math.floor(-z / CELL_LY + 1591)]

/** Grid spacing: the cell lattice halved or doubled so every line sits on a cell boundary, about 120 px apart. */
export function gridStep(scale: number) {
  const target = 120 / scale
  return CELL_LY * Math.pow(2, Math.ceil(Math.log2(target / CELL_LY)))
}

/** Zoom about a screen point: the world point under it holds still. */
export function zoomAt(c: Camera, px: number, py: number, scale: number): Camera {
  const wx = wxOf(c, px), wz = wzOf(c, py)
  const s = clampScale(c.W, scale)
  return clampView({ ...c, scale: s, cx: wx - (px - c.W / 2) / s, cz: wz + (py - c.H / 2) / s })
}

/** Pan so the world point grabbed at `start` sits under the pointer. */
export function panBy(start: Camera, dx: number, dy: number): Camera {
  return clampView({ ...start, cx: start.cx - dx / start.scale, cz: start.cz + dy / start.scale })
}

/** Two-finger pinch: scale by the spread ratio, holding the world point first under the midpoint under the new midpoint. */
export function pinchTo(c: Camera, p: { d: number; scale: number; wx: number; wz: number }, d: number, mx: number, my: number): Camera {
  const scale = clampScale(c.W, p.scale * d / p.d)
  return clampView({ ...c, scale, cx: p.wx - (mx - c.W / 2) / scale, cz: p.wz + (my - c.H / 2) / scale })
}

// A critically damped spring toward the target, zoom in log space. The view retreats quickly and closes in slowly, so a
// long flight crosses zoomed out.
const FLY_TAU = 0.18
const FLY_TAU_OUT = FLY_TAU * 0.6
const FLY_TAU_IN = FLY_TAU * 3

export interface Flight { to: [number, number, number]; v: [number, number, number]; speed: number }

export const flight = (x: number, z: number, scale: number, speed = 1): Flight => ({ to: [x, z, Math.log(scale)], v: [0, 0, 0], speed })

/** One spring step of `dt` seconds. Returns the new camera and whether the flight has landed. */
export function flyStep(c: Camera, f: Flight, dt: number): { camera: Camera; done: boolean } {
  dt = Math.min(0.05, dt)
  const at = [c.cx, c.cz, Math.log(c.scale)]
  const zoomingIn = f.to[2] > at[2]
  let rest = 0
  for (let i = 0; i < 3; i++) {
    const w = f.speed / (i < 2 ? FLY_TAU : zoomingIn ? FLY_TAU_IN : FLY_TAU_OUT)
    const d = at[i] - f.to[i]
    f.v[i] = (f.v[i] - w * w * d * dt) / (1 + 2 * w * dt + w * w * dt * dt)
    at[i] += f.v[i] * dt
    rest = Math.max(rest, Math.abs(at[i] - f.to[i]) / (i === 2 ? 0.0005 : 0.5 / c.scale))
  }
  if (rest <= 1) return { camera: clampView({ ...c, cx: f.to[0], cz: f.to[1], scale: clampScale(c.W, Math.exp(f.to[2])) }), done: true }
  return { camera: clampView({ ...c, cx: at[0], cz: at[1], scale: Math.exp(at[2]) }), done: false }
}
