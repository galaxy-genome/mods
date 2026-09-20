import { Box, Building2, Coins, Gauge, Layers, Map as MapIcon, Navigation, Package, Rocket, RotateCw, ShoppingCart, Upload, Wrench } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useT } from '@/i18n'
import { SHIP, decode, getCredits, type AmfObject, type Save } from '@/lib/save/codec'
import { BALANCE_MAX, SaveUnsafe, prepareDownload, shipType } from '@/lib/save/safety'
import { formatNumber } from '@/lib/utils'
import { HexButton, HudBackdrop, Readout, ringStyle } from './hud'

type Screen = 'station' | 'ship' | 'credits'

/** The game is landscape, so the editor is too: one fixed 20:9 box, letterboxed on anything wider. */
function Frame({ children }: { children: React.ReactNode }) {
  const t = useT()
  const portrait = useMediaQuery('(orientation: portrait)')
  return (
    <div className="fixed inset-0 grid place-items-center bg-void p-2">
      {portrait ? (
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <RotateCw className="size-10 text-cyan" />
          <p className="font-mono text-sm tracking-[0.12em] text-white">{t('save.rotate')}</p>
          <p className="text-sm text-dim">{t('save.rotateHelp')}</p>
        </div>
      ) : (
        <div
          className="relative m-auto aspect-[20/9] max-h-full max-w-full overflow-hidden border border-edge bg-deep text-ink"
          style={{ containerType: 'inline-size', width: 'min(100%, calc(100vh * 20 / 9))' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** The only way a save gets in: a file the player picks. Nothing on disk is ever written. */
function StartScreen({ onLoad }: { onLoad: (sv: Save, name: string) => void }) {
  const t = useT()
  const input = React.useRef<HTMLInputElement>(null)
  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      const sv = decode(new Uint8Array(await file.arrayBuffer()))
      if (sv.objs.length !== 11) throw new Error('not eleven objects')
      onLoad(sv, file.name)
      toast.success(t('save.loaded', { file: file.name }))
    } catch {
      toast.error(t('save.loadFailed'))
    }
  }
  return (
    <div className="absolute inset-0 grid place-items-center">
      <HudBackdrop />
      <div className="relative flex w-[46%] min-w-64 flex-col items-center gap-5 border border-edge bg-panel px-8 py-9 text-center">
        <h1 className="font-mono text-[max(13px,1.4cqw)] tracking-[0.3em] text-white">{t('save.loadTitle')}</h1>
        <p className="max-w-[40ch] text-[max(11px,0.95cqw)] leading-relaxed text-dim">{t('save.loadHelp')}</p>
        <Button variant="primary" onClick={() => input.current?.click()}>
          <Upload className="size-4" />
          {t('save.load')}
        </Button>
        <input ref={input} type="file" accept=".SOL,.sol" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </div>
  )
}

/** Ship, owner and balance, in the corner the game keeps its readouts. */
function Chrome({ sv, balance, onChangeFile }: { sv: Save; balance: number; onChangeFile: () => void }) {
  const t = useT()
  return (
    <>
      <div className="absolute left-[2%] top-[5%] flex flex-col gap-[0.9cqw]">
        <Readout label={t('save.ship')} value={shipType(sv.objs[SHIP] as AmfObject)} tone="ink" />
        <Readout label={t('save.owner')} value={sv.owner || t('save.ownerLocal')} tone="ink" />
      </div>
      <div className="absolute bottom-[6%] left-[2%]">
        <Readout label={t('save.credits')} value={formatNumber(balance)} tone="amber" />
      </div>
      <button
        type="button"
        onClick={onChangeFile}
        className="absolute right-[2%] top-[5%] flex items-center gap-2 border border-edge bg-chip px-3 py-1.5 font-mono text-[max(9px,0.75cqw)] tracking-[0.2em] text-ink hover:border-grid-strong hover:text-cyan"
      >
        <Upload className="size-3" />
        {t('save.load')}
      </button>
    </>
  )
}

/** Station menu and ship menu: the two hubs every other screen hangs off.
 * Buttons for screens that do not exist yet are present and disabled. */
function Hub({ screen, go }: { screen: 'station' | 'ship'; go: (s: Screen) => void }) {
  const t = useT()
  const items: { key: string; icon: React.ReactNode; label: string; to?: Screen }[] = screen === 'station'
    ? [
        { key: 'modules', icon: <Box />, label: t('save.modules') },
        { key: 'shipyard', icon: <Rocket />, label: t('save.shipyard') },
        { key: 'market', icon: <ShoppingCart />, label: t('save.market') },
        { key: 'storage', icon: <Package />, label: t('save.storage') },
        { key: 'credits', icon: <Coins />, label: t('save.credits'), to: 'credits' },
        { key: 'galaxy', icon: <MapIcon />, label: t('save.galaxy') },
        { key: 'ships', icon: <Layers />, label: t('save.ships') },
        { key: 'service', icon: <Wrench />, label: t('save.service') },
      ]
    : [
        { key: 'modules', icon: <Box />, label: t('save.modules') },
        { key: 'cargo', icon: <Package />, label: t('save.cargo') },
        { key: 'specs', icon: <Gauge />, label: t('save.specs') },
      ]
  const other = screen === 'station' ? 'ship' : 'station'
  return (
    <div className="absolute inset-0">
      <HudBackdrop />
      {items.map((item, i) => (
        <div key={item.key} style={ringStyle(items.length, i)}>
          <HexButton icon={item.icon} label={item.label} disabled={!item.to} title={item.to ? undefined : t('save.soon')} onClick={item.to && (() => go(item.to!))} />
        </div>
      ))}
      <div className="absolute left-[calc(50%-3%)] top-[calc(48%-3%)] w-[6%]">
        <HexButton icon={other === 'ship' ? <Navigation /> : <Building2 />} label={t(`save.${other}`)} onClick={() => go(other)} />
      </div>
    </div>
  )
}

/** Object 3, `CargoData.balance` (`system/Save/CargoData.as:13`). */
function CreditsScreen({ sv, balance, onApplied, onBack, fileName }: {
  sv: Save
  balance: number
  onApplied: (n: number) => void
  onBack: () => void
  fileName: string
}) {
  const t = useT()
  const [text, setText] = React.useState(String(balance))
  const n = Number(text)
  const valid = /^\d+$/.test(text) && Number.isInteger(n) && n <= BALANCE_MAX

  const download = () => {
    let bytes: Uint8Array
    try {
      bytes = prepareDownload(sv, { balance: n })
    } catch (e) {
      const bad = e as SaveUnsafe
      toast.error(t('save.blocked', { field: bad.field ?? 'objects', message: bad.message }))
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    onApplied(n)
    toast.success(t('save.saved', { file: fileName }))
  }

  return (
    <div className="absolute inset-0 grid place-items-center">
      <HudBackdrop />
      <div className="relative flex w-[44%] min-w-72 flex-col gap-5 border border-edge bg-panel px-8 py-8">
        <h2 className="font-mono text-[max(12px,1.2cqw)] tracking-[0.3em] text-white">{t('save.credits')}</h2>
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[max(8px,0.65cqw)] tracking-[0.22em] text-dim">{t('save.balance')}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            aria-label={t('save.balance')}
            data-testid="balance"
            className="h-12 w-full border border-edge bg-field px-3 font-mono text-[max(16px,1.6cqw)] tracking-[0.08em] text-amber outline-none focus:border-cyan"
          />
        </label>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>{t('save.back')}</Button>
          <Button variant="solid" className="ml-auto" disabled={!valid} onClick={download}>{t('save.save')}</Button>
        </div>
      </div>
    </div>
  )
}

export default function SaveRoute() {
  const [save, setSave] = React.useState<{ sv: Save; name: string } | null>(null)
  const [balance, setBalance] = React.useState(0)
  const [screen, setScreen] = React.useState<Screen>('station')

  const load = (sv: Save, name: string) => {
    setSave({ sv, name })
    setBalance(getCredits(sv))
    setScreen('station')
  }

  return (
    <Frame>
      {!save ? (
        <StartScreen onLoad={load} />
      ) : (
        <>
          {screen === 'credits'
            ? <CreditsScreen sv={save.sv} balance={balance} fileName={save.name} onApplied={setBalance} onBack={() => setScreen('station')} />
            : <Hub screen={screen} go={setScreen} />}
          <Chrome sv={save.sv} balance={balance} onChangeFile={() => setSave(null)} />
        </>
      )}
    </Frame>
  )
}
