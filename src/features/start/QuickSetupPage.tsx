import { Landmark, Orbit } from 'lucide-react'
import * as React from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AppBar } from '@/components/layout/shell'
import { PlacePicker } from '@/components/pickers'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Segmented } from '@/components/ui/inputs'
import { ListRow, RowGroup, SentenceCard } from '@/components/ui/surfaces'
import { LANGS } from '@/lib/reference'
import { QUEST_TEMPLATES } from '@/lib/templates'
import type { Lang } from '@/lib/types'
import { addModFromPart, useEditor } from '@/store/editor'
import { useT } from '@/i18n'
import { OfflineChip, TemplateDiagram } from './common'

export function QuickSetupPage() {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const template = QUEST_TEMPLATES.find((x) => x.key === params.get('template'))
  const uiLang = useEditor((s) => s.settings.uiLang)
  const [name, setName] = React.useState('')
  const [lang, setLang] = React.useState<Lang>(uiLang)
  const [station, setStation] = React.useState('Thunder Station')
  const [picker, setPicker] = React.useState(false)
  const [touched, setTouched] = React.useState(false)
  if (!template) return <Navigate to="/" replace />
  const space = template.key === 'space'
  const nameError = touched && !name.trim() ? t('startLib.nameRequired') : undefined

  const create = () => {
    if (!name.trim()) { setTouched(true); return }
    const mod = template.build(name.trim(), station)
    const content = mod.versions[mod.primaryLang]!
    content.settings.lang = lang
    mod.versions = { [lang]: content }
    mod.primaryLang = lang
    const newId = addModFromPart(mod)
    navigate(`/mod/${newId}/overview`, { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-void">
      <AppBar back={() => navigate(-1)} title={t('startLib.quickSetup')} subtitle={t('startLib.templateSubtitle', { name: template.name })}><OfflineChip /></AppBar>
      <form
        onSubmit={(e) => { e.preventDefault(); create() }}
        className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6 px-4 py-5"
      >
        <div className="flex flex-col gap-2 rounded-[4px] border border-edge bg-panel p-3">
          <p className="text-[13px] text-ink/80">{template.description}</p>
          <TemplateDiagram diagram={template.diagram} />
        </div>
        <Field label={t('startLib.questName')} htmlFor="quest-name" help={t('startLib.questNameHelp')} error={nameError}>
          <Input id="quest-name" value={name} autoFocus invalid={!!nameError} maxLength={60} placeholder={t('startLib.questNamePlaceholder')} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} />
        </Field>
        <Field label={t('startLib.language')} help={t('startLib.languageHelp')}>
          <Segmented ariaLabel={t('startLib.language')} value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.key, label: l.label }))} />
        </Field>
        <Field label={t('startLib.whereOffered')} help={space ? t('startLib.whereSpaceHelp') : t('startLib.whereBarHelp')}>
          {space ? (
            <SentenceCard icon={<Orbit className="text-cyan" />} tone="cyan">{t('startLib.startsInSpace')}</SentenceCard>
          ) : (
            <RowGroup>
              <ListRow icon={<Landmark />} title={station || t('startLib.chooseStation')} subtitle={t('startLib.station')} onClick={() => setPicker(true)} />
            </RowGroup>
          )}
        </Field>
        <p className="text-[12px] text-dim">{t('startLib.setupNote')}</p>
        <div className="safe-bottom sticky bottom-0 mt-auto -mx-4 border-t border-edge bg-void/95 px-4 pt-3 backdrop-blur">
          <Button type="submit" variant="solid" size="lg" className="w-full">{t('startLib.createQuest')}</Button>
        </div>
      </form>
      <PlacePicker open={picker} onOpenChange={setPicker} kind="station" value={station} title={t('startLib.whereOffered')} onSelect={(s) => { setStation(s); setPicker(false) }} />
    </div>
  )
}
