// npm test — help search: AND matching across title/keywords/body, ranking, and snippets.
import { strict as assert } from 'node:assert'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { searchArticles } from './helpSearch.ts'
import type { Article } from './help-content.ts'

const article = (slug: string, title: string, keywords: string, bodyText: string): Article => ({
  slug, group: 'Build', title, keywords,
  body: () => React.createElement('p', null, bodyText),
})

const A = article('alpha', 'Setting up ships', 'orders pilot', 'Nothing relevant here.')
const B = article('beta', 'Rewards', 'credits karma', 'Ships receive orders from the station once docked.')
const C = article('gamma', 'Textures', 'skin paint', 'Unrelated body about planets.')

// Multi-word AND: both words must appear (anywhere), order doesn't matter.
assert.deepEqual(searchArticles([A, B, C], 'ships orders').map((m) => m.article.slug), ['alpha', 'beta'])

// Body-only match still found, and ranked below a title/keyword hit.
const results = searchArticles([A, B, C], 'ships orders')
assert.equal(results[0]!.article.slug, 'alpha') // title+keyword match
assert.equal(results[1]!.article.slug, 'beta') // body-only match
assert.ok(results[0]!.snippet === undefined, 'title match needs no snippet')
assert.ok(results[1]!.snippet !== undefined, 'body-only match gets a snippet')

// Snippet highlights the matched words.
const html = renderToStaticMarkup(React.createElement(React.Fragment, null, results[1]!.snippet))
assert.match(html, /<mark[^>]*>Ships<\/mark>/)
assert.match(html, /<mark[^>]*>orders<\/mark>/)

// No match when a word is missing everywhere.
assert.deepEqual(searchArticles([A, B, C], 'ships nonexistentword'), [])

console.log('helpSearch ok')
