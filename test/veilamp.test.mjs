// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Noise Factor LLC
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Script, SyntheticModule, createContext } from 'node:vm'

const entry = new URL('../plugin/index.js', import.meta.url)

async function boot({ imageComposition = false, random = 0, width = 640, height = 360, dpr = 1, playerGranted = true, catalogTotal = 3, frontEmpty = false, lensAspects = null, programDsl = {}, compileHook = null } = {}) {
  const source = await readFile(entry, 'utf8').catch(() => '')
  const manifest = JSON.parse(await readFile(new URL('../plugin/plugin.json', import.meta.url), 'utf8'))
  const listeners = new Map()
  const elements = new Map()
  for (const id of ['canvas', 'title', 'credit', 'program-code', 'caption', 'status', 'randomize', 'tap-tempo', 'tray-toggle', 'tray', 'divider', 'tempo-value']) {
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
  const lensEffects = ['filter/lens', 'filter/spiral', 'filter/lens']
  const program = 'search synth, filter, render\nnoise(scale: 10)' +
    (lensAspects || []).map((aspect, i) => `.${lensEffects[i].split('/')[1]}(antialias: false${aspect === null ? '' : `, aspectLens: ${aspect}`})`).join('') +
    '.write(o0)\nrender(o0)'
  const engine = {
    compile(dsl) { timeline.push('dsl-compile'); return { dsl } },
    unparse(compiled, overrides) {
      const target = overrides[0]?.scale
      let dsl = target ? compiled.dsl.replace('scale: 10', `scale: audio(band: audioBand.${['low', 'mid', 'high'][target.band]}, min: ${target.min}, max: ${target.max})`) : compiled.dsl
      let step = 1
      dsl = dsl.replace(/\b(lens|spiral)\(([^)]*)\)/g, (call, name, args) => {
        const aspect = overrides[step++]?.aspectLens
        if (aspect === undefined) return call
        args = args.replace(/,?\s*aspectLens:\s*(true|false)/g, '')
        return `${name}(${args}, aspectLens: ${aspect})`
      })
      return dsl
    },
    extractEffectNamesFromDsl() { return [{ effectId: 'synth/noise' }, ...(lensAspects || []).map((_, i) => ({ effectId: lensEffects[i] }))] },
    extractEffectsFromDsl() { return [{ stepIndex: 0, effectKey: 'synth/noise' }, ...(lensAspects || []).map((_, i) => ({ stepIndex: i + 1, effectKey: lensEffects[i] }))] },
    getEffect(name) {
      if (name === 'synth/noise') return { globals: { scale: { type: 'float', min: 1, max: 100 } } }
      return { globals: { aspectLens: { type: 'boolean', default: true }, antialias: { type: 'boolean', default: true } } }
    },
    formatValue(v) { return String(v) },
    stdEnums: {},
    CanvasRenderer: class {
      constructor() { engine.renderer = this; this.manifest = { 'synth/noise': {} }; this.compiled = []; this.frames = []; this.attempted = [] }
      async loadManifest() {}
      async loadEffects() {}
      setLoopDuration(seconds) { this.loopDuration = seconds }
      setAudioState() { return this.audioState = { spectrum: new Float32Array(128), waveform: new Float32Array(128), setRaw(v) { this.raw = v } } }
      async compile(dsl) {
        this.attempted.push(dsl)
        this.activeDsl = dsl
        if (this.started) this.frames.push(dsl)
        if (compileHook) await compileHook(dsl, this)
        this.compiled.push(dsl)
        return {}
      }
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
    if (url.includes('/api/composition/generative')) return { ok: true, json: async () => ({ dsl: programDsl.generative ?? program, images: [], effects: [] }) }
    if (url.includes('/api/composition/second')) return { ok: true, json: async () => ({ dsl: programDsl.second ?? program, images: [], effects: [] }) }
    if (url.includes('/api/composition/image')) return { ok: true, json: async () => ({ dsl: 'search synth, render\nmedia().write(o0)\nrender(o0)', images: imageComposition ? [{ id: 'a'.repeat(64), url: 'https://sharing.noisedeck.app/api/images/x' }] : [], effects: [] }) }
    throw new Error(`The test received an unexpected request: ${url}`)
  }
  const caps = {
    visualizer: manifest.permissions.includes('visualizer'),
    player: playerGranted && manifest.permissions.includes('player')
  }
  const standardApiReads = []
  const veilamp = new Proxy({ caps, ready(fn) { fn() }, on(name, fn) {
    const permission = { viz: 'visualizer', playback: 'player', theme: null }
    assert.ok(Object.hasOwn(permission, name), `Veilamp does not support the ${name} event.`)
    if (!permission[name] || caps[permission[name]]) events.set(name, fn)
  }, log(...args) { console.error('VEILAMP LOG', ...args) } }, {
    get(target, name) {
      if (name === 'visualizer') standardApiReads.push(name)
      return Reflect.get(target, name)
    }
  })
  const context = createContext({
    document: { getElementById() { return root } },
    window: { devicePixelRatio: dpr, addEventListener(name, fn) { listeners.set(`window:${name}`, fn) }, requestAnimationFrame(fn) { return globalThis.setTimeout(fn, 0) } }, veilamp, fetch,
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
    if (engine.renderer?.started && !elements.get('randomize').disabled) break
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.ok(engine.renderer?.started, 'The plugin must complete startup.')
  return { root, elements, listeners, events, engine, fetchCalls, timeline, standardApiReads,
    setClock(value) { clockNow = value },
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
  assert.equal(app.elements.get('tempo-value').textContent, '140 BPM /4')
  assert.equal(app.engine.renderer.loopDuration, (60 / 140) * 4 * 4)
  app.listeners.get('divider:click')()
  assert.equal(app.elements.get('divider').textContent, '/8')
  assert.equal(app.elements.get('tempo-value').textContent, '140 BPM /8')
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


test('The plugin uses the standard Veilamp API without checking extension methods', async () => {
  const app = await boot()
  assert.deepEqual(app.standardApiReads, [])
  assert.ok(app.events.has('viz'))
  assert.ok(app.events.has('playback'))
})

test('Remote playback retains local tempo controls and audio response', async () => {
  const app = await boot()
  app.events.get('playback')({ remote: true, trackId: 1, playing: true })
  for (const id of ['randomize', 'tap-tempo', 'divider']) assert.equal(app.elements.get(id).disabled, false)
  app.listeners.get('divider:click')()
  const tap = app.listeners.get('tap-tempo:click')
  app.setClock(1000); tap()
  app.setClock(1500); tap()
  assert.equal(app.elements.get('tempo-value').textContent, '120 BPM /8')
  assert.equal(app.engine.renderer.loopDuration, 16)
  app.events.get('viz')({ rawBars: Array(32).fill(1), left: 1, right: 1 })
  assert.equal(app.engine.renderer.audioState.vol, 1)
  const previous = app.engine.renderer.compiled.length
  app.listeners.get('randomize:click')()
  const deadline = Date.now() + 1000
  while (app.engine.renderer.compiled.length === previous && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.equal(app.engine.renderer.compiled.length, previous + 1)
  assert.equal(app.elements.get('tempo-value').textContent, '120 BPM /8')
})


test('Every lens step disables square aspect while preserving other Boolean settings', async () => {
  const app = await boot({ lensAspects: [true, null, false], width: 1800, height: 180 })
  function check(dsl) {
    const calls = [...dsl.matchAll(/\b(lens|spiral)\(([^)]*)\)/g)]
    assert.equal(calls.length, 3)
    for (const [, , args] of calls) {
      assert.match(args, /aspectLens: false/)
      assert.match(args, /antialias: false/)
    }
    assert.match(dsl, /audio\(band: audioBand\./)
  }
  check(app.engine.renderer.compiled.at(-1))
  const previous = app.engine.renderer.compiled.length
  app.listeners.get('randomize:click')()
  const deadline = Date.now() + 1000
  while (app.engine.renderer.compiled.length === previous && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.equal(app.engine.renderer.compiled.length, previous + 1)
  check(app.engine.renderer.compiled.at(-1))
})


async function finishRandomization(app) {
  const deadline = Date.now() + 1000
  while (app.elements.get('randomize').disabled && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.equal(app.elements.get('randomize').disabled, false)
}

const recoveryPrograms = {
  generative: 'search synth, filter, render\nnoise(scale: 10).lens(aspectLens: false).write(o0)\nrender(o0)',
  second: 'search synth, filter, render\nnoise(scale: 10).spiral(aspectLens: false).write(o0)\nrender(o0)'
}

test('A failed candidate compile restores the accepted visual before rendering resumes', async () => {
  const app = await boot({ programDsl: recoveryPrograms, compileHook(dsl) {
    if (dsl.includes('.spiral(')) throw new Error('Shader compilation failed.')
  } })
  const accepted = app.engine.renderer.activeDsl
  app.listeners.get('randomize:click')()
  await finishRandomization(app)
  assert.equal(app.engine.renderer.activeDsl, accepted)
  assert.equal(app.engine.renderer.started, true)
  assert.equal(app.engine.renderer.attempted.length, 3)
  assert.equal(app.engine.renderer.frames.some(dsl => dsl.includes('.spiral(')), false)
  assert.equal(app.elements.get('title').textContent, 'Noise')
  assert.equal(app.elements.get('program-code').textContent, 'generative')
  assert.equal(app.elements.get('status').textContent, 'Shader compilation failed.')
})

test('Incompatible candidates leave the accepted visual running without a recovery compile', async () => {
  const app = await boot({ programDsl: { second: '' } })
  const accepted = app.engine.renderer.activeDsl
  app.listeners.get('randomize:click')()
  await finishRandomization(app)
  assert.equal(app.engine.renderer.activeDsl, accepted)
  assert.equal(app.engine.renderer.started, true)
  assert.equal(app.engine.renderer.attempted.length, 1)
})

test('A failed recovery keeps rendering stopped and releases the randomizer', async () => {
  let calls = 0
  const app = await boot({ programDsl: recoveryPrograms, compileHook() {
    if (++calls > 1) throw new Error('The renderer is unavailable.')
  } })
  app.listeners.get('randomize:click')()
  await finishRandomization(app)
  assert.equal(app.engine.renderer.started, false)
  assert.equal(app.elements.get('status').textContent, 'Noisemaker could not restore the previous program.')
  assert.equal(app.elements.get('program-code').textContent, 'generative')
})
