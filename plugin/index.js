// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Noise Factor LLC
// Veilamp runs this file as a classic script in a sandboxed srcdoc iframe.
// The file loads the engine and effect bundles from the public Noisemaker CDN.
// The panel receives input. The visualizer permission supplies local audio data.
(function () {
  'use strict'

  const CDN = 'https://shaders.noisedeck.app/1'
  const BLASTER = 'https://blaster.noisedeck.app'
  const DIVIDERS = [1, 2, 4, 8, 16]
  const root = document.getElementById('app')
  root.innerHTML = `
    <style>
      html, body { width:100%; height:100%; margin:0; padding:0; overflow:hidden; background:#05070d; }
      #app { position:fixed; inset:0; overflow:hidden; }
      #app, #app * { box-sizing:border-box; }
      .nm-stage { position:absolute; inset:0; overflow:hidden;
        --nm-control-size:min(42px, calc((100vw - 32px) / 3), calc((100vh - 24px) / 2));
        font:12px/1.3 system-ui,sans-serif; color:#e9f6fa; }
      .nm-stage canvas { position:absolute; inset:0; display:block; width:100%; height:100%; }
      .nm-caption { position:absolute; left:16px; bottom:16px; right:72px; pointer-events:none;
        text-shadow:0 1px 8px #000,0 2px 20px #000;
        opacity:1; transition:opacity .8s ease; }
      .nm-caption.is-hidden { opacity:0; }
      .nm-caption strong { display:block; font-size:14px; font-weight:650; letter-spacing:.02em; }
      .nm-caption small, .nm-caption code { display:block; margin-top:3px; color:#c4d7df; }
      .nm-caption code { font:11px/1.3 ui-monospace,SFMono-Regular,monospace; }
      .nm-tray { flex-direction:column; position:absolute; right:16px; bottom:calc(var(--nm-control-size) + 24px); display:flex; align-items:stretch;
        gap:6px; padding:6px; border:1px solid #64c9d8; border-radius:5px;
        background:#081923ec; box-shadow:0 8px 24px #0009; }
      .nm-tray[hidden] { display:none; }
      .nm-tray-info { display:flex; flex-direction:column; gap:6px; min-width:0; }
      .nm-tray-actions { display:flex; gap:6px; }
      .nm-tempo-value { color:#c4d7df; font-variant-numeric:tabular-nums; }

      .nm-handle { position:absolute; right:16px; bottom:16px; }
      .nm-action { width:var(--nm-control-size); height:var(--nm-control-size);
        display:grid; place-items:center; padding:0; cursor:pointer;
        border:1px solid #64c9d8; border-radius:0; color:#e9f6fa; background:#102331d9;
      }
      .nm-action svg { width:min(24px, calc(var(--nm-control-size) - 6px)); height:min(24px, calc(var(--nm-control-size) - 6px)); fill:currentColor; }
      .nm-action .nm-tap-icon { font:700 11px/1 system-ui,sans-serif; letter-spacing:.04em; }
      .nm-action:not(:disabled):hover, .nm-action:focus-visible { background:#205068; outline:1px solid #b1efff; }
      .nm-action:disabled { opacity:.45; cursor:default; border-color:#78868e; color:#aab4ba; background:#151c23; }
      .nm-divider { font:700 12px system-ui,sans-serif; }
      .nm-status { position:absolute; top:16px; left:16px; right:16px; max-height:calc(100% - 32px);
        overflow:hidden; overflow-wrap:anywhere; color:#f5dfb4;
        text-shadow:0 1px 8px #000; pointer-events:none; }
      @media (max-width:180px), (max-height:150px) {
        .nm-tray { right:4px; bottom:calc(var(--nm-control-size) + 8px); gap:4px; padding:4px; }
        .nm-handle { right:4px; bottom:4px; }
        .nm-caption { left:4px; right:calc(var(--nm-control-size) + 12px); bottom:4px;
          max-height:calc(100% - 8px); overflow:hidden; overflow-wrap:anywhere; }
        .nm-status { top:4px; left:4px; right:4px; max-height:calc(100% - 8px); }
        .nm-tray-actions { gap:4px; }
        .nm-tempo-value { font-size:10px; }
        .nm-action .nm-tap-icon { font-size:9px; }
        .nm-divider { font-size:10px; }
      }
      @media (max-height:150px) {
        .nm-stage { --nm-control-size:min(32px, calc((100vw - 24px) / 3), max(12px, calc(100vh - 16px))); }
        .nm-tray { flex-direction:row; align-items:center; right:calc(var(--nm-control-size) + 12px); bottom:4px;
          max-width:calc(100vw - var(--nm-control-size) - 20px); }
        .nm-tray-info { gap:2px; }
      }
    </style>
    <div class="nm-stage">
      <canvas id="canvas" aria-label="Noisemaker visualizer"></canvas>
      <div class="nm-status" id="status" role="status" aria-live="polite"></div>
      <div class="nm-caption" id="caption"><strong id="title">Noisemaker</strong><small id="credit"></small><code id="program-code"></code></div>
      <div class="nm-tray" id="tray" hidden>
        <div class="nm-tray-info">
          <div class="nm-tempo-value" id="tempo-value"></div>
        </div>
        <div class="nm-tray-actions">
        <button class="nm-action" id="randomize" type="button" aria-label="Randomize the visual program" title="Randomize"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1 .9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2ZM7.5 9A1.5 1.5 0 1 1 9 7.5 1.5 1.5 0 0 1 7.5 9Zm0 9A1.5 1.5 0 1 1 9 16.5 1.5 1.5 0 0 1 7.5 18ZM12 13.5a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 12 13.5ZM16.5 18a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5Zm0-9A1.5 1.5 0 1 1 18 7.5 1.5 1.5 0 0 1 16.5 9Z"/></svg></button>
        <button class="nm-action" id="tap-tempo" type="button" aria-label="Tap tempo" title="Tap tempo"><span class="nm-tap-icon" aria-hidden="true">TAP</span></button>
        <button class="nm-action nm-divider" id="divider" type="button" aria-label="Time divider /4" title="Change time divider">/4</button>
        </div>
      </div>
      <button class="nm-action nm-handle" id="tray-toggle" type="button" aria-label="Visualizer controls" aria-controls="tray" aria-expanded="false" title="Visualizer controls"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h7v2H3V6Zm11 0h7v2h-7V6Zm-3-2h2v6h-2V4ZM3 16h3v2H3v-2Zm7 0h11v2H10v-2Zm-3-2h2v6H7v-6Z"/></svg></button>
    </div>`

  const canvas = root.querySelector('#canvas')
  const title = root.querySelector('#title')
  const credit = root.querySelector('#credit')
  const programCode = root.querySelector('#program-code')
  const caption = root.querySelector('#caption')
  const status = root.querySelector('#status')
  const button = root.querySelector('#randomize')
  const tapButton = root.querySelector('#tap-tempo')
  const tray = root.querySelector('#tray')
  const trayToggle = root.querySelector('#tray-toggle')
  const dividerButton = root.querySelector('#divider')
  const tempoValue = root.querySelector('#tempo-value')
  button.disabled = true
  tray.hidden = true
  dividerButton.textContent = '/4'
  let core = null
  let renderer = null
  let audio = null
  let catalogPromise = null
  let randomizing = null
  let currentCode = null
  let currentDsl = null
  let trackKey = null
  let playbackPlaying = true
  let captionTimer = null
  let statusTimer = null
  let taps = []
  let tempoBpm = 140
  let tempoDivider = 4

  function setStatus(message, duration = 0) {
    clearTimeout(statusTimer)
    status.textContent = message
    if (message && duration) statusTimer = setTimeout(() => { status.textContent = '' }, duration)
  }

  function showCaption() {
    clearTimeout(captionTimer)
    caption.classList.remove('is-hidden')
    captionTimer = setTimeout(() => caption.classList.add('is-hidden'), 4200)
  }

  // Show the loading status before the plugin starts heavy work.
  // Let the UI process input events before the plugin starts heavy work.
  function yieldToUi() {
    return new Promise(resolve => {
      if (typeof window.requestAnimationFrame !== 'function') {
        setTimeout(resolve, 0)
        return
      }
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        resolve()
      }
      const fallback = setTimeout(finish, 120)
      window.requestAnimationFrame(() => {
        if (finished) return
        clearTimeout(fallback)
        setTimeout(finish, 0)
      })
    })
  }

  function clamp01(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
  }

  function isSampleArray(values) {
    return values && (Array.isArray(values) || ArrayBuffer.isView(values))
  }

  function meanBins(values, start, end) {
    let sum = 0
    for (let i = start; i < end; i++) sum += clamp01(values[i])
    return sum / (end - start)
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const largeWindow = Math.max(rect.width, rect.height) > 1024
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * (largeWindow ? 0.5 : 1)
    const width = Math.max(1, Math.min(1920, Math.round(rect.width * scale)))
    const height = Math.max(1, Math.min(1080, Math.round(rect.height * scale)))
    if (canvas.width === width && canvas.height === height) return
    canvas.width = width
    canvas.height = height
    renderer?.resize(width, height)
  }

  function routeViz(frame) {
    if (!audio || !frame) return
    if (!playbackPlaying) { silence(); return }
    const bars = isSampleArray(frame.rawBars) && frame.rawBars.length === 32
      ? frame.rawBars : frame.bars
    if (!isSampleArray(bars) || bars.length !== 32) return
    audio.low = meanBins(bars, 0, 8)
    audio.mid = meanBins(bars, 8, 20)
    audio.high = meanBins(bars, 20, 32)
    audio.vol = Math.max((audio.low + audio.mid + audio.high) / 3,
      clamp01(frame.left), clamp01(frame.right))
    if (audio.spectrum) {
      for (let i = 0; i < audio.spectrum.length; i++) {
        audio.spectrum[i] = clamp01(bars[Math.min(31, Math.floor(i * 32 / audio.spectrum.length))])
      }
    }
    if (audio.fft) {
      for (let i = 0; i < audio.fft.length; i++) audio.fft[i] = clamp01(bars[i * 2])
    }
    const wave = isSampleArray(frame.wave) ? frame.wave : []
    if (audio.waveform) {
      for (let i = 0; i < audio.waveform.length; i++) {
        const sample = wave[Math.floor(i * wave.length / audio.waveform.length)]
        audio.waveform[i] = wave.length ? (clamp01((sample + 1) / 2)) : 0.5
      }
    }
    if (wave.length && audio.setRaw) audio.setRaw(wave[Math.floor(wave.length / 2)])
  }

  function silence() {
    if (!audio) return
    audio.low = audio.mid = audio.high = audio.vol = 0
    audio.spectrum?.fill(0)
    audio.fft?.fill(0)
    audio.waveform?.fill(0.5)
    audio.setRawUnavailable?.()
  }

  function creatorName(username) {
    if (username === 'aayars') return 'Alex Ayars'
    if (username === 'jess') return 'Jess Hewitt'
    return username || 'Unknown'
  }

  function applyTempo() {
    tempoValue.textContent = `${Math.round(tempoBpm)} BPM /${tempoDivider}`
    if (renderer) renderer.setLoopDuration((60 / tempoBpm) * 4 * tempoDivider)
  }

  function setDivider() {
    const options = [1, 2, 4, 8, 16]
    tempoDivider = options[(options.indexOf(tempoDivider) + 1) % options.length]
    dividerButton.textContent = `/${tempoDivider}`
    dividerButton.setAttribute('aria-label', `Time divider /${tempoDivider}`)
    applyTempo()
    setStatus(`${Math.round(tempoBpm)} BPM /${tempoDivider}`, 2200)
  }

  function toggleTray() {
    tray.hidden = !tray.hidden
    trayToggle.setAttribute('aria-expanded', String(!tray.hidden))
  }

  function tapTempo() {
    if (!renderer) return
    const now = performance.now()
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = []
    taps.push(now)
    if (taps.length > 8) taps.shift()
    if (taps.length < 2) {
      setStatus('Tap again', 2200)
      return
    }
    const interval = (taps[taps.length - 1] - taps[0]) / (taps.length - 1)
    const nextBpm = 60000 / interval
    if (!Number.isFinite(nextBpm) || nextBpm <= 40 || nextBpm >= 300) {
      taps = [now]
      setStatus('Tap again', 2200)
      return
    }
    tempoBpm = nextBpm
    applyTempo()
    setStatus(`${Math.round(tempoBpm)} BPM /${tempoDivider}`, 2200)
  }

  async function getCatalog() {
    if (!catalogPromise) catalogPromise = (async () => {
      const first = await fetch(`${BLASTER}/api/feed?page=0&limit=50`)
      if (!first.ok) throw new Error(`Noiseblaster returned HTTP ${first.status} for its program list.`)
      const page = await first.json()
      const count = Math.ceil((page.total || 0) / 50)
      const later = await Promise.all(Array.from({ length: Math.max(0, count - 1) }, (_, i) =>
        fetch(`${BLASTER}/api/feed?page=${i + 1}&limit=50`).then(async response => {
          if (!response.ok) throw new Error(`Noiseblaster returned HTTP ${response.status} for its program list.`)
          return (await response.json()).compositions || []
        })))
      const front = await fetch(`${BLASTER}/api/front`).then(async response => {
        if (!response.ok) return []
        const data = await response.json()
        return [data.hero, ...(data.thumbnails || [])]
      }).catch(() => [])
      const byCode = new Map()
      for (const item of [...front, ...(page.compositions || []), ...later.flat()]) {
        if (item?.code && !item.hasEffects && !byCode.has(item.code)) byCode.set(item.code, item)
      }
      return [...byCode.values()]
    })().catch(error => { catalogPromise = null; throw error })
    return catalogPromise
  }

  // The randomizer selects a Noiseblaster program.
  // It replaces numeric parameters with Noisemaker audio() inputs.
  // It then loads the modified program.
  async function randomize() {
    if (randomizing || !renderer || !core) return randomizing
    randomizing = (async () => {
      button.disabled = true
      setStatus('Randomizing...')
      let pipelineChanged = false
      try {
        await yieldToUi()
        const all = await getCatalog()
        const pool = all.filter(item => item.code !== currentCode)
        if (!pool.length) throw new Error('No generative program is available for selection.')
        let lastError = null
        const attempts = Math.min(pool.length, 15)
        for (let attempt = 0; attempt < attempts; attempt++) {
          const item = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
          try {
            const response = await fetch(`${BLASTER}/api/composition/${encodeURIComponent(item.code)}?images=files`)
            if (!response.ok) throw new Error(`Noiseblaster returned HTTP ${response.status} for a program.`)
            const composition = await response.json()
            const original = composition.dsl
            if (typeof original !== 'string' || !original ||
                composition.images?.length || composition.effects?.length ||
                /\b(?:media|camera|video|midi)\s*\(/i.test(original)) continue

            const effects = core.extractEffectNamesFromDsl(original, renderer.manifest)
            await renderer.loadEffects([...new Set(effects.map(effect => effect.effectId).filter(Boolean))])
            await yieldToUi()
            const candidates = []
            const overrides = {}
            for (const effect of core.extractEffectsFromDsl(original)) {
              const definition = core.getEffect(effect.effectKey)
              // Use the canvas aspect for every lens, including default settings.
              if (definition?.globals?.aspectLens?.type === 'boolean') {
                overrides[effect.stepIndex] = { aspectLens: false }
              }
              for (const [name, spec] of Object.entries(definition?.globals || {})) {
                if (!['float', 'int'].includes(spec.type) || spec.define ||
                    spec.ui?.control === false || name.startsWith('_') ||
                    !Number.isFinite(spec.min) || !Number.isFinite(spec.max) ||
                    spec.min === spec.max) continue
                candidates.push({ step: effect.stepIndex, name, spec })
              }
            }
            if (!candidates.length) continue
            const compiled = core.compile(original)
            const count = Math.min(candidates.length, 2 + Math.floor(Math.random() * 3))
            for (let i = 0; i < count; i++) {
              const index = Math.floor(Math.random() * candidates.length)
              const target = candidates.splice(index, 1)[0]
              const flavor = Math.floor(Math.random() * 3)
              // Noisemaker scales these normalized bounds to the parameter range.
              let min = 0, max = 1
              if (flavor === 1) {
                const width = 0.2 + Math.random() * 0.2
                min = Math.random() * (1 - width)
                max = min + width
              } else if (flavor === 2) {
                min = 1; max = 0
              }
              overrides[target.step] ||= {}
              overrides[target.step][target.name] = {
                type: 'Audio', band: i % 3,
                min: Math.round(min * 1000) / 1000,
                max: Math.round(max * 1000) / 1000
              }
            }
            const dsl = core.unparse(compiled, overrides, {
              enums: core.stdEnums,
              customFormatter: (value, spec) => core.formatValue(value, spec, { enums: core.stdEnums }),
              getEffectDef: name => core.getEffect(name)
            })
            if (!/\baudio\s*\(/.test(dsl)) throw new Error('Noisemaker did not add an audio() input.')
            await yieldToUi()
            renderer.stop()
            pipelineChanged = true
            await renderer.compile(dsl)
            currentDsl = dsl
            renderer.start()
            currentCode = item.code
            title.textContent = item.title || composition.title || 'Untitled'
            credit.textContent = `by ${creatorName(item.username)}`
            programCode.textContent = item.code
            showCaption()
            setStatus('')
            return
          } catch (error) {
            lastError = error
            veilamp.log('Noisemaker skipped a program:', item.code, error.message || error)
          }
        }
        throw lastError || new Error('Noisemaker could not load a compatible generative program.')
      } catch (error) {
        if (pipelineChanged && currentDsl) {
          try {
            await renderer.compile(currentDsl)
            renderer.start()
          } catch (recoveryError) {
            setStatus('Noisemaker could not restore the previous program.')
            veilamp.log('Noisemaker recovery error:', recoveryError)
            return
          }
        }
        setStatus(error.message || 'Noisemaker could not load a program.')
        veilamp.log('Noisemaker error:', error)
      } finally {
        button.disabled = false
      }
    })()
    try { return await randomizing } finally { randomizing = null }
  }

  button.addEventListener('click', () => { void randomize() })
  tapButton.addEventListener('click', tapTempo)
  dividerButton.addEventListener('click', setDivider)
  trayToggle.addEventListener('click', toggleTray)
  window.addEventListener('keydown', event => {
    if (event.key?.toLowerCase() === 'r' && !event.repeat) void randomize()
    if (event.key?.toLowerCase() === 't' && !event.repeat) tapTempo()
    if (event.key === 'Escape' && !tray.hidden) toggleTray()
  })

  veilamp.ready(async () => {
    veilamp.on('viz', routeViz)
    if (veilamp.caps.player) veilamp.on('playback', info => {
      if (typeof info?.playing !== 'boolean') return
      playbackPlaying = info.playing
      if (!playbackPlaying) { silence(); return }
      let next = null
      if (info.radioName != null) next = `radio:${info.radioName}:${info.radioTitle || ''}`
      else if (info.podcastEpisodeId != null) next = `podcast:${info.podcastEpisodeId}`
      else if (info.cd) next = `cd:${info.cd.album}:${info.cd.trackNo}:${info.cd.title}`
      else if (info.trackId != null) next = `${info.remote ? 'remote' : 'local'}:${info.trackId}`
      if (next !== null && trackKey !== null && next !== trackKey) void randomize()
      trackKey = next
    })
    try {
      setStatus('Noisemaker is loading.')
      core = await import(`${CDN}/noisemaker-shaders-core.esm.min.js`)
      resize()
      renderer = new core.CanvasRenderer({
        canvas, width: canvas.width, height: canvas.height,
        basePath: CDN, bundlePath: `${CDN}/effects`, useBundles: true,
        preferWebGPU: false,
        onError: error => { setStatus(error.message || String(error)) }
      })
      await renderer.loadManifest()
      applyTempo()
      audio = renderer.setAudioState()
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas)
      window.addEventListener('resize', resize)
      await randomize()
    } catch (error) {
      setStatus(error.message || 'Noisemaker could not start.')
      veilamp.log('Noisemaker startup error:', error)
    }
  })
})()
