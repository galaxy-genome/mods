// Lets node run the app's modules in tests: resolves `@/`, extensionless and `.tsx`-free imports to `.ts`, loads JSON
// without import attributes, and stands in for Vite's `import.meta.env` and eager `import.meta.glob`.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import 'fake-indexeddb/auto'

const src = resolvePath(dirname(fileURLToPath(import.meta.url)), '../src')

globalThis.__viteEnv = { DEV: false, PROD: false, BASE_URL: '/', VITE_INCLUDE_PENDING: '1' }
globalThis.__viteGlob = (from, pattern) => {
  if (pattern.startsWith('/')) {
    // Root-relative, one folder deep; a missing folder is an empty match, as in Vite.
    const dir = resolvePath(src, '..', pattern.slice(1, pattern.lastIndexOf('/')))
    const ext = pattern.slice(pattern.lastIndexOf('*') + 1)
    const names = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(ext)) : []
    return Object.fromEntries(names.map((n) => [`${pattern.slice(0, pattern.lastIndexOf('/'))}/${n}`, JSON.parse(readFileSync(resolvePath(dir, n), 'utf8'))]))
  }
  const dir = dirname(fileURLToPath(from))
  const [folder, file] = pattern.replace(/^\.\//, '').split('/')
  const require = createRequire(from)
  const out = {}
  const folders = folder === '*' ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [folder]
  for (const f of folders) {
    const ext = file.replace('*', '')
    for (const name of readdirSync(resolvePath(dir, f)).filter((n) => n.endsWith(ext))) out[`./${f}/${name}`] = require(resolvePath(dir, f, name))
  }
  return out
}

function withExtension(path) {
  for (const candidate of [path, `${path}.ts`, `${path}/index.ts`]) if (existsSync(candidate) && !candidate.endsWith('/') && /\.\w+$/.test(candidate)) return candidate
  return null
}

registerHooks({
  resolve(specifier, context, next) {
    let path = null
    if (specifier.startsWith('@/')) path = resolvePath(src, specifier.slice(2))
    else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) path = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier.split('?')[0])
    if (path) {
      const found = withExtension(path)
      if (found) return { url: pathToFileURL(found).href + (specifier.includes('?') ? specifier.slice(specifier.indexOf('?')) : ''), shortCircuit: true }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith('file:') && url.split('?')[0].endsWith('.json') && context.format !== 'json') {
      return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url.split('?')[0]), 'utf8')}`, shortCircuit: true }
    }
    const result = next(url, context)
    if (url.startsWith(pathToFileURL(src).href) && url.split('?')[0].endsWith('.ts')) {
      const source = String(result.source)
      if (source.includes('import.meta.')) {
        result.source = source.replaceAll('import.meta.env', 'globalThis.__viteEnv').replaceAll('import.meta.glob', 'globalThis.__viteGlob.bind(null, import.meta.url)')
      }
    }
    return result
  },
})
