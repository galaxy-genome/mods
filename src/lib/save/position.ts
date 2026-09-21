/** The save's place on the galaxy map: `PlayerInfo.secXf`/`secYf`
 * (`system/Save/PlayerInfo.as:12-14`, written as two doubles at `:27-28`).
 *
 * The save holds map pixels. Every system's coordinates are light years from Sol, and the two
 * conversions are the game's own: `GalaxyMap.as:332` pixels from light years across,
 * `GalaxyMap.as:342` down, both against `yearsInPixel` (`GalaxyMap.as:76`) and Sol at
 * `startX`/`startY` (`GalaxyMap.as:78-80`). Loading calls `Init(secXf, secYf)`
 * (`Game.as:1578`), which selects the star nearest that point.
 */
import { AmfObject, PLAYER, SCAN, type AmfVector, type ExtField, type Save } from './codec'

export const LY_PER_PIXEL = 43.74
export const SOL_X = 1025, SOL_Y = 1591

/** Light years from Sol, on the two axes the map draws (`map_x`, `map_z`). */
export interface Position { x: number; z: number }

const player = (sv: Save) => sv.objs[PLAYER] as AmfObject

const double = (n: number) => {
  const v = new DataView(new ArrayBuffer(8))
  v.setFloat64(0, n)
  return new Uint8Array(v.buffer)
}

const u32 = (n: number) => {
  const v = new DataView(new ArrayBuffer(4))
  v.setUint32(0, n >>> 0)
  return new Uint8Array(v.buffer)
}

const readDouble = (o: AmfObject, i: number) => {
  const b = o.raw[i][1] as Uint8Array
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat64(0)
}

/** The stored pixel pair, as the game writes it. */
export function getPixels(sv: Save): { x: number; y: number } {
  const p = player(sv)
  return { x: readDouble(p, 0), y: readDouble(p, 1) }
}

export function getPosition(sv: Save): Position {
  const { x, y } = getPixels(sv)
  return { x: (x - SOL_X) * LY_PER_PIXEL, z: (SOL_Y - y) * LY_PER_PIXEL }
}

export function setPosition(sv: Save, at: Position) {
  const p = player(sv)
  p.raw[0] = ['D', double(at.x / LY_PER_PIXEL + SOL_X)]
  p.raw[1] = ['D', double(SOL_Y - at.z / LY_PER_PIXEL)]
}

/**
 * The map cell a point falls in, as `"x,y"`.
 *
 * `ScanData` records a scan against a cell of the pixel grid, not against a system: a
 * `VisitedStarSystem.systemId` packs the cell in its upper bits and a planet in its lowest
 * eight (`GalaxyMap.as:252-258`), and the cell is the floor of the star's pixel position
 * (`GalaxyMap.as:2516`). One cell is `LY_PER_PIXEL` light years across and holds many systems,
 * which is the resolution the game's own map filter draws scans at
 * (`ui/screens/MAP_FILTER_SCREEN.as:188-191`).
 */
export function cellOf(at: Position): string {
  return `${Math.floor(at.x / LY_PER_PIXEL + SOL_X)},${Math.floor(SOL_Y - at.z / LY_PER_PIXEL)}`
}

/** Every cell `ScanData.Visited` or `ScanData.FreshData` holds (`system/Save/ScanData.as:13-17`). */
export function visitedCells(sv: Save): Set<string> {
  const scan = sv.objs[SCAN] as AmfObject
  const out = new Set<string>()
  for (const i of [0, 1]) {
    for (const item of (scan.raw[i][1] as AmfVector).items) {
      const b = (item as AmfObject).raw[0][1] as Uint8Array
      const id = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0)
      out.add(`${(id >>> 20) & 0xfff},${(id >>> 8) & 0xfff}`)
    }
  }
  return out
}

/** How many systems the save has scanned data for, the figure the home card shows. */
export function scannedCount(sv: Save): number {
  const scan = sv.objs[SCAN] as AmfObject
  return (scan.raw[0][1] as AmfVector).items.length + (scan.raw[1][1] as AmfVector).items.length
}

/** `VisitedStarSystem.GetSystemID` (`system/Save/VisitedStarSystem.as:21-27`): the cell in the
 * upper bits and the planet in the lowest eight. */
export const systemId = (cellX: number, cellY: number, planet = 0) =>
  ((((cellX & 0xfff) << 20) >>> 0) + ((cellY & 0xfff) << 8) + (planet & 0xff)) >>> 0

/** Records a cell as explored, with every planet discovered and scanned: `discovered` and
 * `scanned` are per-planet bit masks (`ui/inGameUI.as:3237`, `:3282`), and `ScanData.Visited`
 * is what the map filter draws from (`ui/screens/MAP_FILTER_SCREEN.as:184-191`).
 */
export function markExplored(sv: Save, at: Position): boolean {
  const cell = cellOf(at)
  if (visitedCells(sv).has(cell)) return false
  const [x, y] = cell.split(',').map(Number)
  const entry = new AmfObject('VisitedStarSystem', false, true)
  entry.raw = [['u', u32(systemId(x, y))], ['u', u32(0xffffffff)], ['u', u32(0xffffffff)]] as ExtField[]
  ;((sv.objs[SCAN] as AmfObject).raw[0][1] as AmfVector).items.push(entry)
  return true
}
