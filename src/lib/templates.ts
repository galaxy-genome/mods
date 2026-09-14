import { t } from '@/i18n'
import { importText } from '@/features/start/importer'
import longHaul from '@/data/defaults/the-long-haul.json'
import parcelEntry from '@/data/defaults/parcel-for-sirius.json'
import choiceEntry from '@/data/defaults/a-hard-choice.json'
import { newLine, newMission, newOrder, newQuestView, newShip, newStep, uid } from './factory'
import type { QuestView } from './types'
import { WAIT_FOR_PLAYER } from './types'

export interface QuestTemplate {
  key: 'blank' | 'delivery' | 'ambush' | 'choice' | 'space' | 'job'
  readonly name: string
  readonly description: string
  /** Tiny diagram: step labels in order; a pair means a branch. */
  readonly diagram: (string | [string, string])[]
  build: (title: string, station: string) => QuestView
}

/** A diagram label in the interface language. */
const dl = (label: string): string => t(`lib.diagram_${label.replace(/\W+/g, '_')}`)

const contact = { charName: 'Harry', charImage: 'Tourist2' }

export const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    key: 'blank', get name() { return t('lib.template_blank') }, get description() { return t('lib.template_blank_description') }, get diagram(): QuestTemplate['diagram'] { return [dl('Step'), dl('Step')] },
    build: (title, station) => newQuestView(title, {
      settings: { stationName: station, ...contact },
      steps: [newStep({ name: 'Step 1' }), newStep({ name: 'Step 2' })],
      rumors: [],
    }),
  },
  {
    key: 'delivery', get name() { return t('lib.template_delivery') }, get description() { return t('lib.template_delivery_description') }, get diagram(): QuestTemplate['diagram'] { return [dl('Talk'), dl('Fly'), dl('Dock')] },
    build: (title, station) => newQuestView(title, {
      settings: { stationName: station, description: 'I need something delivered, no questions asked.', ...contact },
      steps: [
        newStep({ name: 'Briefing', journal: 'Take the parcel to Sirius.', dialogue: [newLine({ speaker: 'Harry', portrait: 'Tourist2', text: 'Sirius. Don’t open it.' })] }),
        newStep({ name: 'To Sirius', journal: 'Fly to Sirius.', finishWhen: 'ACTION_WARP_END_SYSTEM_Sirius' }),
        newStep({ name: 'Hand over', journal: 'Dock at Cooper City.', finishWhen: 'ACTION_CLICK_STATION_Cooper City', dialogue: [newLine({ speaker: 'Harry', portrait: 'Tourist2', text: 'Good. We never met.' })] }),
      ],
      rumors: [],
    }),
  },
  {
    key: 'ambush', get name() { return t('lib.template_ambush') }, get description() { return t('lib.template_ambush_description') }, get diagram(): QuestTemplate['diagram'] { return [dl('Fly'), dl('Pirates'), dl('Win')] },
    build: (title, station) => newQuestView(title, {
      settings: { stationName: station, description: 'Someone is raiding convoys near Wolf 359.', ...contact },
      steps: [
        newStep({ name: 'Briefing', journal: 'Fly to Wolf 359.', finishWhen: 'ACTION_WARP_END_SYSTEM_Wolf 359' }),
        newStep({
          name: 'Ambush', journal: 'Destroy the pirates.', finishWhen: 'NO_ENEMY',
          ships: [newShip({ pilot: 'Hunter', model: 'hawk' }), newShip({ pilot: 'Jackal', model: 'wasp', level: 'Novice' })],
          orders: [newOrder({ ship: 'Hunter' }), newOrder({ ship: 'Jackal' })],
        }),
        newStep({ name: 'Report', journal: 'Report back.', finishWhen: `ACTION_CLICK_STATION_${station}` }),
      ],
      rumors: [],
    }),
  },
  {
    key: 'choice', get name() { return t('lib.template_choice') }, get description() { return t('lib.template_choice_description') }, get diagram(): QuestTemplate['diagram'] { return [dl('Offer'), [dl('Fight'), dl('Sneak')], dl('Ending')] },
    build: (title, station) => {
      const fight = newStep({ name: 'Fight', journal: 'Destroy the blockade.', finishWhen: 'NO_ENEMY' })
      const sneak = newStep({ name: 'Sneak', journal: 'Slip past to Ross 154.', finishWhen: 'ACTION_WARP_END_SYSTEM_Ross 154' })
      const ending = newStep({ name: 'Ending', journal: 'Return to the station.', finishWhen: `ACTION_CLICK_STATION_${station}` })
      fight.dialogue = [newLine({ speaker: 'Harry', text: 'Done. Head home.', closeAfterSec: WAIT_FOR_PLAYER, choices: [{ id: uid('ch'), text: 'Head home', targetStepId: ending.id }] })]
      sneak.dialogue = [newLine({ speaker: 'Harry', text: 'You made it past. Head home.', closeAfterSec: WAIT_FOR_PLAYER, choices: [{ id: uid('ch'), text: 'Head home', targetStepId: ending.id }] })]
      const offer = newStep({
        name: 'The offer',
        dialogue: [newLine({ speaker: 'Harry', text: 'A blockade sits on the route. How do you want to do this?', closeAfterSec: WAIT_FOR_PLAYER, choices: [
          { id: uid('ch'), text: 'Fight through', targetStepId: fight.id },
          { id: uid('ch'), text: 'Sneak past', targetStepId: sneak.id },
        ] })],
      })
      return newQuestView(title, { settings: { stationName: station, description: 'A blockade has the Ross 154 lane shut. I need someone who can get through.', ...contact }, steps: [offer, fight, sneak, ending], rumors: [] })
    },
  },
  {
    key: 'space', get name() { return t('lib.template_space') }, get description() { return t('lib.template_space_description') }, get diagram(): QuestTemplate['diagram'] { return [dl('Arrive'), dl('Encounter')] },
    build: (title) => newQuestView(title, {
      settings: { startMode: 'space', trigger: 'warp', chance: 0.3, pointX: 0, pointY: 0, radius: 60, charName: 'Unknown signal', charImage: 'None' },
      steps: [
        newStep({ name: 'Signal', journal: 'Investigate the signal.', dialogue: [newLine({ speaker: 'Unknown signal', portrait: 'None', text: '...help... anyone...' })] }),
        newStep({ name: 'Found them', journal: 'Stop near the drifting ship.', finishWhen: 'PLAYER_SHIP_STOP', ships: [newShip({ pilot: 'Drifter', model: 'porter', behaviour: 'AllyAFK' })] }),
      ],
      rumors: [],
    }),
  },
  {
    key: 'job', get name() { return t('lib.template_job') }, get description() { return t('lib.template_job_description') }, get diagram(): QuestTemplate['diagram'] { return [dl('Talk'), dl('Mission'), dl('Reward')] },
    build: (title, station) => newQuestView(title, {
      settings: { stationName: station, description: 'Word is you take hard jobs.', ...contact },
      steps: [
        newStep({ name: 'Briefing', journal: 'Hear the job out.', dialogue: [newLine({ speaker: 'Harry', portrait: 'Tourist2', text: 'The job is on the missions board. Take it.' })] }),
        newStep({ name: 'The job', journal: 'Take the job at the missions board.', mission: newMission({ homeStation: station, targetShipName: 'Vex' }), finishWhen: 'CLICK_ACCEPT_STORY_MISSION' }),
        newStep({ name: 'Collect', journal: 'Collect the reward.', finishWhen: 'GET_STORY_REWARD' }),
      ],
      rumors: [],
    }),
  },
]

