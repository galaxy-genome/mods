// node --import ./scripts/test-hooks.mjs --no-warnings scripts/owner-of-record.ts — writes the "Owner of Record" story
// mod to local/OwnerOfRecord/ with the editor's own export, re-imports each file and prints every
// editor problem. Exits 1 on any error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = `${import.meta.dirname}/../local/OwnerOfRecord/`
const PUBLIC = new URL('../public/', import.meta.url)
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(String(url).replace(/^\//, ''), PUBLIC)))) as typeof fetch

const { loadGalaxy } = await import('@/features/map/galaxy')
const { newLine, newMission, newOrder, newQuestView, newShip, newStep, uid } = await import('@/lib/factory')
const { modProblems } = await import('@/lib/rules')
const { importText } = await import('@/features/start/importer')
const { toGameJson } = await import('@/features/output/gameJson')
const { WAIT_FOR_PLAYER } = await import('@/lib/types')
type Step = import('@/lib/types').Step
type ShipSpawn = import('@/lib/types').ShipSpawn
type ShipOrder = import('@/lib/types').ShipOrder

await loadGalaxy()
mkdirSync(OUT, { recursive: true })

/* ---------- places and cast ---------- */

const HESPER_STATION = 'Manson Orbital'
const HESPER_SYSTEM = 'Wolf 359'
const TOMAS_STATION = 'Nexus Station'
const TOMAS_SYSTEM = "Barnard's Star"
const NEXT_DOOR = 'Vertex Terminal' // also Barnard's Star
const LONG_RUN = 'Thunder Station'
const LONG_RUN_SYSTEM = 'Sol'
const DRIFT = 'Ross 154'
const HIDEOUT = 'Glede' // Ross 154 ice planet where ODA hides
const SURVEY = 'Sorg' // Ross 154 ice planet Lask guards

const ID = { q1: 7_413_001, q2: 7_413_002, q3: 7_413_003, q4: 7_413_004 }

type Who = { name: string; portrait: string }
const HESPER: Who = { name: 'Hesper Vale', portrait: 'Tourist1' }
const HESPER_C: Who = { name: 'Hesper Vale, on comms', portrait: 'Tourist1' }
const TOMAS: Who = { name: 'Tomas Reyk', portrait: 'Tourist2' }
const TOMAS_C: Who = { name: 'Tomas, on comms', portrait: 'Tourist2' }
const ODA: Who = { name: 'ODA-4', portrait: 'Automaton' }
const ODA_C: Who = { name: 'ODA-4, on comms', portrait: 'Automaton' }
const KARR_C: Who = { name: 'Anselm Karr, on comms', portrait: 'Tourist3' }
const IVA: Who = { name: 'Iva Dorn, recorded message', portrait: 'Tourist4' }
const LASK: Who = { name: 'Lask', portrait: 'Pirate2' }

/* ---------- step builder ---------- */

type Line = [Who, string] | [Who, string, [string, string][]]
interface Def {
  key: string
  name: string
  journal: string
  lines?: Line[]
  finish?: string
  cp?: boolean
  ships?: ShipSpawn[]
  orders?: ShipOrder[]
  mission?: ReturnType<typeof newMission>
}

/** Seconds = characters / 12 rounded up, plus 2, minimum 5; lines with buttons wait for the player. */
const secs = (text: string) => Math.max(5, Math.ceil(text.length / 12) + 2)

function build(defs: Def[]): Step[] {
  const ids = new Map(defs.map((d) => [d.key, uid()]))
  return defs.map((d) => {
    const lines = (d.lines ?? []).map(([who, text, choices]) => {
      if (text.length > 90) throw new Error(`line over 90 characters in ${d.key}: ${text}`)
      return newLine({
        speaker: who.name, portrait: who.portrait, text,
        closeAfterSec: choices ? WAIT_FOR_PLAYER : secs(text),
        choices: (choices ?? []).map(([to, label]) => {
          if (!ids.has(to)) throw new Error(`${d.key}: no step ${to}`)
          return { id: uid(), text: label, targetStepId: ids.get(to)! }
        }),
      })
    })
    const buttons = lines.some((l) => l.choices.length)
    return newStep({
      id: ids.get(d.key)!, name: d.name, journal: d.journal, checkpoint: !!d.cp, dialogue: lines,
      finishWhen: d.finish ?? (buttons || lines.length ? 'ACTION_DIALOG_COMPLETE' : null),
      ships: d.ships ?? [], orders: d.orders ?? [], mission: d.mission ?? null,
    })
  })
}

const arrive = (system: string) => `ACTION_WARP_END_SYSTEM_${system}`
const dock = (station: string) => `ACTION_CLICK_STATION_${station}`
const scan = (planet: string) => `ACTION_SCAN_PLANET_${planet}`
const destroyed = (pilot: string) => `ACTION_SHIP_DESTROYED_${pilot}`
const WARP_BEGIN = 'ACTION_WARP_BEGIN'
const ACCEPT = 'CLICK_ACCEPT_STORY_MISSION'
const REWARD = 'GET_STORY_REWARD'

/** A spawned ship that keeps station on the player until a later order changes it. */
const shadow = (pilot: string, model: string, level: ShipSpawn['level'], behaviour = 'Mercenary') =>
  [newShip({ pilot, model, level, behaviour, distance: 400 }), newOrder({ ship: pilot, attack: false, target: 'player' })] as const
const attack = (pilot: string) => newOrder({ ship: pilot, attack: true, target: 'player', changeBehaviour: true, behaviour: 'Pirate' })

const courier = (targetStation: string, targetSystem: string) =>
  newMission({ type: 'Courier', homeStation: TOMAS_STATION, targetStation, targetSystem, story: true, credits: 2000, reputation: 1 })

const quest = (name: string, id: number, station: string, char: Who, description: string, requires: number[], steps: Step[], rumor: string) =>
  newQuestView(name, {
    settings: { questName: name, description, questId: id, lang: 'en', startMode: 'bar', stationName: station, charName: char.name, charImage: char.portrait, requiredQuestIds: requires },
    steps,
    rumors: [{ id: uid(), text: rumor, scope: 'local' }],
  })

/* ---------- Q1 Recovery Contract ---------- */

const q1 = quest('Recovery Contract', ID.q1, HESPER_STATION, HESPER,
  'An insurance adjuster with one missing android and one unfinished form. The job is about the android, not the pay.', [],
  build([
    { key: 'offer', name: "Hesper's offer", journal: 'Hear out the insurance adjuster.', lines: [
      [HESPER, 'You fly, I assume. I have a missing asset and a form that says malfunction.'],
      [HESPER, 'Cargo android ODA-4 walked off its freighter. I need it back before the claim closes.'],
      [HESPER, 'Security bills the Federation. You bill me, and you are cheaper.'],
      [HESPER, `Last ping: ${TOMAS_SYSTEM}. Ask Tomas at the ${TOMAS_STATION} bar. Do not shoot anything.`, [['travel', `Fly to ${TOMAS_SYSTEM}`]]],
    ] },
    { key: 'travel', name: 'Travel', journal: `Jump into ${TOMAS_SYSTEM}. ODA-4 was last seen there. Ask for Tomas at ${TOMAS_STATION}.`, finish: arrive(TOMAS_SYSTEM), cp: true },
    { key: 'dock', name: 'Dock', journal: `Dock at ${TOMAS_STATION} in ${TOMAS_SYSTEM} and find Tomas.`, finish: dock(TOMAS_STATION), cp: true },
    { key: 'price', name: "Tomas's price", journal: 'Choose a job for Tomas.', lines: [
      [TOMAS, 'An adjuster sent you. You have the look.'],
      [TOMAS, 'Questions cost extra. Carry something for me and my memory gets better.'],
      [TOMAS, 'A crate next door, or a long run for a friend. The long run I remember longer.', [['crateAccept', 'Take the crate job'], ['longAccept', 'Take the long run']]],
    ] },
    { key: 'crateAccept', name: 'Accept crate job', journal: `Take Tomas's crate job (to ${NEXT_DOOR}) from the ${TOMAS_STATION} mission board.`,
      mission: courier(NEXT_DOOR, TOMAS_SYSTEM), finish: ACCEPT, cp: true },
    { key: 'crateTurnIn', name: 'Hand in crate job', journal: `Deliver Tomas's crate to ${NEXT_DOOR} and collect the reward.`, finish: REWARD, cp: true },
    { key: 'crateFact', name: 'The fact, crate version', journal: 'Tell Tomas what you will tell the adjuster.', lines: [
      [TOMAS_C, `Crate arrived. Fair is fair. ODA-4 bought a planet survey of ${DRIFT}.`],
      [TOMAS_C, 'Androids do not pay cash. Somebody taught it. What will you tell the adjuster?', [['report', 'Everything'], ['quiet', 'Nothing yet']]],
    ] },
    { key: 'longAccept', name: 'Accept long run', journal: `Take Tomas's long run (to ${LONG_RUN}) from the ${TOMAS_STATION} mission board.`,
      mission: courier(LONG_RUN, LONG_RUN_SYSTEM), finish: ACCEPT, cp: true },
    { key: 'longTurnIn', name: 'Hand in long run', journal: `Deliver Tomas's package to ${LONG_RUN} in ${LONG_RUN_SYSTEM} and collect the reward.`, finish: REWARD, cp: true },
    { key: 'longFact', name: 'The fact, long run version', journal: 'Tell Tomas what you will tell the adjuster.', lines: [
      [TOMAS_C, `My friend says thank you. So do I. ODA-4 bought a planet survey of ${DRIFT}.`],
      [TOMAS_C, 'Androids do not pay cash. Somebody taught it. What will you tell the adjuster?', [['report', 'Everything'], ['quiet', 'Nothing yet']]],
    ] },
    { key: 'quiet', name: 'Say nothing (bridge)', journal: 'Keep it quiet for now.', lines: [
      [TOMAS_C, 'Quiet. Good for business. Your next drink is on the house.', [['final', 'Head out']]],
    ] },
    { key: 'report', name: 'Report', journal: `Dock at ${HESPER_STATION} in ${HESPER_SYSTEM} and tell Hesper what Tomas said.`, finish: dock(HESPER_STATION), cp: true },
    { key: 'doubt', name: "Hesper's doubt", journal: 'Hesper has a question the form cannot answer.', lines: [
      [HESPER, 'Cash. The form does not have a box for that.'],
      [HESPER, 'Keep going. And pilot, tell me first if the form is wrong.'],
    ] },
    { key: 'final', name: 'Shared final', journal: `ODA-4 went to ${DRIFT}. Tomas has the next lead.`, lines: [
      [TOMAS_C, `${DRIFT} is close to me. Come see me when you are ready.`],
    ] },
  ]),
  `They say an android paid cash for a survey of ${DRIFT}. Nobody out there takes cash.`)

/* ---------- Q2 Cold Trail ---------- */

const [laskShip, laskFollow] = shadow('Lask', 'hawk', 'Novice')
const q2 = quest('Cold Trail', ID.q2, TOMAS_STATION, TOMAS,
  'Tomas has a lead on the runaway android, and a message somebody wants you to hear first.', [ID.q1],
  build([
    { key: 'lead', name: 'Tomas: the trail', journal: 'Hear what Tomas knows.', lines: [
      [TOMAS, `Whatever you told the adjuster, the trail is ${DRIFT}. The survey named planet ${SURVEY}.`],
      [TOMAS, 'Before you go, a freighter captain left a message for whoever came asking.'],
    ] },
    { key: 'iva', name: "Iva's message", journal: "Listen to Iva Dorn's message.", lines: [
      [IVA, 'Iva Dorn, captain. ODA-4 crewed my freighter for six years.'],
      [IVA, 'We lost three runs in one season. Nobody loses three by accident.'],
      [IVA, 'Same broker sold every escort. If you find ODA, ask it what it saw.'],
    ] },
    { key: 'jump', name: `Jump into ${DRIFT}`, journal: `Jump into ${DRIFT}, then scan planet ${SURVEY}.`, finish: arrive(DRIFT), cp: true },
    { key: 'scan', name: `Scan ${SURVEY}`, journal: `Scan planet ${SURVEY} in ${DRIFT}. Repair your planet scanner first if it is damaged.`, finish: scan(SURVEY), cp: true },
    { key: 'hail', name: 'Lask hails', journal: 'A pirate named Lask is shadowing you. Fight or break off.', ships: [laskShip], orders: [laskFollow], lines: [
      [LASK, 'You scanned the wrong rock, pilot. This sector has an arrangement.'],
      [LASK, 'Leave the android and fly home. That is the whole offer.', [['fight', 'Fight'], ['breakOff', 'Break off']]],
    ] },
    { key: 'breakOff', name: 'Break off', journal: 'Jump away to break off from Lask.', finish: WARP_BEGIN },
    { key: 'breakBridge', name: 'Bridge: Tomas', journal: 'Report back to Tomas.', lines: [
      [TOMAS_C, 'Smart. Lask is paid. Somebody pays him.', [['final', 'Return to the trail']]],
    ] },
    { key: 'fight', name: 'Fight Lask', journal: 'Destroy Lask. Jumping away abandons the fight.', orders: [attack('Lask')], finish: destroyed('Lask') },
    { key: 'fightCall', name: 'Tomas: fight callback', journal: 'Lask is gone.', lines: [
      [TOMAS_C, 'Lask is gone. Whoever paid him will send more.'],
    ] },
    { key: 'final', name: 'Shared final', journal: `Lask was guarding something in ${DRIFT}. Tomas wants to talk.`, lines: [
      [TOMAS_C, 'He was guarding something. Come see me.'],
    ] },
  ]),
  `They say a pirate called Lask keeps other ships away from ${DRIFT}.`)

/* ---------- Q3 The Record ---------- */

const [odaShuttle, odaFollow] = shadow('ODA-4 (shuttle)', 'atom', 'Harmless', 'TraderNoWeapons')
const [wingLead, wingLeadFollow] = shadow("Lask's Wing", 'hawk', 'Novice')
const [wingTwo, wingTwoFollow] = shadow("Lask's Wing Two", 'hawk', 'Harmless')
const q3 = quest('The Record', ID.q3, TOMAS_STATION, TOMAS,
  'Lask was guarding a planet. Tomas thinks the android is hiding near it.', [ID.q2],
  build([
    { key: 'brief', name: 'Tomas: scan it', journal: 'Hear what Tomas worked out.', lines: [
      [TOMAS, `You came back from ${DRIFT} in one piece. Lask was guarding ${HIDEOUT}, not ${SURVEY}.`],
      [TOMAS, `Scan ${HIDEOUT}. Repair your scanner first if it is damaged.`],
    ] },
    { key: 'jump', name: `Jump into ${DRIFT}`, journal: `Jump into ${DRIFT}, then scan planet ${HIDEOUT}.`, finish: arrive(DRIFT), cp: true },
    { key: 'scan', name: `Scan ${HIDEOUT}`, journal: `Scan planet ${HIDEOUT} in ${DRIFT}.`, finish: scan(HIDEOUT), cp: true },
    { key: 'found', name: 'ODA found', journal: 'A small shuttle is coming to meet you.', ships: [odaShuttle], orders: [odaFollow], lines: [
      [ODA, 'I apologise for the inconvenience of being found.', [['listen', 'Show me the record'], ['hunter', 'I am taking you in']]],
    ] },
    { key: 'hunter', name: "ODA's argument to a hunter", journal: 'ODA-4 asks you to look first.', lines: [
      [ODA, 'Then take me. But look first.', [['record', 'Look']]],
    ] },
    { key: 'listen', name: "ODA's answer to a listener", journal: 'ODA-4 is ready to show you.', lines: [
      [ODA, 'Thank you. Nobody asks.', [['record', 'Look']]],
    ] },
    { key: 'record', name: 'The record', journal: 'ODA-4 is the only copy of the real cargo log.', lines: [
      [ODA, 'Three runs. One broker sold the escort routes. The pirates were paid to be there.'],
      [ODA, 'The broker then claimed the losses. The log shows every transfer.'],
      [ODA, 'There is one copy. It is in me.'],
    ] },
    { key: 'wing', name: "Lask's Wing arrives", journal: "Lask's Wing is here. Fight or break off.", ships: [wingLead, wingTwo],
      orders: [wingLeadFollow, wingTwoFollow, newOrder({ ship: 'ODA-4 (shuttle)', attack: false, target: HIDEOUT, changeBehaviour: true, behaviour: 'TraderNoWeapons' })], lines: [
        [ODA, 'Two ships. They fly for the man who paid Lask. I will hide near the planet.', [['fight', 'Fight'], ['breakOff', 'Break off']]],
      ] },
    { key: 'breakOff', name: 'Break off', journal: 'Jump away and draw the wing after you.', finish: WARP_BEGIN },
    { key: 'breakBridge', name: 'Bridge: ODA', journal: 'The wing followed you out.', lines: [
      [ODA_C, 'They followed you. I am hidden again. Thank you.', [['final', `Head to ${TOMAS_SYSTEM}`]]],
    ] },
    { key: 'fight', name: 'Fight the wing', journal: "Destroy Lask's Wing. Jumping away abandons the fight.", orders: [attack("Lask's Wing"), attack("Lask's Wing Two")], finish: destroyed("Lask's Wing") },
    { key: 'fightCall', name: 'ODA: fight callback', journal: 'The wing leader is gone.', lines: [
      [ODA_C, 'You fought them for me. Nobody has done that. I apologise for the damage.'],
    ] },
    { key: 'final', name: 'Shared final', journal: 'Hesper wants the android. Tomas says sleep on it.', lines: [
      [HESPER_C, 'Pilot, I heard you found it. Bring it to me.'],
      [ODA_C, 'If she has me, the log is copied out and I am wiped. Please think about it.'],
      [TOMAS_C, 'Sleep on it. Come see me when you know.'],
    ] },
  ]),
  `They say a Federation adjuster is asking every pilot in ${TOMAS_SYSTEM} about a cargo android.`)

/* ---------- Q4 Owner of Record ---------- */

const [contractor, contractorFollow] = shadow("Karr's Contractor", 'viking', 'Novice')
const [contractorOda, contractorOdaFollow] = shadow("Karr's Contractor", 'viking', 'Novice')
const odaFree = newShip({ pilot: 'ODA-4', model: 'atom', level: 'Harmless', behaviour: 'TraderNoWeapons', distance: 300 })
const q4 = quest('Owner of Record', ID.q4, TOMAS_STATION, TOMAS,
  'The record has one copy, and it walks. Decide who gets it.', [ID.q3],
  build([
    { key: 'choice', name: 'The choice', journal: 'Decide who gets the record.', lines: [
      [TOMAS, 'You found it, and you let it talk. Now you decide who hears it.'],
      [TOMAS, 'Give it to Hesper: the log is copied out, ODA is wiped, and Karr is named.'],
      [TOMAS, 'Let ODA carry it: ODA stays itself. A broadcast is a story, not evidence.'],
      [TOMAS, 'Karr keeps his post then, and Hesper loses hers for losing the asset.', [['hJump', 'Give the record to Hesper'], ['oJump', 'Let ODA carry it']]],
    ] },
    // Hesper branch
    { key: 'hJump', name: `H: jump into ${DRIFT}`, journal: `Jump into ${DRIFT} to collect ODA-4.`, finish: arrive(DRIFT), cp: true },
    { key: 'hScan', name: `H: scan ${HIDEOUT}`, journal: `Scan planet ${HIDEOUT} in ${DRIFT} so ODA-4 knows it is you.`, finish: scan(HIDEOUT), cp: true },
    { key: 'hAboard', name: 'H: ODA comes aboard', journal: `ODA-4 is in your cargo bay. Fly to ${HESPER_SYSTEM}.`, lines: [
      [ODA_C, 'You chose. I will not make it harder. Open your cargo bay.'],
    ] },
    { key: 'hWolf', name: `H: jump into ${HESPER_SYSTEM}`, journal: `Jump into ${HESPER_SYSTEM}. Hesper is waiting at ${HESPER_STATION}.`, finish: arrive(HESPER_SYSTEM), cp: true },
    { key: 'hKarr', name: 'H: Karr hails', journal: "Karr's Contractor is on you. Fight or break off.", ships: [contractor], orders: [contractorFollow], lines: [
      [KARR_C, 'Anselm Karr. I know what is in your cargo bay. Sell it to me instead.'],
      [KARR_C, 'Everyone in this sector owes me an escort. Soon, you too.', [['hFight', 'Fight'], ['hBreakOff', 'Break off']]],
    ] },
    { key: 'hBreakOff', name: 'H: break off', journal: "Jump away to break off from Karr's Contractor.", finish: WARP_BEGIN },
    { key: 'hBreakBridge', name: 'H: bridge, Hesper', journal: `Come back and dock at ${HESPER_STATION}.`, lines: [
      [HESPER_C, `He will not follow you into my dock. Come back and dock at ${HESPER_STATION}.`, [['hDock', `Return to ${HESPER_STATION}`]]],
    ] },
    { key: 'hFight', name: 'H: fight', journal: "Destroy Karr's Contractor. Jumping away abandons the fight.", orders: [attack("Karr's Contractor")], finish: destroyed("Karr's Contractor") },
    { key: 'hFightCall', name: 'H: Hesper, fight callback', journal: `Dock at ${HESPER_STATION}.`, lines: [
      [HESPER_C, 'Karr will say he never sent anyone. The log will say otherwise. Dock with me.'],
    ] },
    { key: 'hDock', name: `H: dock at ${HESPER_STATION}`, journal: `Dock at ${HESPER_STATION} in ${HESPER_SYSTEM} and hand ODA-4 to Hesper.`, finish: dock(HESPER_STATION), cp: true },
    { key: 'hFile', name: 'H: Hesper files', journal: `Hesper has filed. Tomas is waiting at ${TOMAS_STATION}.`, lines: [
      [HESPER, 'The log is copied. Anselm Karr is named on the claim, in full.'],
      [HESPER, 'The form is right now. I hate it.', [['final', `Fly to ${TOMAS_SYSTEM}`]]],
    ] },
    // ODA branch
    { key: 'oJump', name: `O: jump into ${DRIFT}`, journal: `Jump into ${DRIFT}. ODA-4 needs a clear sky to broadcast.`, finish: arrive(DRIFT), cp: true },
    { key: 'oScan', name: `O: scan ${HIDEOUT}`, journal: `Scan planet ${HIDEOUT} in ${DRIFT} so ODA-4 knows it is you.`, finish: scan(HIDEOUT), cp: true },
    { key: 'oGuard', name: 'O: the relay guard', journal: "Karr's Contractor guards the relay. Fight or break off.", ships: [contractorOda], orders: [contractorOdaFollow], lines: [
      [ODA_C, 'Karr sent a guard to the old relay. I cannot broadcast while it watches.', [['oFight', 'Fight'], ['oBreakOff', 'Break off']]],
    ] },
    { key: 'oBreakOff', name: 'O: break off', journal: 'Jump away and lead the guard off.', finish: WARP_BEGIN },
    { key: 'oReturn', name: 'O: return', journal: `Jump back into ${DRIFT} and scan ${HIDEOUT} again.`, finish: scan(HIDEOUT), cp: true },
    { key: 'oBridge', name: 'O: bridge, ODA', journal: 'ODA-4 is ready.', lines: [
      [ODA_C, 'It is still chasing your trail. I am ready.', [['oBroadcast', 'Meet ODA']]],
    ] },
    { key: 'oFight', name: 'O: fight', journal: "Destroy Karr's Contractor. Jumping away abandons the fight.", orders: [attack("Karr's Contractor")], finish: destroyed("Karr's Contractor") },
    { key: 'oFightCall', name: 'O: ODA, fight callback', journal: 'The relay is clear.', lines: [
      [ODA_C, 'The relay is clear. I am coming out.'],
    ] },
    { key: 'oBroadcast', name: 'O: ODA broadcasts', journal: 'ODA-4 broadcasts the log and leaves.', ships: [odaFree], lines: [
      [ODA, 'Broadcasting. Every station in range has the log now.'],
      [ODA, 'I am not sorry I left.'],
    ] },
    { key: 'oHesper', name: 'O: Hesper, on comms', journal: `Tomas is waiting at ${TOMAS_STATION}.`, lines: [
      [HESPER_C, 'I heard the broadcast. The asset is lost, and so is my job.'],
      [HESPER_C, 'You told me first, in a way. That is more than the form did.'],
    ] },
    // Shared final
    { key: 'final', name: `Dock at ${TOMAS_STATION}`, journal: `Dock at ${TOMAS_STATION} in ${TOMAS_SYSTEM}.`, finish: dock(TOMAS_STATION), cp: true },
    { key: 'drinks', name: 'Two drinks', journal: 'It is over. Tomas remembers.', lines: [
      [TOMAS, 'Two drinks. One for you.'],
      [TOMAS, 'And one for the one who is not here.'],
    ] },
  ]),
  `They say a cargo log changed hands in ${DRIFT}, and a broker named Karr stopped sleeping.`)

/* ---------- write, re-import, check ---------- */

const quests = [q1, q2, q3, q4]
const views: import('@/lib/types').ModPart[] = []
quests.forEach((q, i) => {
  const content = q.versions.en!
  const json = toGameJson(content) as { questParts: { shipControl: { SetTarget: string }[] }[] }
  // The export writes SetTarget only for attack orders; the game also moves a ship to a non-attack SetTarget.
  content.steps.forEach((st, si) => st.orders.forEach((o, oi) => { if (!o.attack) json.questParts[si].shipControl[oi].SetTarget = o.target }))
  const text = JSON.stringify(json, null, 2)
  writeFileSync(`${OUT}Quest${i}.json`, text)
  const result = importText(readFileSync(`${OUT}Quest${i}.json`, 'utf8'))
  if (result.kind !== 'ok') throw new Error(`Quest${i}.json did not import: ${JSON.stringify(result)}`)
  views.push(result.mod)
})
let errors = 0
views.forEach((v, i) => {
  const problems = modProblems(v, views)
  console.log(`Quest${i}.json ${v.meta.title}: ${problems.length ? '' : 'no problems'}`)
  for (const p of problems) {
    if (p.severity === 'error') errors++
    console.log(`  ${p.severity} ${p.id.replace(/-[0-9a-f-]{36}/g, '')} [${p.location.label}]: ${p.message}`)
  }
})
process.exit(errors ? 1 : 0)
