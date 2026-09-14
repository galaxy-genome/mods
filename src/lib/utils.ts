import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { t } from '@/i18n'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return t('lib.justNow')
  const m = Math.round(s / 60)
  if (m < 60) return t('lib.minutesAgo', { n: m })
  const h = Math.round(m / 60)
  if (h < 24) return t('lib.hoursAgo', { n: h })
  return t('lib.daysAgo', { n: Math.round(h / 24) })
}

export const formatNumber = (n: number) => n.toLocaleString('en-US')
