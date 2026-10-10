// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Noise Factor LLC
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Script, SyntheticModule, createContext } from 'node:vm'

const entry = new URL('../plugin/index.js', import.meta.url)

async function boot({ imageComposition = false, random = 0, width = 640, height = 360, dpr = 1, playerGranted = true, catalogTotal = 3, frontEmpty = false, visualBridge = null, compileHook = null } = {}) {
  const source = await readFile(entry, 'utf8').catch(() => '')
  const manifest = JSON.parse(await readFile(new URL('../plugin/plugin.json', import.meta.url), 'utf8'))
  const listeners = new Map()
  const elements = new Map()
  for (const id of ['canvas', 'title', 'credit', 'program-code', 'caption', 'status', 'randomize', 'tap-tempo', 'tray-toggle', 'tray', 'divider']) {
    const classes = new Set()
    elements.set(id, {
      textContent: '', disabled: false, hidden: false, value: '',
      style: {},
      setAttribute(name, value) { this[name] = value },
      classList: { add(value) { classes.add(value) }, remove(value) { classes.delete(value) }, contains(value) { return classes.has(value) } },
      addEventListener(name, fn) { listeners.set(`${id}:${name}`, fn) },
      getBoundingClientRect() { return { width, height } }
    })
  }
  const root = { innerHTML: '', querySelector(selector) { return elements.get(selector.slice(1)) } }
  const events = new Map()
  const timeline = []
  const engine = {
    compile(dsl) { timeline.push('dsl-compile'); return { dsl } },
    unparse(compiled, overrides) {
      const target = overrides[0]?.scale
      return target ? compiled.dsl.replace('scale: 10', `scale: audio(band: audioBand.${['low', 'mid', 'high'][target.band]}, min: ${target.min}, max: ${target.max})`) : compiled.dsl
    },
    extractEffectNamesFromDsl() { return [{ effectId: 'synth/noise' }] },
    extractEffectsFromDsl() { return [{ stepIndex: 0, effectKey: 'synth/noise' }] },
    getEffect() { return { globals: { scale: { type: 'float', min: 1, max: 100 } } } },
    formatValue(v) { return String(v) },
    stdEnums: {},
    CanvasRenderer: class {
      constructor() { engine.renderer = this; this.manifest = { 'synth/noise': {} }; this.compiled = []; this.frames = [] }
      async loadManifest() {}
      async loadEffects() {}
      setLoopDuration(seconds) { this.loopDuration = seconds }
      setAudioState() { return this.audioState = { spectrum: new Float32Array(128), waveform: new Float32Array(128), setRaw(v) { this.raw = v } } }
      async compile(dsl) { if (compileHook) await compileHook(dsl); this.compiled.push(dsl); if (this.started) this.frames.push(dsl); return {} }
      resize() {}
      start() { this.started = true }
      stop() { this.started = false }
    }
  }
  const cards = [
    { code: 'generative', title: 'Noise', username: 'aayars', hasEffects: false },
    { code: 'second', title: 'Another', username: 'jess', hasEffects: false },
    { code: 'image', title: 'Image', username: 'Artist', hasEffects: false }
  ]
  const fetchCalls = []
  let clockNow = 0
  const delayed = new Map()
  let nextTimer = 0
  const fetch = async url => {
    fetchCalls.push(url)
    if (url.includes('/api/feed')) return { ok: true, json: async () => ({ total: catalogTotal, compositions: cards }) }
    if (url.includes('/api/front')) return { ok: true, json: async () => ({ hero: frontEmpty ? null : cards[0], thumbnails: frontEmpty ? [] : cards.slice(1) }) }
    if (url.includes('/api/composition/generative')) return { ok: true, json: async () => ({ dsl: 'search synth, render\nnoise(scale: 10).write(o0)\nrender(o0)', images: [], effects: [] }) }
    if (url.includes('/api/composition/second')) return { ok: true, json: async () => ({ dsl: 'search synth, render\nnoise(scale: 10).write(o0)\nrender(o0)', images: [], effects: [] }) }
    if (url.includes('/api/composition/image')) return { ok: true, json: async () => ({ dsl: 'search synth, render\nmedia().write(o0)\nrender(o0)', images: imageComposition ? [{ id: 'a'.repeat(64), url: 'https://sharing.noisedeck.app/api/images/x' }] : [], effects: [] }) }
    throw new Error(`The test received an unexpected request: ${url}`)
  }
  const caps = {
    visualizer: manifest.permissions.includes('visualizer'),
    player: playerGranted && manifest.permissions.includes('player')
  }
  const veilamp = { caps, visualizer: visualBridge, ready(fn) { fn() }, on(name, fn) {
    const permission = { viz: 'visualizer', playback: 'player', theme: null }
    assert.ok(Object.hasOwn(permission, name), `Veilamp does not support the ${name} event.`)
    if (!permission[name] || caps[permission[name]]) events.set(name, fn)
  }, log(...args) { console.error('VEILAMP LOG', ...args) } }
  const context = createContext({
    document: { getElementById() { return root } },
    window: { devicePixelRatio: dpr, addEventListener() {}, requestAnimationFrame(fn) { return globalThis.setTimeout(fn, 0) } }, veilamp, fetch,
    ResizeObserver: class { observe() {} },
    performance: { now: () => clockNow },
    Math: Object.assign(Object.create(Math), { random: () => random }),
    console, TextEncoder,
    setTimeout(fn, ms) { if (ms < 1000) return globalThis.setTimeout(fn, ms); const id = ++nextTimer; delayed.set(id, { fn, ms }); return id },
    clearTimeout(id) { delayed.delete(id); globalThis.clearTimeout(id) }
  })
  const module = new SyntheticModule(Object.keys(engine), function () {
    for (const [key, value] of Object.entries(engine)) this.setExport(key, value)
  }, { context })
  await module.link(() => {})
  await module.evaluate()
  new Script(source, { importModuleDynamically: () => module }).runInContext(context)
  const startupDeadline = Date.now() + 2000
  while (Date.now() < startupDeadline) {
    if (engine.renderer?.started && !elements.get('randomize').disabled &&
        (!visualBridge || [...delayed.values()].some(timer => timer.ms === 1500))) break
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.ok(engine.renderer?.started, 'The plugin must complete startup.')
  return { root, elements, listeners, events, engine, fetchCalls, timeline,
    setClock(value) { clockNow = value },
    async poll() {
      for (const [id, timer] of delayed) if (timer.ms === 1500) { delayed.delete(id); await timer.fn(); break }
    },
    runDelayed() { for (const { fn } of delayed.values()) fn(); delayed.clear() } }
}

test('The randomizer loads a Noiseblaster program with live audio inputs', async () => {
  const app = await boot()
  assert.match(app.root.innerHTML, /<canvas/)
  assert.match(app.root.innerHTML, /<svg viewBox="0 0 24 24" aria-hidden="true"/)
  assert.equal(app.engine.renderer?.started, true)
  assert.match(app.engine.renderer.compiled.at(-1), /audio\(band: audioBand\./)
  assert.equal(app.elements.get('title').textContent, 'Noise')
  assert.equal(app.elements.get('credit').textContent, 'by Alex Ayars')
})

test('Audio bounds stay within the normalized engine range', async () => {
  for (const random of [0, 0.5, 0.99]) {
    const app = await boot({ random })
    const dsl = app.engine.renderer.compiled.at(-1)
    const bounds = dsl.match(/min: ([\d.-]+), max: ([\d.-]+)/)
    assert.ok(bounds, 'The program must contain audio bounds.')
    const min = Number(bounds[1])
    const max = Number(bounds[2])
    assert.ok(min >= 0 && min <= 1, `The minimum ${min} is outside 0..1.`)
    assert.ok(max >= 0 && max <= 1, `The maximum ${max} is outside 0..1.`)
    assert.notEqual(min, max, 'The audio input must change the parameter.')
  }
})

test('The catalog reads each feed page from page zero', async () => {
  const app = await boot({ catalogTotal: 101, frontEmpty: true })
  const pages = app.fetchCalls.filter(url => url.includes('/api/feed')).map(url => Number(new URL(url).searchParams.get('page')))
  assert.deepEqual(pages, [0, 1, 2])
  assert.equal(app.engine.renderer.started, true)
})

test('The randomizer shows the loading message immediately', async () => {
  const app = await boot()
  app.listeners.get('randomize:click')()
  assert.equal(app.elements.get('status').textContent, 'Randomizing...')
})

test('The UI handles input before the randomizer compiles another DSL program', async () => {
  const app = await boot()
  const previousCompiles = app.timeline.length
  app.listeners.get('randomize:click')()
  let statusDuringUiTask
  await new Promise(resolve => setTimeout(() => {
    statusDuringUiTask = app.elements.get('status').textContent
    app.timeline.push('ui-task')
    app.listeners.get('tray-toggle:click')()
    resolve()
  }, 0))
  const deadline = Date.now() + 1000
  while (app.timeline.length < previousCompiles + 2 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.equal(statusDuringUiTask, 'Randomizing...')
  assert.equal(app.elements.get('tray').hidden, false)
  assert.deepEqual(app.timeline.slice(previousCompiles, previousCompiles + 2), ['ui-task', 'dsl-compile'])
})

test('Veilamp spectrum and waveform data set Noisemaker audio state', async () => {
  const app = await boot()
  assert.ok(app.events.has('viz'))
  app.events.get('viz')({ bars: Array(32).fill(0), rawBars: Float32Array.from({ length: 32 }, (_, i) => i < 8 ? 1 : 0), left: 0.8, right: 0.2, wave: Float32Array.from([-1, 0, 1]) })
  const audio = app.engine.renderer.audioState
  assert.ok(audio.low > audio.mid)
  assert.ok(audio.vol > 0)
  assert.equal(audio.waveform[0], 0)
  assert.equal(audio.waveform[127], 1)
})

test('The randomizer skips programs with images', async () => {
  const app = await boot({ imageComposition: true, random: 0.99 })
  assert.match(app.engine.renderer.compiled.at(-1), /noise\(/)
  assert.doesNotMatch(app.engine.renderer.compiled.at(-1), /media\(/)
})

test('A new track selects another program. Pausing clears audio', async () => {
  const app = await boot()
  const playback = app.events.get('playback')
  assert.ok(playback, 'The plugin must subscribe to playback with the player grant.')
  playback({ remote: false, trackId: 1, playing: true })
  assert.equal(app.elements.get('title').textContent, 'Noise')
  playback({ remote: false, trackId: 2, playing: true })
  const deadline = Date.now() + 1000
  while (app.elements.get('title').textContent !== 'Another' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.equal(app.elements.get('title').textContent, 'Another')
  assert.equal(app.elements.get('credit').textContent, 'by Jess Hewitt')
  app.events.get('viz')({ rawBars: Array(32).fill(1), wave: Array(96).fill(1), left: 1, right: 1 })
  playback({ remote: false, trackId: 2, playing: false })
  assert.equal(app.engine.renderer.audioState.vol, 0)
  assert.equal(app.engine.renderer.audioState.waveform[0], 0.5)
  app.events.get('viz')({ rawBars: Array(32).fill(1), wave: Array(96).fill(1), left: 1, right: 1 })
  assert.equal(app.engine.renderer.audioState.vol, 0, 'Queued audio frames must stay silent during pause.')
  playback({ remote: false, trackId: 2, playing: true })
  app.events.get('viz')({ rawBars: Array(32).fill(1), wave: Array(96).fill(1), left: 1, right: 1 })
  assert.equal(app.engine.renderer.audioState.vol, 1)
})

test('Denied playback access leaves audio routing available', async () => {
  const app = await boot({ playerGranted: false })
  assert.equal(app.events.has('playback'), false)
  assert.ok(app.events.has('viz'))
  app.events.get('viz')({ bars: Array(32).fill(0.5), left: 0.5, right: 0.5 })
  assert.equal(app.engine.renderer.audioState.vol, 0.5)
})

test('The title and program code fade after a short delay', async () => {
  const app = await boot()
  assert.equal(app.elements.get('program-code').textContent, 'generative')
  assert.equal(app.elements.get('caption').classList.contains('is-hidden'), false)
  app.runDelayed()
  assert.equal(app.elements.get('caption').classList.contains('is-hidden'), true)
})

test('The controls start closed. The tray button opens them', async () => {
  const app = await boot()
  assert.equal(app.elements.get('tray').hidden, true)
  app.listeners.get('tray-toggle:click')()
  assert.equal(app.elements.get('tray').hidden, false)
  assert.equal(app.elements.get('tray-toggle')['aria-expanded'], 'true')
})

test('The divider cycles from /4 and sets loop duration', async () => {
  const app = await boot()
  assert.equal(app.elements.get('divider').textContent, '/4')
  assert.equal(app.engine.renderer.loopDuration, (60 / 140) * 4 * 4)
  app.listeners.get('divider:click')()
  assert.equal(app.elements.get('divider').textContent, '/8')
  assert.equal(app.engine.renderer.loopDuration, (60 / 140) * 4 * 8)
  assert.match(app.elements.get('status').textContent, /140 BPM \/8/)
  app.listeners.get('divider:click')()
  assert.equal(app.elements.get('divider').textContent, '/16')
  app.listeners.get('divider:click')()
  assert.equal(app.elements.get('divider').textContent, '/1')
})

test('Tempo taps set the duration of one four-beat loop', async () => {
  const app = await boot()
  const tap = app.listeners.get('tap-tempo:click')
  app.setClock(1000); tap()
  app.setClock(1500); tap()
  app.setClock(2000); tap()
  assert.equal(app.engine.renderer.loopDuration, 8)
  assert.match(app.elements.get('status').textContent, /120 BPM/)
})

test('The canvas uses half pixel density in large windows', async () => {
  const boundary = await boot({ width: 1024, height: 768 })
  assert.equal(boundary.elements.get('canvas').width, 1024)
  const large = await boot({ width: 1200, height: 800 })
  assert.equal(large.elements.get('canvas').width, 600)
  assert.equal(large.elements.get('canvas').height, 400)
})


const sharedDsl = 'search synth, render\nnoise(scale: audio(band: audioBand.high, min: 1, max: 0)).write(o0)\nrender(o0)'

function bridge(initial = { source: null, version: null, dsl: null, available: true }) {
  let state = initial
  const published = []
  const reads = []
  return {
    published, reads,
    set(value) { state = value },
    async setProgram(dsl) { published.push(dsl) },
    async program(source, version) { reads.push([source, version]); return state },
    async source() { return state.source }
  }
}

test('Sharing publishes the compiled audio DSL and receives the exact source DSL', async () => {
  const wire = bridge()
  const app = await boot({ visualBridge: wire })
  assert.equal(wire.published.length, 1)
  assert.equal(wire.published[0], app.engine.renderer.compiled[0])
  assert.match(wire.published[0], /audio\(/)
  wire.set({ source: '1:0', version: 'a', dsl: sharedDsl, available: true })
  await app.poll()
  assert.equal(app.engine.renderer.compiled.at(-1), sharedDsl)
  assert.equal(wire.published.length, 1, 'Received DSL must not produce an echo.')
  assert.equal(app.elements.get('title').textContent, 'Shared visual')
  app.events.get('viz')({ bars: Array(32).fill(0.8), left: 0.8, right: 0.8 })
  assert.ok(Math.abs(app.engine.renderer.audioState.high - 0.8) < 1e-6)
})

test('Unchanged versions do not compile again. Source changes request a fresh snapshot', async () => {
  const wire = bridge({ source: '1:0', version: 'a', dsl: sharedDsl, available: true })
  const app = await boot({ visualBridge: wire })
  const count = app.engine.renderer.compiled.length
  wire.set({ source: '1:0', version: 'a', dsl: null, available: true })
  await app.poll()
  assert.equal(app.engine.renderer.compiled.length, count)
  assert.deepEqual(wire.reads.at(-1), ['1:0', 'a'])
  wire.set({ source: '2:0', version: 'a', dsl: sharedDsl, available: true })
  await app.poll()
  assert.equal(app.engine.renderer.compiled.length, count + 1)
  wire.set({ source: null, version: null, dsl: null, available: true })
  await app.poll()
  assert.notEqual(app.engine.renderer.compiled.at(-1), sharedDsl)
})

test('Shared programs with media, URLs, or excessive text never compile', async () => {
  const wire = bridge()
  const app = await boot({ visualBridge: wire })
  wire.set({ source: '1:0', version: 'valid', dsl: sharedDsl, available: true })
  await app.poll()
  assert.equal(app.engine.renderer.compiled.at(-1), sharedDsl)
  const count = app.engine.renderer.compiled.length
  for (const [i, dsl] of ['media(url: "https://example.com/image.png")', 'noise(url: "https://example.com")', 'x'.repeat(262145)].entries()) {
    wire.set({ source: '1:0', version: String(i), dsl, available: true })
    await app.poll()
    assert.equal(app.engine.renderer.compiled.length, count)
  }
})

test('Dice selects a local visual until the sender changes the shared program', async () => {
  const wire = bridge({ source: '1:0', version: 'a', dsl: sharedDsl, available: true })
  const app = await boot({ visualBridge: wire })
  app.listeners.get('randomize:click')()
  const randomizeDeadline = Date.now() + 2000
  while (app.elements.get('randomize').disabled && Date.now() < randomizeDeadline) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  const local = app.engine.renderer.compiled.at(-1)
  assert.notEqual(local, sharedDsl)
  wire.set({ source: '1:0', version: 'a', dsl: null, available: true })
  await app.poll()
  assert.equal(app.engine.renderer.compiled.at(-1), local)
  wire.set({ source: '1:0', version: 'b', dsl: sharedDsl, available: true })
  await app.poll()
  assert.equal(app.engine.renderer.compiled.at(-1), sharedDsl)
})

test('A temporary disconnect retains the source visual. A different source restores the local visual', async () => {
  const wire = bridge({ source: '1:0', version: 'a', dsl: sharedDsl, available: true })
  const app = await boot({ visualBridge: wire })
  wire.set({ source: '1:0', version: null, dsl: null, available: false })
  await app.poll()
  assert.equal(app.engine.renderer.compiled.at(-1), sharedDsl)
  wire.set({ source: '2:0', version: null, dsl: null, available: false })
  await app.poll()
  assert.notEqual(app.engine.renderer.compiled.at(-1), sharedDsl)
})

test('A new source with invalid DSL restores the local program', async () => {
  const wire = bridge({ source: '1:0', version: 'a', dsl: sharedDsl, available: true })
  const app = await boot({ visualBridge: wire })
  wire.set({ source: '2:0', version: 'b', dsl: 'media()', available: true })
  await app.poll()
  assert.notEqual(app.engine.renderer.compiled.at(-1), sharedDsl)
  assert.equal(app.elements.get('title').textContent, 'Noise')
})

test('A source change during compile cannot apply stale DSL without a player grant', async () => {
  const wire = bridge()
  let finish
  let compiling
  const started = new Promise(resolve => { compiling = resolve })
  const gate = new Promise(resolve => { finish = resolve })
  const app = await boot({ visualBridge: wire, playerGranted: false, compileHook: async dsl => {
    if (dsl === sharedDsl) { compiling(); await gate }
  } })
  wire.set({ source: '1:0', version: 'a', dsl: sharedDsl, available: true })
  const pending = app.poll()
  await started
  wire.set({ source: null, version: null, dsl: null, available: true })
  finish()
  await pending
  assert.notEqual(app.engine.renderer.compiled.at(-1), sharedDsl)
  assert.equal(app.elements.get('title').textContent, 'Noise')
})


test('Rendering pauses until the shared source passes the post-compile check', async () => {
  const wire = bridge()
  let finish
  let compiling
  const started = new Promise(resolve => { compiling = resolve })
  const gate = new Promise(resolve => { finish = resolve })
  const app = await boot({ visualBridge: wire, playerGranted: false, compileHook: async dsl => {
    if (dsl === sharedDsl) { compiling(); await gate }
  } })
  wire.set({ source: '1:0', version: 'a', dsl: sharedDsl, available: true })
  const pending = app.poll()
  await started
  wire.set({ source: null, version: null, dsl: null, available: true })
  finish()
  await pending
  assert.ok(!app.engine.renderer.frames.includes(sharedDsl), 'A stale shared pipeline must never render.')
  assert.equal(app.engine.renderer.started, true, 'The local pipeline must resume rendering.')
})
