/** Galaxy Genome save codec: both containers and the AMF3 subset the game writes.
 *
 * Port of `tools/bin/gg_save.py`, which stays the oracle. See `save-format.md`.
 */

/** Externalizable classes and their `writeExternal` order.
 * U=writeUTF, D=double, I=int, u=unsignedInt, B=boolean, s=short, b=byte, O=nested writeObject. */
export const EXT: Record<string, string> = {
  PlayerInfo: 'DD',
  ScanData: 'OOO',
  VisitedStarSystem: 'uuu',
  CargoData: 'uOOOO',
  ShipData: 'UUOu',
  ModulesStorage: 'OO',
  Module: 'UUDIssBDDBBBu',
  ProgressData: 'OOOOIIDDD',
  StationProgressData: 'UD',
  SystemProgressData: 'UD',
  MissionCard: 'UIDUDUUUUIUUBIIBD',
  Voucher: 'UDU',
  ExtraData: 'b'.repeat(32) + 'bbbbuDuuuuBBBBUUUU', // 32 material counts, one byte each
  QuestsSave: 'DOO',
  QuestSaveData: 'uBIu',
  OwnStationData: 'UUDDDuuu' + 'O'.repeat(8) + 'u'.repeat(19) + 'D' + 'O'.repeat(4),
  ExtraData2: 'UUUUUUIIDDDDD',
}

/** Fixed byte width per field code; `U` is length-prefixed and `O` is a nested value. */
const WIDTH: Record<string, number> = { D: 8, I: 4, u: 4, s: 2, b: 1, B: 1 }

/** An AMF3 double. Wrapped so a whole-numbered double keeps its marker on re-encode. */
export class AmfDouble {
  v: number
  constructor(v: number) { this.v = v }
}

export type ExtField = [code: string, bytes: Uint8Array] | ['O', value: AmfValue]

export class AmfObject {
  cls: string
  dynamic: boolean
  ext: boolean
  /** Sealed members, in trait order. */
  fields = new Map<string, AmfValue>()
  /** Dynamic members, in write order. */
  extra = new Map<string, AmfValue>()
  /** Externalizable payload, one entry per code in `EXT[cls]`. */
  raw: ExtField[] = []
  constructor(cls = '', dynamic = false, ext = false) { this.cls = cls; this.dynamic = dynamic; this.ext = ext }
}

export type VecKind = 'int' | 'uint' | 'double' | 'object'

export class AmfVector {
  kind: VecKind
  items: AmfValue[]
  fixed: boolean
  cls: string
  constructor(kind: VecKind, items: AmfValue[] = [], fixed = true, cls = '') {
    this.kind = kind; this.items = items; this.fixed = fixed; this.cls = cls
  }
}

/** ECMA array: associative pairs then dense entries. */
export class AmfArray {
  assoc: [string, AmfValue][] = []
  dense: AmfValue[] = []
}

export type AmfValue =
  | null | boolean | number | string | Uint8Array
  | AmfDouble | AmfObject | AmfVector | AmfArray

const VEC_MARKER: Record<VecKind, number> = { int: 0x0d, uint: 0x0e, double: 0x0f, object: 0x10 }
const VEC_KIND: Record<number, VecKind> = { 0x0d: 'int', 0x0e: 'uint', 0x0f: 'double', 0x10: 'object' }

class Reader {
  d: Uint8Array
  view: DataView
  i = 0
  strings: string[] = []
  objects: unknown[] = []
  traits: [cls: string, names: string[], dyn: boolean, ext: boolean][] = []
  constructor(d: Uint8Array) { this.d = d; this.view = new DataView(d.buffer, d.byteOffset, d.byteLength) }

  u8() { return this.d[this.i++] }

  u29() {
    let n = 0
    for (let k = 0; k < 3; k++) {
      const b = this.u8()
      n = (n << 7) | (b & 0x7f)
      if (!(b & 0x80)) return n >>> 0
    }
    return (((n << 8) | this.u8()) >>> 0)
  }

