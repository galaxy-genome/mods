import * as React from 'react'
import type { Article } from './help-content'

/** Walks a rendered article body for its string content — the same t() strings it displays. */
function collectText(node: React.ReactNode, out: string[]): void {
  if (node == null || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return }
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out)); return }
  if (React.isValidElement(node)) collectText((node.props as { children?: React.ReactNode }).children, out)
}

const bodyTextCache = new WeakMap<Article, string>()

function bodyText(a: Article): string {
  const cached = bodyTextCache.get(a)
  if (cached !== undefined) return cached
  const out: string[] = []
  if (a.body) collectText(a.body(), out)
  const text = out.join(' ')
  bodyTextCache.set(a, text)
  return text
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface HelpMatch {
  article: Article
  /** Highlighted snippet around the first body match, shown only when the title didn't already match. */
  snippet?: React.ReactNode
}

/** Query -> lowercase words; an article matches when every word appears somewhere in it. Rank: title > keyword > body. */
export function searchArticles(articles: Article[], query: string): HelpMatch[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return articles.map((article) => ({ article }))

  const matches: { article: Article; rank: number; body: string }[] = []
  for (const article of articles) {
    const title = article.title.toLowerCase()
    const keywords = article.keywords.toLowerCase()
    const body = bodyText(article)
    const bodyLower = body.toLowerCase()
    if (!words.every((w) => title.includes(w) || keywords.includes(w) || bodyLower.includes(w))) continue
    const rank = words.every((w) => title.includes(w)) ? 0 : words.every((w) => keywords.includes(w)) ? 1 : 2
    matches.push({ article, rank, body })
  }
  matches.sort((a, b) => a.rank - b.rank || articles.indexOf(a.article) - articles.indexOf(b.article))

  return matches.map(({ article, rank, body }) => ({
    article,
    snippet: rank === 2 ? snippetFor(body, words) : undefined,
  }))
}

function snippetFor(body: string, words: string[]): React.ReactNode {
  const lower = body.toLowerCase()
  let hit = -1
  for (const w of words) {
    const i = lower.indexOf(w)
    if (i >= 0 && (hit < 0 || i < hit)) hit = i
  }
  if (hit < 0) return undefined
  const start = Math.max(0, hit - 40)
  const end = Math.min(body.length, hit + 80)
  const raw = body.slice(start, end)
  const re = new RegExp(`(${words.map(escapeRe).join('|')})`, 'gi')
  const parts = raw.split(re).filter((p) => p !== '')
  const children: React.ReactNode[] = []
  if (start > 0) children.push('… ')
  parts.forEach((p, i) => {
    children.push(words.includes(p.toLowerCase()) ? React.createElement('mark', { key: i, className: 'rounded-[2px] bg-cyan/30 text-white' }, p) : p)
  })
  if (end < body.length) children.push(' …')
  return React.createElement(React.Fragment, null, ...children)
}
