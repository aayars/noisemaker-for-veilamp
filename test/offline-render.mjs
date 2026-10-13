import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const entry = await readFile(new URL('../dist/plugin/index.js', import.meta.url), 'utf8')
const source = await readFile(new URL('../plugin/index.js', import.meta.url), 'utf8')
assert.ok(entry.endsWith(source), 'The render test must use the exact current plugin source.')
const runtime = entry.slice(0, -source.length)
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 320, height: 180 } })
const requests = []
await context.route('**/*', route => { requests.push(route.request().url()); return route.abort() })
await mkdir(new URL('../.build/render-checks/', import.meta.url), { recursive: true })
const encodeScript = code => code.replace(/<\/script>/gi, '<\\/script>')
const setup = await context.newPage()
await setup.setContent(`<script>${encodeScript(runtime)}</script>`)
const candidates = await setup.evaluate(() => window.NoisemakerEmbedded.programs.map((p, index) => ({ code: p.code, title: p.title, index, custom: p.effects.length > 0 })))
const targets = [candidates.find(p => p.code === 'TxGb7g'), candidates.find(p => p.code === 'tif_YQ'), ...candidates.filter(p => p.custom)].filter(Boolean)
await setup.close()
try {
  for (const target of targets) {
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const consoleErrors = []
    page.on('pageerror', error => consoleErrors.push(error.message))
    console.log(`CHECK ${target.code}: initialize`)
    const fixture = `window.vizEvents={};
      window.veilamp={caps:{player:true},ready(fn){fn()},on(name,fn){window.vizEvents[name]=fn},log(...args){console.error(...args)}};
      let seed=12345;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
      window.nextProgram=window.NoisemakerEmbedded.programs.find(p=>p.code==='${target.code === 'TxGb7g' ? 'lhljpw' : 'TxGb7g'}');
      window.NoisemakerEmbedded.programs=[window.NoisemakerEmbedded.programs[${target.index}]];
      const create=window.NoisemakerEmbedded.initializeRenderer;
      window.NoisemakerEmbedded.initializeRenderer=async renderer=>{window.renderProbe=renderer;renderer._onFrame=count=>{if(count>=1)renderer.stop()};await create(renderer)};`
    await page.setContent(`<style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="app"></div><script>${encodeScript(runtime + fixture + source)}</script>`)
    await page.waitForFunction(() => document.getElementById('randomize') && !document.getElementById('randomize').disabled, null, { timeout: 30000 })
    const state = await page.evaluate(() => ({ status: document.getElementById('status').textContent, title: document.getElementById('title').textContent, captionHidden: document.getElementById('caption').classList.contains('is-hidden'), backend: window.renderProbe?.pipeline?.backend?.constructor?.name }))
    if (state.status || state.title !== target.title || consoleErrors.length) throw new Error(`${target.code}: ${JSON.stringify({ state, consoleErrors })}`)
    assert.ok(state.captionHidden, 'Composition information must start hidden.')
    console.log(`CHECK ${target.code}: compiled`)
    await page.evaluate(() => window.vizEvents.viz({ bars: Array(32).fill(0.5), left: 0.5, right: 0.5, wave: [0, 0.5, 0, -0.5] }))
    assert.equal(await page.evaluate(() => window.renderProbe.audioState.low), 0.5)
    const resolvedAudioUniforms = async level => page.evaluate(level => {
      window.renderProbe.stop()
      window.vizEvents.viz({ bars: Array(32).fill(level), left: level, right: level, wave: [0, level, 0, -level] })
      const pipeline = window.renderProbe.pipeline
      return pipeline.graph.passes.map(pass => ({ ...pipeline.resolvePassUniforms(pass, 0.25).uniforms }))
    }, level)
    const lowUniforms = await resolvedAudioUniforms(0.2)
    const highUniforms = await resolvedAudioUniforms(0.8)
    assert.notDeepEqual(lowUniforms, highUniforms, `${target.code}: viz events must change real shader uniforms.`)
    let pixels, colors
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.evaluate(() => { window.renderProbe.stop(); window.renderProbe.render(0.25) })
      pixels = await page.locator('canvas').screenshot({ timeout: 10000 })
      const image = PNG.sync.read(pixels)
      colors = new Set()
      for (let i = 0; i < image.data.length; i += 16) colors.add(`${image.data[i]},${image.data[i + 1]},${image.data[i + 2]}`)
      if (colors.size > 8) break
    }
    assert.ok(colors.size > 8, `${target.code} must render actual nonuniform shader pixels.`)
    await writeFile(new URL(`../.build/render-checks/${target.code}.png`, import.meta.url), pixels)
    console.log(`CHECK ${target.code}: pixels`)
    await page.locator('#tray-toggle').click()
    await page.locator('#caption-toggle').click()
    assert.equal(await page.locator('#caption-toggle').getAttribute('aria-pressed'), 'true')
    await page.locator('#caption-toggle').click()
    assert.equal(await page.locator('#caption-toggle').getAttribute('aria-pressed'), 'false')
    await page.evaluate(() => window.NoisemakerEmbedded.programs.push(window.nextProgram))
    console.log(`CHECK ${target.code}: randomize again`)
    await page.locator('#randomize').click()
    await page.waitForFunction(() => !document.getElementById('randomize').disabled && document.getElementById('title').textContent === window.nextProgram.title, null, { timeout: 30000 })
    const secondState = await page.evaluate(() => { window.renderProbe.stop();return {status:document.getElementById('status').textContent,dsl:window.renderProbe._currentDsl} })
    assert.equal(secondState.status, '')
    assert.match(secondState.dsl, /\baudio\s*\(/)
    console.log(`PASS ${target.code}: ${colors.size} sampled colors, ${createHash('sha256').update(pixels).digest('hex').slice(0, 12)}, audio uniforms, caption controls, second randomization`)
    await page.close()
  }
  assert.deepEqual(requests, [], 'The built plugin must make zero runtime network requests.')
  console.log(`PASS: ${targets.length} real WebGL renders; zero runtime requests.`)
} finally { await browser.close() }