  str(): string {
    const h = this.u29()
    if (!(h & 1)) return this.strings[h >> 1]
    const n = h >> 1
    const s = new TextDecoder().decode(this.d.subarray(this.i, this.i + n))
    this.i += n
    if (s) this.strings.push(s)
    return s
  }

  take(n: number) { const b = this.d.subarray(this.i, this.i + n); this.i += n; return b }

  value(): AmfValue {
    const m = this.u8()
    if (m === 0x00 || m === 0x01) return null
    if (m === 0x02) return false
    if (m === 0x03) return true
    if (m === 0x04) { const n = this.u29(); return n & 0x10000000 ? n - 0x20000000 : n }
    if (m === 0x05) { const v = this.view.getFloat64(this.i); this.i += 8; return new AmfDouble(v) }
    if (m === 0x06) return this.str()
    if (m === 0x09) return this.array()
    if (m === 0x0a) return this.object()
    if (m === 0x0c) { const b = this.take(this.u29() >> 1); this.objects.push(b); return b }
    if (m >= 0x0d && m <= 0x10) return this.vector(m)
    throw new Error(`marker 0x${m.toString(16)} at ${this.i - 1}`)
  }

  array(): AmfArray {
    const h = this.u29()
    if (!(h & 1)) return this.objects[h >> 1] as AmfArray
    const out = new AmfArray()
    this.objects.push(out)
    for (;;) {
      const k = this.str()
      if (k === '') break
      out.assoc.push([k, this.value()])
    }
    for (let n = h >> 1; n > 0; n--) out.dense.push(this.value())
    return out
  }

  object(): AmfObject {
    const h = this.u29()
    if (!(h & 1)) return this.objects[h >> 1] as AmfObject
    let t
    if (h & 2) {
      const ext = !!(h & 4), dyn = !!(h & 8), n = h >> 4
      const cls = this.str()
      const names: string[] = []
      for (let k = 0; k < (ext ? 0 : n); k++) names.push(this.str())
      t = [cls, names, dyn, ext] as const
      this.traits.push(t as never)
    } else {
      t = this.traits[h >> 2]
    }
    const [cls, names, dyn, ext] = t
    const o = new AmfObject(cls, dyn, ext)
    this.objects.push(o)
    if (ext) { o.raw = this.external(cls); return o }
    for (const nm of names) o.fields.set(nm, this.value())
    if (dyn) {
      for (;;) {
        const k = this.str()
        if (k === '') break
        o.extra.set(k, this.value())
      }
    }
    return o
  }

  external(cls: string): ExtField[] {
    const order = EXT[cls]
    if (!order) throw new Error('unknown externalizable ' + cls)
    const out: ExtField[] = []
    for (const c of order) {
      if (c === 'O') { out.push(['O', this.value()]); continue }
      out.push([c, this.take(c === 'U' ? this.view.getUint16(this.i) + 2 : WIDTH[c])])
    }
    return out
  }

  vector(m: number): AmfVector {
    const h = this.u29()
    if (!(h & 1)) return this.objects[h >> 1] as AmfVector
    const n = h >> 1
    const fixed = !!this.u8()
    const cls = m === 0x10 ? this.str() : ''
    const v = new AmfVector(VEC_KIND[m], [], fixed, cls)
    this.objects.push(v)
    for (let k = 0; k < n; k++) {
      if (m === 0x0d) { v.items.push(this.view.getInt32(this.i)); this.i += 4 }
      else if (m === 0x0e) { v.items.push(this.view.getUint32(this.i)); this.i += 4 }
      else if (m === 0x0f) { v.items.push(new AmfDouble(this.view.getFloat64(this.i))); this.i += 8 }
      else v.items.push(this.value())
    }
    return v
  }
}

class Writer {
  out: number[] = []
  strings = new Map<string, number>()
  traits = new Map<string, number>()

  push(bytes: Uint8Array | number[]) { for (const b of bytes) this.out.push(b) }

