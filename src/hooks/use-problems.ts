import { useEffect, useMemo } from 'react'
import { modProblems } from '@/lib/rules'
import { useEditor } from '@/store/editor'
import { loadGalaxy, useGalaxy } from '@/features/map/galaxy'

export function useProblems(modId: string | undefined) {
  const parts = useEditor((s) => s.parts)
  // Map and system name checks join the list once the galaxy has loaded.
  const { version } = useGalaxy()
  useEffect(() => { loadGalaxy().catch(() => {}) }, [])
  return useMemo(() => {
    const mod = parts.find((m) => m.meta.id === modId)
    const list = mod ? modProblems(mod, parts) : []
    return {
      list,
      errors: list.filter((p) => p.severity === 'error'),
      warnings: list.filter((p) => p.severity === 'warning'),
      tips: list.filter((p) => p.severity === 'tip'),
    }
  }, [parts, modId, version])
}

/** Inline field state from the same problem list the top bar counts, so a field is red exactly when its problem is an error. */
export function useFieldProblems(modId: string | undefined, path: string) {
  const { list } = useProblems(modId)
  return (field: string) => {
    const p = list.find((x) => x.severity !== 'tip' && x.location.path === path && x.location.field === field)
    return {
      error: p?.severity === 'error' ? p.message : undefined,
      warning: p?.severity === 'warning' ? p.message : undefined,
      invalid: p?.severity === 'error',
      warn: p?.severity === 'warning',
    }
  }
}