/** Stamps a default mod's entry onto the quest it seeds. */
function credit(view: QuestView, entry: { id: string; author: string; licence: string }) {
  view.meta.id = entry.id
  view.meta.author = entry.author
  view.meta.credit = { author: entry.author, licence: entry.licence }
  return view
}

const fromTemplate = (entry: { id: string; title: string; author: string; licence: string; template: string }) =>
  credit(QUEST_TEMPLATES.find((x) => x.key === entry.template)!.build(entry.title, 'Thunder Station'), entry)

export function sampleMods(): QuestView[] {
  const parcel = fromTemplate(parcelEntry)
  parcel.meta.updatedAt = Date.now() - 3 * 60_000
  parcel.versions.en!.rumors = [{ id: uid('rumor'), text: 'They say couriers to Sirius get paid double and asked nothing.', scope: 'global' }]

  const choice = fromTemplate(choiceEntry)
  choice.meta.updatedAt = Date.now() - 26 * 3600_000
  const c = choice.versions.en!
  c.steps[1].ships = [newShip({ pilot: 'Warden', model: 'barracuda', behaviour: 'Enemy' })]
  c.steps[1].finishWhen = 'ACTION_SHIP_DESTROYED_Warden'
  // The checkpoint sits after the fight: a reload there needs no ship the reload skips.
  c.steps[3].checkpoint = true
  c.rumors = [{ id: uid('rumor'), text: 'A blockade has the Ross 154 lane locked down.', scope: 'local' }]

  const haul = importText(JSON.stringify(longHaul.quest))
  if (haul.kind !== 'ok') throw new Error('the-long-haul.json does not import')
  credit(haul.mod as QuestView, longHaul)
  haul.mod.meta.summary = 'An example mod: a six-system cargo run for Mara Voss.'
  haul.mod.meta.updatedAt = Date.now() - 2 * 86400_000
  return [parcel, choice, haul.mod as QuestView]
}