  u29(n: number) {
    n &= 0x1fffffff
    if (n < 0x80) this.out.push(n)
    else if (n < 0x4000) this.push([(n >> 7) | 0x80, n & 0x7f])
    else if (n < 0x200000) this.push([(n >> 14) | 0x80, ((n >> 7) & 0x7f) | 0x80, n & 0x7f])
    else this.push([(n >> 22) | 0x80, ((n >> 15) & 0x7f) | 0x80, ((n >> 8) & 0x7f) | 0x80, n & 0xff])
  }

  f64(v: number) { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v); this.push(new Uint8Array(b.buffer)) }

  str(s: string) {
    if (s === '') { this.u29(1); return }
    const ref = this.strings.get(s)
    if (ref !== undefined) { this.u29(ref << 1); return }
    this.strings.set(s, this.strings.size)
    const b = new TextEncoder().encode(s)
    this.u29((b.length << 1) | 1)
    this.push(b)
  }

  value(v: AmfValue) {
    if (v === null || v === undefined) this.out.push(0x01)
    else if (v === true) this.out.push(0x03)
    else if (v === false) this.out.push(0x02)
    else if (typeof v === 'number') { this.out.push(0x04); this.u29(v >= 0 ? v : v + 0x20000000) }
    else if (v instanceof AmfDouble) { this.out.push(0x05); this.f64(v.v) }
    else if (typeof v === 'string') { this.out.push(0x06); this.str(v) }
    else if (v instanceof Uint8Array) { this.out.push(0x0c); this.u29((v.length << 1) | 1); this.push(v) }
    else if (v instanceof AmfArray) {
      this.out.push(0x09)
      this.u29((v.dense.length << 1) | 1)
      for (const [k, x] of v.assoc) { this.str(k); this.value(x) }
      this.str('')
      for (const x of v.dense) this.value(x)
    }
    else if (v instanceof AmfVector) this.vector(v)
    else if (v instanceof AmfObject) this.object(v)
    else throw new Error('unwritable value')
  }

  object(o: AmfObject) {
    this.out.push(0x0a)
    const key = JSON.stringify([o.cls, [...o.fields.keys()], o.dynamic, o.ext])
    const ref = this.traits.get(key)
    if (ref !== undefined) {
      this.u29((ref << 2) | 1)
    } else {
      this.traits.set(key, this.traits.size)
      const n = o.ext ? 0 : o.fields.size
      this.u29((n << 4) | (o.dynamic ? 8 : 0) | (o.ext ? 4 : 0) | 3)
      this.str(o.cls)
      if (!o.ext) for (const nm of o.fields.keys()) this.str(nm)
    }
    if (o.ext) {
      for (const [c, v] of o.raw) {
        if (c === 'O') this.value(v as AmfValue)
        else this.push(v as Uint8Array)
      }
      return
    }
    for (const v of o.fields.values()) this.value(v)
    if (o.dynamic) {
      for (const [k, x] of o.extra) { this.str(k); this.value(x) }
      this.str('')
    }
  }

  vector(v: AmfVector) {
    const m = VEC_MARKER[v.kind]
    this.out.push(m)
    this.u29((v.items.length << 1) | 1)
    this.out.push(v.fixed ? 1 : 0)
    if (m === 0x10) this.str(v.cls)
    for (const x of v.items) {
      if (m === 0x10) { this.value(x); continue }
      const b = new DataView(new ArrayBuffer(m === 0x0f ? 8 : 4))
      if (m === 0x0d) b.setInt32(0, x as number)
      else if (m === 0x0e) b.setUint32(0, x as number)
      else b.setFloat64(0, (x as AmfDouble).v)
      this.push(new Uint8Array(b.buffer))
    }
  }
}

/** Each `ByteArray.writeObject` call starts its own string, object and trait tables. */
function readAll(data: Uint8Array, count = 11): AmfValue[] {
  const r = new Reader(data)
  const out: AmfValue[] = []
  for (let k = 0; k < count; k++) {
    r.strings = []; r.objects = []; r.traits = []
    out.push(r.value())
  }
  return out
}

function writeAll(objs: AmfValue[]): Uint8Array {
  const w = new Writer()
  for (const o of objs) {
    w.strings = new Map(); w.traits = new Map()
    w.value(o)
  }
  return new Uint8Array(w.out)
}

// ------------------------------------------------------- save containers

