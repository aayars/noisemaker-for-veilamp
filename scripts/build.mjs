import { mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const CDN = 'https://shaders.noisedeck.app'
const COLLECTION = 'https://raw.githubusercontent.com/noisefactorllc/noisemaker-curated'

export function validateCollection(data) {
  if (data.version !== 1 || data.license !== 'MIT' || !Array.isArray(data.programs) || data.count !== data.programs.length || !data.count) throw new Error('Invalid curated manifest.')
  const ids = new Set(), codes = new Set()
  for (const p of data.programs) {
    if (ids.has(p.id) || codes.has(p.code) || !/^[\w-]{4,12}$/.test(p.code)) throw new Error('Invalid or duplicate program identity.')
    ids.add(p.id); codes.add(p.code)
    if (p.license !== 'MIT' || !p.author || !p.title || p.dslFile !== `programs/${p.code}/program.dsl` || !/^[a-f0-9]{64}$/.test(p.dslSha256)) throw new Error('Invalid program metadata.')
    if (p.effectsFile && (p.effectsFile !== `programs/${p.code}/effects.json` || !/^[a-f0-9]{64}$/.test(p.effectsSha256))) throw new Error('Invalid custom shader path or hash.')
  }
  return data
}

async function acquire(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'noisemaker-for-veilamp-build' } })
    if (response.ok) return Buffer.from(await response.arrayBuffer())
    if (!(response.status === 429 || response.status >= 500) || attempt === 3) throw new Error(`Build download HTTP ${response.status}: ${url}`)
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
  }
}
async function json(url) { return JSON.parse((await acquire(url)).toString('utf8')) }
async function parallel(items, fn) {
  const result = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (next < items.length) { const index = next++; result[index] = await fn(items[index], index) }
  }))
  return result
}

