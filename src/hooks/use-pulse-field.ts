import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Scrolls to and pulses the element with data-field="<key>" named by the ?field= query,
 * which the Problems sheet sets when it navigates to a problem.
 */
export function usePulseField(deps: unknown[] = []) {
  const [params, setParams] = useSearchParams()
  const field = params.get('field')
  const severity = params.get('sev')
  useEffect(() => {
    if (!field) return
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(field)}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.setProperty('--pulse-color', severity === 'error' ? '#ff5a5a' : severity === 'tip' ? '#35e0f5' : '#ffab3d')
      el.classList.remove('pulse-field')
      void el.offsetWidth
      el.classList.add('pulse-field')
      const next = new URLSearchParams(params)
      next.delete('field'); next.delete('sev')
      setParams(next, { replace: true })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, ...deps])
}
