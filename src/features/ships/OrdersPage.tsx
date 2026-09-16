import { Crosshair, Info, ListOrdered, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/layout/shell'
import { BehaviourPicker } from '@/components/pickers'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { SwipeRow } from '@/components/ui/gestures'
import { Chip, Input } from '@/components/ui/inputs'
import { Sheet } from '@/components/ui/sheet'
import { Card, EmptyState, Em, SectionLabel, SentenceCard } from '@/components/ui/surfaces'
import { usePulseField } from '@/hooks/use-pulse-field'
import { newOrder, uid } from '@/lib/factory'
import { rewardEstimate } from '@/lib/rules'
import type { ShipOrder } from '@/lib/types'
import { t, useT } from '@/i18n'
import { Fab, PickerButton, StepMissing, rich, undoToast, useStepHeader, useStepRoute } from './common'

const who = (name: string) => (name === 'player' ? t('ships.thePlayer') : name || t('ships.sAShip'))
const whom = (name: string) => (name === 'player' ? t('ships.sPlayerObject') : name)

/** "Hunter attacks the player and becomes Enemy." */
export function orderSentence(o: ShipOrder): React.ReactNode {
  const parts: React.ReactNode[] = []
  if (o.attack) parts.push(o.target === 'self' ? t('ships.sStaysPut') : rich(t('ships.sAttacks'), { target: <Em>{whom(o.target)}</Em> }))
  if (o.changeBehaviour) parts.push(rich(t('ships.sBecomes'), { behaviour: <Em>{o.behaviour}</Em> }))
  if (o.destroy) parts.push(t('ships.sDestroyed'))
  if (!parts.length) parts.push(t('ships.sNothing'))
  const actions = parts.map((p, i) => <React.Fragment key={i}>{i > 0 && t(i === parts.length - 1 ? 'ships.sAnd' : 'ships.sComma')}{p}</React.Fragment>)
  return rich(t('ships.sWho'), { ship: <Em>{who(o.ship)}</Em>, actions })
}

export function OrdersPage() {
  const t = useT()
  const r = useStepRoute()
  const navigate = useNavigate()
  const { orderId } = useParams()
  useStepHeader(t('ships.ordersTitle'), r)
  usePulseField([orderId])
  if (!r.step || !r.quest) return <StepMissing />
  const orders = r.step.orders
  const editing = orders.find((o) => o.id === orderId)
  const spawned = r.quest.steps.slice(0, r.index + 1).flatMap((s) => s.ships)
  const reward = rewardEstimate(r.quest)

  const add = () => {
    const id = uid('order')
    r.update((s) => { s.orders.push(newOrder({ id, ship: spawned.at(-1)?.pilot ?? '' })) })
    navigate(`${r.base}/orders/${id}`)
  }
  const remove = (o: ShipOrder) => {
    if (orderId === o.id) navigate(`${r.base}/orders`, { replace: true })
    undoToast(r.modId, t('ships.orderDeleted'), () => r.update((s) => { s.orders = s.orders.filter((x) => x.id !== o.id) }))
  }

  return (
    <Page className="pb-24">
      {orders.length === 0 ? (
        <EmptyState
          icon={<ListOrdered />}
          title={t('ships.ordersEmptyTitle')}
          body={t('ships.ordersEmptyBody')}
          action={<Button onClick={add}>{t('ships.addOrder')}</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <SectionLabel>{t('ships.ordersCount', { count: orders.length })}</SectionLabel>
          {orders.map((o) => (
            <SwipeRow key={o.id} actions={[{ label: t('ships.delete'), icon: <Trash2 />, tone: 'danger', onAction: () => remove(o) }]}>
              <SentenceCard nav icon={<Crosshair className="text-cyan" />} onClick={() => navigate(`${r.base}/orders/${o.id}`)}
                tone={!o.ship ? 'amber' : undefined}>
                {orderSentence(o)}
              </SentenceCard>
            </SwipeRow>
          ))}
        </div>
      )}

      <Card className="flex flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="section-label">{t('ships.reward')}</span>
          <span className="font-mono text-[18px] text-white">{t('ships.credits', { amount: reward.total })}</span>
        </div>
        {reward.lines.map((l) => (
          <div key={l.reason} className="flex gap-3 font-mono text-[12px] text-ink"><span className="w-10 text-right text-cyan">+{l.amount}</span>{l.reason}</div>
        ))}
        <p className="flex items-start gap-1.5 text-[12px] leading-snug text-ink/75">
          <Info className="mt-px size-3.5 shrink-0" />{t('ships.rewardNote')}
        </p>
      </Card>

      {orders.length > 0 && <Fab label={t('ships.addOrder')} onClick={add} />}
      <OrderEditor
        order={editing}
        pilots={[...new Set(spawned.map((s) => s.pilot).filter(Boolean))]}
        spawnBehaviour={(pilot) => spawned.findLast((s) => s.pilot === pilot)?.behaviour}
        onChange={(recipe) => r.update((s) => { const o = s.orders.find((x) => x.id === editing?.id); if (o) recipe(o) })}
        onClose={() => navigate(`${r.base}/orders`, { replace: true })}
        onDelete={() => editing && remove(editing)}
      />
    </Page>
  )
}

function OrderEditor({ order, pilots, spawnBehaviour, onChange, onClose, onDelete }: {
  order: ShipOrder | undefined
  pilots: string[]
  spawnBehaviour: (pilot: string) => string | undefined
  onChange: (recipe: (o: ShipOrder) => void) => void
  onClose: () => void
  onDelete: () => void
}) {
  const t = useT()
  const [behaviourOpen, setBehaviourOpen] = React.useState(false)
  const last = React.useRef(order)
  if (order) last.current = order
  const o = order ?? last.current
  if (!o) return <Sheet open={false} onOpenChange={() => {}} title={t('ships.order')}><div /></Sheet>
  const known = o.ship === 'player' || pilots.includes(o.ship)
  const isMiner = (o.changeBehaviour ? o.behaviour : spawnBehaviour(o.ship)) === 'Miner'
  const targets = ['player', ...pilots.filter((p) => p !== o.ship)]

  return (
    <Sheet
      open={!!order}
      onOpenChange={(v) => !v && onClose()}
      title={t('ships.order')}
      description={<span className="text-white">{orderSentence(o)}</span>}
      full
      footer={
        <div className="flex gap-2">
          <Button variant="destructive" onClick={onDelete}><Trash2 className="size-4" />{t('ships.delete')}</Button>
          <Button variant="primary" className="flex-1" onClick={onClose}>{t('ships.done')}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        <Field label={t('ships.whichShip')} advancedKey="ShipName" fieldKey="ship" help={t('ships.whichShipHelp')}
          warning={o.ship && !known ? t('ships.pilotUnknown') : !o.ship ? t('ships.chooseShipOrder') : undefined}>
          <div className="flex flex-wrap gap-2">
            <Chip selected={o.ship === 'player'} onClick={() => onChange((x) => { x.ship = 'player' })}>{t('ships.thePlayer')}</Chip>
            {pilots.map((p) => <Chip key={p} selected={o.ship === p} onClick={() => onChange((x) => { x.ship = p })}>{p}</Chip>)}
          </div>
          <Input aria-label={t('ships.pilotName')} placeholder={t('ships.typePilot')} value={o.ship === 'player' ? '' : o.ship} warn={!!o.ship && !known}
            onChange={(e) => onChange((x) => { x.ship = e.target.value })} />
        </Field>

        <Field label={t('ships.whatToDo')}>
          <div className="flex flex-wrap gap-2">
            <Chip selected={o.attack} onClick={() => onChange((x) => { x.attack = !x.attack })}>{t('ships.attack')}</Chip>
            <Chip selected={o.changeBehaviour} onClick={() => onChange((x) => { x.changeBehaviour = !x.changeBehaviour })}>{t('ships.changeBehaviour')}</Chip>
            <Chip selected={o.destroy} onClick={() => onChange((x) => { x.destroy = !x.destroy })}>{t('ships.destroyNow')}</Chip>
          </div>
        </Field>

        {o.attack && (
          <Field label={t('ships.target')} advancedKey="SetTarget" fieldKey="target" help={o.target === 'self' ? t('ships.stayPutHelp') : t('ships.attackHelp')}>
            <div className="flex flex-wrap gap-2">
              {targets.map((tg) => <Chip key={tg} selected={o.target === tg} onClick={() => onChange((x) => { x.target = tg })}>{tg === 'player' ? t('ships.thePlayer') : tg}</Chip>)}
              {isMiner && <Chip selected={o.target === 'self'} onClick={() => onChange((x) => { x.target = 'self' })}>{t('ships.stayPut')}</Chip>}
            </div>
          </Field>
        )}

        {o.changeBehaviour && (
          <Field label={t('ships.newBehaviour')} advancedKey="shipBehavior" fieldKey="behaviour">
            <PickerButton onClick={() => setBehaviourOpen(true)}>{o.behaviour}</PickerButton>
          </Field>
        )}

        {o.destroy && (
          <p className="rounded-[2px] border border-danger/60 bg-danger/[0.05] px-3 py-2 text-[13px] text-ink">{t('ships.destroyedNote')}</p>
        )}
      </div>
      <BehaviourPicker nested open={behaviourOpen} onOpenChange={setBehaviourOpen} value={o.behaviour}
        onSelect={(v) => { onChange((x) => { x.behaviour = v }); setBehaviourOpen(false) }} />
    </Sheet>
  )
}