export async function buildPlugin() {
  const work = path.join(root, '.build')
  await mkdir(work, { recursive: true })
  const meta = await json(`${CDN}/1/deployment-meta.json`)
  if (!/^1\.\d+\.\d+$/.test(meta.version) || !/^[a-f0-9]{40}$/.test(meta.git_hash)) throw new Error('The CDN did not identify a current 1.x release.')
  const base = `${CDN}/${meta.version}`
  const commit = await json('https://api.github.com/repos/noisefactorllc/noisemaker-curated/commits/main')
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('The curated repository did not identify its current main commit.')
  const collectionBase = `${COLLECTION}/${commit.sha}`
  const library = validateCollection(await json(`${collectionBase}/programs.json`))
  console.log(`Acquiring Noisemaker ${meta.version} and ${library.count} curated programs (${commit.sha.slice(0, 7)}).`)
  const engine = await acquire(`${base}/noisemaker-shaders-core.esm.min.js`)
  await writeFile(path.join(work, 'engine.mjs'), engine)
  const manifest = await json(`${base}/effects/manifest.json`)
  // The acquired browser module defines UI classes at import time. These
  // declarations permit build-time DSL parsing only. No rendering occurs here.
  globalThis.HTMLElement ??= class {}
  globalThis.customElements ??= { define() {}, get() {} }
  const core = await import(pathToFileURL(path.join(work, 'engine.mjs')).href + `?${hash(engine)}`)
  const programs = await parallel(library.programs, async p => {
    const dslBytes = await acquire(`${collectionBase}/${p.dslFile}`)
    if (hash(dslBytes) !== p.dslSha256) throw new Error(`Curated DSL hash mismatch: ${p.code}`)
    const effectsBytes = p.effectsFile ? await acquire(`${collectionBase}/${p.effectsFile}`) : null
    if (effectsBytes && hash(effectsBytes) !== p.effectsSha256) throw new Error(`Custom shader hash mismatch: ${p.code}`)
    const record = { code: p.code, title: p.title, author: p.author, dsl: dslBytes.toString('utf8'), effects: effectsBytes ? JSON.parse(effectsBytes.toString('utf8')) : [] }
    if (/\b(?:media|camera|video|midi)\s*\(/i.test(record.dsl)) throw new Error(`Program requires external input: ${p.code}`)
    return record
  })
  const effectIds = new Set(Object.keys(manifest).filter(id => id.startsWith('util/')))
  for (const p of programs) for (const e of core.extractEffectNamesFromDsl(p.dsl, manifest)) if (e.effectId && !e.effectId.startsWith('user/')) effectIds.add(e.effectId)
  const definitions = new Map()
  for (const p of programs) for (const e of p.effects) {
    const id = `user/${e.func || e.name}`, serialized = JSON.stringify(e)
    if (definitions.has(id) && definitions.get(id) !== serialized) throw new Error(`Conflicting custom effect definitions: ${id}`)
    definitions.set(id, serialized)
  }
  const ids = [...effectIds].sort()
  const hashes = {}
  await parallel(ids, async (id, index) => {
    if (!/^[A-Za-z][\w]*\/[A-Za-z][\w]*$/.test(id) || !manifest[id]) throw new Error(`Invalid effect ID: ${id}`)
    const bytes = await acquire(`${base}/effects/${id}.js`)
    hashes[id] = hash(bytes)
    await writeFile(path.join(work, `effect-${index}.mjs`), bytes)
  })
  const imports = ids.map((id, i) => `import effect${i} from './effect-${i}.mjs'`).join('\n')
  const embedded = `import * as core from './engine.mjs';\n${imports}
const manifest=${JSON.stringify(manifest)};
const programs=${JSON.stringify(programs)};
const bundles={${ids.map((id, i) => `${JSON.stringify(id)}:effect${i}`).join(',')}};
async function initializeRenderer(renderer){
  renderer._manifest=manifest;
  const namespaces={};
  for(const [id,definition] of Object.entries(bundles)){
    const [namespace,name]=id.split('/');
    const instance=typeof definition==='function'?new definition():definition;
    if(definition.shaders&&!instance.shaders)instance.shaders=definition.shaders;
    (namespaces[namespace]??={})[name]=instance;
  }
  for(const [namespace,effects] of Object.entries(namespaces))renderer.registerEffectsFromBundle({namespace,effects});
  await renderer.initEnums();
  renderer.loadManifest=async()=>manifest;
  renderer.loadEffect=async id=>{const effect=renderer._loadedEffects.get(id);if(!effect)throw new Error('Effect is not bundled: '+id);return effect};
  renderer.loadEffects=async ids=>Promise.all(ids.map(id=>renderer.loadEffect(id)));
}
async function prepareProgram(renderer,program){
  for(const effect of program.effects){const id='user/'+(effect.func||effect.name);if(!renderer._loadedEffects.has(id))await renderer.registerPortableEffect(effect)}
}
window.NoisemakerEmbedded={core,programs,initializeRenderer,prepareProgram};
`
  await writeFile(path.join(work, 'embedded.mjs'), embedded)
  const result = await build({ entryPoints: [path.join(work, 'embedded.mjs')], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, write: false })
  const source = await readFile(path.join(root, 'plugin/index.js'), 'utf8')
  const policy = `(function(){const meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="default-src 'none'; connect-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src blob:; media-src blob:; worker-src blob:";document.head.appendChild(meta)})();\n`
  const script = Buffer.from(policy + result.outputFiles[0].text + '\n' + source)
  if (script.length > 4 * 1024 * 1024) throw new Error(`Entry script exceeds Veilamp's 4 MiB limit (${script.length} bytes).`)
  const licenses = await Promise.all([
    acquire(`https://raw.githubusercontent.com/noisefactorllc/noisemaker/${meta.git_hash}/LICENSE`),
    acquire(`${collectionBase}/LICENSE`)
  ])
  const stage = path.join(work, 'plugin-output')
  await rm(stage, { recursive: true, force: true }); await mkdir(stage)
  await writeFile(path.join(stage, 'index.js'), script)
  await writeFile(path.join(stage, 'plugin.json'), await readFile(path.join(root, 'plugin/plugin.json')))
  await writeFile(path.join(stage, 'LICENSE'), await readFile(path.join(root, 'LICENSE')))
  await writeFile(path.join(stage, 'NOISEMAKER-LICENSE'), licenses[0])
  await writeFile(path.join(stage, 'CURATED-LICENSE'), licenses[1])
  await writeFile(path.join(stage, 'sources.json'), JSON.stringify({ noisemaker: meta, curatedCommit: commit.sha, programCount: programs.length, engineSha256: hash(engine), shaderSha256: hashes, entrySha256: hash(script), entryBytes: script.length }, null, 2) + '\n')
  const dist = path.join(root, 'dist')
  await mkdir(dist, { recursive: true })
  await rm(path.join(dist, 'plugin'), { recursive: true, force: true }); await rename(stage, path.join(dist, 'plugin'))
  console.log(`Built dist/plugin: ${script.length} bytes, ${programs.length} programs, ${ids.length} stock effects. No runtime downloads.`)
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await buildPlugin()