const KEY = new TextEncoder().encode('QiCR/HYuxqk2jFapOa64ow==')

/** Index of each top-level object, in write order. */
export const PLAYER = 0, SCAN = 1, CARGO = 2, HANGAR = 3, STORAGE = 4, PROGRESS = 5,
  EXTRA = 6, SHIP = 7, QUESTS = 8, STATION = 9, EXTRA2 = 10

export interface Save {
  /** The eleven AMF3 objects. */
  objs: AmfValue[]
  /** `xor` for a `Save1-3.SOL` export, `lso` for a `GG2_*` SharedObject. */
  fmt: 'xor' | 'lso'
  /** Account id the export is bound to; empty on a local-only game. */
  owner: string
  /** SharedObject name, which must equal the filename without its extension. */
  name: string
}

function xor(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b[i] ^ KEY[i % KEY.length]
  return out
}

function utf(s: string): Uint8Array {
  const b = new TextEncoder().encode(s)
  const out = new Uint8Array(b.length + 2)
  new DataView(out.buffer).setUint16(0, b.length)
  out.set(b, 2)
  return out
}

function utfRead(b: Uint8Array, at = 0): string {
  const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(at)
  return new TextDecoder().decode(b.subarray(at + 2, at + 2 + n))
}

function shift(s: string, by: number): string {
  return Array.from(s, (c) => String.fromCodePoint(c.codePointAt(0)! + by)).join('')
}

function indexOf(hay: Uint8Array, needle: string): number {
  const n = new TextEncoder().encode(needle)
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let k = 0; k < n.length; k++) if (hay[i + k] !== n[k]) continue outer
    return i
  }
  return -1
}

/** Read a save in either container format. */
export function decode(d: Uint8Array): Save {
  if (indexOf(d.subarray(6, 10), 'TCSO') === 0) {
    const name = utfRead(d, 16)
    const i = indexOf(d, 'BYTES')
    const body = new Reader(d.subarray(i + 5)).value() as Uint8Array
    return { objs: readAll(body), fmt: 'lso', owner: '', name }
  }
  const p = xor(d)
  const n = new DataView(p.buffer).getUint16(0)
  // The owner id is written with every character shifted +407 (BackupSave.as:175).
  const owner = shift(new TextDecoder().decode(p.subarray(2, 2 + n)), -407)
  return { objs: readAll(p.subarray(2 + n)), fmt: 'xor', owner, name: '' }
}

/** Write back in the container format the save came from. */
export function encode(sv: Save): Uint8Array {
  const body = writeAll(sv.objs)
  if (sv.fmt === 'xor') {
    const owner = new TextEncoder().encode(shift(sv.owner, 407))
    const p = new Uint8Array(2 + owner.length + body.length)
    new DataView(p.buffer).setUint16(0, owner.length)
    p.set(owner, 2)
    p.set(body, 2 + owner.length)
    return xor(p)
  }
  const w = new Writer()
  w.u29((body.length << 1) | 1)
  const enc = new TextEncoder()
  const parts = [
    enc.encode('TCSO\x00\x04\x00\x00\x00\x00'), utf(sv.name),
    enc.encode('\x00\x00\x00\x03\x0bBYTES\x0c'), new Uint8Array(w.out), body,
    new Uint8Array([0]), // every LSO entry ends with this terminator
  ]
  const lso = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { lso.set(p, at); at += p.length }
  const out = new Uint8Array(6 + lso.length)
  out.set([0x00, 0xbf])
  new DataView(out.buffer).setUint32(2, lso.length)
  out.set(lso, 6)
  return out
}

/** Credits, `CargoData.balance` (`system/Save/CargoData.as:13`). */
export function getCredits(sv: Save): number {
  const raw = (sv.objs[CARGO] as AmfObject).raw[0][1] as Uint8Array
  return new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0)
}

export function setCredits(sv: Save, n: number) {
  const b = new DataView(new ArrayBuffer(4))
  b.setUint32(0, n)
  ;(sv.objs[CARGO] as AmfObject).raw[0] = ['u', new Uint8Array(b.buffer)]
}
