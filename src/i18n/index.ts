import { useEditor } from '@/store/editor'
import type { Lang } from '@/lib/types'

/**
 * UI strings. Each file in ./<lang>/ default-exports a flat object; its keys are namespaced by file name, so
 * `home.ts` holding `{ download: 'Download' }` is `t('home.download')`.
 * Variables use `{name}`. A key with `_one` / `_other` variants picks by `vars.count`.
 * Languages other than English fall back to English per key.
 *
 * State is held in `var` and built on first use: the store imports modules that call `t()` while this module is
 * still part of an import cycle, before its top-level `let`/`const` would be initialised.
 */
type Table = Record<string, string>

// eslint-disable-next-line no-var
var tablesCache: Partial<Record<Lang, Table>> | undefined
// eslint-disable-next-line no-var
var current: Lang | undefined

function tables() {
  if (tablesCache) return tablesCache
  const modules = import.meta.glob<{ default: Table }>('./*/*.ts', { eager: true })
  const built: Partial<Record<Lang, Table>> = {}
  for (const [path, mod] of Object.entries(modules)) {
    const [, lang, file] = path.match(/^\.\/(\w+)\/([\w-]+)\.ts$/) ?? []
    if (!lang || !file) continue
    const table = (built[lang as Lang] ??= {})
    for (const [k, v] of Object.entries(mod.default)) table[`${file}.${k}`] = v
  }
  return (tablesCache = built)
}

export function setLanguage(lang: Lang) {
  current = lang
  document.documentElement.lang = lang === 'cn' ? 'zh' : lang
}

function lookup(key: string, lang: Lang) {
  const all = tables()
  return all[lang]?.[key] ?? all.en?.[key]
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = current ?? 'en'
  let s: string | undefined
  if (vars && typeof vars.count === 'number') s = lookup(`${key}_${vars.count === 1 ? 'one' : 'other'}`, lang)
  s ??= lookup(key, lang)
  if (s === undefined) {
    if (import.meta.env.DEV) console.warn(`Missing UI string: ${key}`)
    return key
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : s
}

/** Re-renders the component when the interface language changes. */
export function useT() {
  const lang = useEditor((s) => s.settings.uiLang)
  if (lang !== current) setLanguage(lang)
  return t
}
