import { toast } from 'sonner'
import { RESERVED_JUMP_LABELS, shipByKey } from '@/lib/reference'
import type { DialogLine, Kept, QuestContent, StarsView, Step } from '@/lib/types'
import { t } from '@/i18n'

type Obj = Record<string, unknown>
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * A written object as the imported file had it: keys in the file's order and spelling, unmodelled keys back in place,
 * and file values kept while the model still writes what it wrote at import. Objects made in the editor keep the
 * writer's order.
 */
export function withKept(model: Kept, written: Obj): Obj {
  const extra = model._extra ?? {}
  if (!model._layout) return { ...written, ...extra }
  const kept = model._kept ?? {}
  const out: Obj = {}
  const byLower = new Map(Object.keys(written).map((k) => [k.toLowerCase(), k]))
  const used = new Set<string>()
  const put = (name: string, key: string) => {
    used.add(key)
    const k = kept[key]
    if (k && same(k.written, written[key])) { if (k.value !== undefined) out[name] = k.value }
    else out[name] = written[key]
  }
  for (const name of model._layout) {
    if (name in extra) { out[name] = extra[name]; continue }
    const key = name in written ? name : byLower.get(name.toLowerCase())
    if (key !== undefined && !used.has(key)) put(name, key)
  }
  for (const key of Object.keys(written)) if (!used.has(key)) put(key, key)
  for (const [k, v] of Object.entries(extra)) if (!(k in out)) out[k] = v
  return out
}

/** Jump labels: each step that is a choice target gets 1, 2, 3… skipping reserved numbers; the rest get 0. */
export function jumpLabels(steps: Step[]) {
  const targets = new Set(steps.flatMap((s) => s.dialogue.flatMap((l) => l.choices.map((c) => c.targetStepId))).filter(Boolean))
  const labels = new Map<string, number>()
  let next = 1
  steps.forEach((s) => {
    if (!targets.has(s.id)) return labels.set(s.id, 0)
    while (RESERVED_JUMP_LABELS.includes(next)) next++
    labels.set(s.id, next++)
  })
  return labels
}

const line = (l: DialogLine, labels: Map<string, number>) => withKept(l, {
  Name: l.speaker,
  showTimeSec: l.closeAfterSec,
  text: l.text,
  character: l.portrait,
  options: l.choices.map((c) => `${c.targetStepId ? labels.get(c.targetStepId) ?? 0 : 0}=${c.text};`).join(''),
})

export function stepJson(step: Step, labels: Map<string, number>) {
  return withKept(step, {
    name: step.name,
    TODO: step.journal,
    questID: labels.get(step.id) ?? 0,
    isCheckPoint: step.checkpoint,
    dialogText: step.dialogue.map((l) => line(l, labels)),
    completeAction: step.finishWhen ?? '',
    dialogTextRepeat: step.reminder.map((l) => line(l, labels)),
    repeatTextTimeSec: step.reminderEverySec,
    shipSpawn: step.ships.map((s) => withKept(s, {
      Name: s.pilot,
      shipLevel: s.level,
      shipModel: s.model,
      distanceFromPlayer: s.placement === 'nearPlayer' ? s.distance : 0,
      spawnX: s.placement === 'position' ? s.x : 0,
      spawnY: s.placement === 'position' ? s.y : 0,
      shipBehavior: s.behaviour,
      autoLVL: s.autoLvl,
      color: s.tint ? `0xFF${s.tint.replace('#', '').toUpperCase()}` : '0xFFFFFFFF',
    })),
    shipControl: step.orders.map((o) => withKept(o, {
      ShipName: o.ship,
      SetTarget: o.target,
      shipBehavior: o.changeBehaviour ? o.behaviour : '',
      Destroy: o.destroy,
      Attack: o.attack,
    })),
    task_on_station: step.mission && withKept(step.mission, {
      Type: step.mission.type,
      TargetShipType: shipByKey(step.mission.targetShipType)?.internal ?? step.mission.targetShipType,
      TargetShipName: step.mission.targetShipName,
      TargetShipHull: step.mission.targetShipHull,
      Level: step.mission.level,
      Story: step.mission.story,
      Reward: step.mission.credits,
      Reputation: step.mission.reputation,
      TargetSystem: step.mission.targetSystem,
      TargetStation: step.mission.targetStation,
      HomeStation: step.mission.homeStation,
      TargetGoodsCount: step.mission.goodsCount,
      TargetGoods: step.mission.goods,
    }),
    failureActions: step.failWhen.join(';'),
  })
}

export function toGameJson(content: QuestContent) {
  const s = content.settings
  const labels = jumpLabels(content.steps)
  return withKept(content, {
    settings: withKept(s, {
      QuestName: s.questName,
      QuestDescription: s.description,
      ID: s.questId,
      StationName: s.startMode === 'bar' ? s.stationName : '',
      Lang: s.lang,
      isRandomStationQuest: s.startMode === 'nearPoint',
      isRandomSpaceQuest: s.startMode === 'space',
      RandomQuestX: s.pointX,
      RandomQuestY: s.pointY,
      RandomQuestRadius: s.radius,
      RandomSpaceQuestChance: s.chance,
      RandomSpaceQuestTrigger: s.trigger,
      CharName: s.charName,
      CharImage: s.charImage,
      MinKarma: s.minKarma ?? -101,
      MaxKarma: s.maxKarma ?? 101,
      Faction: s.faction === 'none' ? '' : s.faction,
      FactionMinRep: s.factionMinRep,
      RequestedQuestIDCompleted: s.requiredQuestIds.join(';'),
      OwnStationRequired: s.ownStationRequired,
      Reward: s.reward,
      KarmaReward: s.karmaReward,
    }),
    BarRumors: content.rumors.map((r) => withKept(r, { text: r.text, type: r.scope })),
    questParts: content.steps.map((st) => stepJson(st, labels)),
  })
}

export function toStarsJson(mod: StarsView) {
  return withKept(mod, {
    Stars: mod.stars.map((s) => withKept(s, { Name: s.name, X: s.x, Y: s.y, Z: s.z, security: s.security, type: s.type })),
    Planets: mod.planets.map((p) => withKept(p, {
      Name: p.name, system: p.system, type: p.type, dist: p.orbit, sput: p.moons, size: p.size, rings: p.rings, ...(p.material ? { mater1: p.material } : {}),
    })),
    Stations: mod.stations.map((s) => withKept(s, { Name: s.name, StarSystem: s.system, PlanetID: s.bodyIndex, type: s.type, Faction: s.faction })),
  })
}

export const pretty = (v: unknown) => JSON.stringify(v, null, 2)

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text: string, what = t('output.jsonTitle')) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('output.copied', { what }))
  } catch {
    toast.error(t('output.clipboardBlocked'), { description: t('output.clipboardBlockedHint') })
  }
}
