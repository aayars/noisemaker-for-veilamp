# Noisemaker for Veilamp

![Veilamp with the Noisemaker visualizer and control tray open](assets/veilamp-noisemaker.jpg)

[Watch the video](https://shuffleset.stream/noisedeck/video/misc/misc/noisemaker-for-veilamp-v1_1.mp4)

[MIT License](LICENSE) · [Noise Factor](https://noisefactor.io)

A generative audio visualizer for [Veilamp](https://veilamp.com/).
The plugin uses the [Noisemaker](https://github.com/noisefactorllc/noisemaker) shader engine.
It uses programs from [Noisemaker Curated](https://github.com/noisefactorllc/noisemaker-curated).

## Install

1. Clone or download this repository. Run `npm ci` and `npm run build` with Node.js 22 or later.
2. Open Veilamp. Select Settings > Plugins > Import folder.
3. Select the generated `dist/plugin` folder that contains `plugin.json` and `index.js`.
4. Grant the `visualizer` and `player` permissions. Enable the plugin.
5. Open the Noisemaker tab. Play audio with Veilamp.

The `visualizer` permission supplies spectrum and waveform samples.
The `player` permission supplies playback state for pause and track changes.
The plugin does not call player controls or request library access.
If you deny `player`, audio response remains available. Track changes and pause detection require that permission.

To fit Veilamp navigation within the window:

1. Select Settings > Appearance > Import theme.
2. Select `skin.json` from this repository.
3. Select the Noisemaker theme.

The build needs internet access. The installed plugin runs without network requests in standard Veilamp.

## Controls

Open the control tray with the button at the lower right.

| Button | Action |
| --- | --- |
| Dice | Select another program and randomize its audio inputs. |
| TAP | Tap repeatedly to set the tempo. |
| Divider | Tap to cycle through /1, /2, /4, /8, and /16. |
| Info | Show or hide the composition name, author, and code. Off by default. |

The tempo starts at 140 BPM. The divider starts at /4.
The tray shows the current BPM and divider.
The loop duration is four beats multiplied by the divider.
For example, /4 gives a loop of 16 beats.
The keyboard shortcuts are R for randomize, T for tempo, and Escape to close the tray.
The shortcuts apply when the plugin has focus.

Composition information is hidden by default. Enable Info in the tray to show it.
When enabled, the title, author, and program code fade after a short delay.
A track change selects another program when Veilamp grants playback access.
The canvas uses half its normal pixel density when its width or height exceeds 1024 pixels.

## Programs and audio

The plugin renders visuals locally.

The randomizer selects a generative program from the bundled curated collection.
The build includes custom shader definitions where required.
The build rejects programs that require images, media, camera, video, or MIDI.
It replaces up to four numeric runtime parameters with Noisemaker `audio()` inputs.
Programs with one available numeric parameter receive one input.
The audio bounds stay within 0–1. Noisemaker scales them to each parameter's range.
The randomizer forces `aspectLens: false` on every effect with the “1:1 aspect” control.
This applies to explicit values and omitted defaults, so lens effects use the canvas aspect ratio.

Veilamp sends 32 spectrum bands and a mono waveform.
The plugin maps these samples to low, mid, high, volume, spectrum, and waveform values in Noisemaker.
The shader parameters read these values through `audio()`.
Pause clears the audio values. The program's timed animation can continue.

## Build and sources

```sh
npm ci
npm run build
```

Each build downloads the current Noisemaker 1.x release from `shaders.noisedeck.app/1` and the current `main` commit of Noisemaker Curated.
It checks the program and custom shader SHA-256 hashes before bundling them.
The generated entry contains the runtime, shader manifest, required stock effects, custom shaders, and DSL programs.
It must fit Veilamp's 4 MiB entry-script limit.

Import `dist/plugin` into Veilamp. Rebuild and import that folder again to update the engine or collection.
The build records the acquired source revisions and hashes in `dist/plugin/sources.json`.
Git ignores downloads in `.build/` and generated files in `dist/`.
Do not commit the acquired engine, shaders, or collection.

Included sources:

- [Noisemaker](https://github.com/noisefactorllc/noisemaker): browser runtime and stock shaders, MIT, Noise Factor LLC.
- [Noisemaker Curated](https://github.com/noisefactorllc/noisemaker-curated): selected DSL programs and custom shaders, MIT, Noise Factor LLC. Programs are by Alex Ayars and Jess Hewitt.
- [Noiseblaster](https://blaster.noisedeck.app/) and [Visualize](https://github.com/noisefactorllc/visualize) supplied the collection's original and curated program versions.

The generated plugin includes the Noisemaker and collection license notices.

## Network and privacy

The installed plugin makes no network requests. Its entry script blocks network access within the plugin document.
It uses Veilamp audio samples locally for Noisemaker `audio()` inputs.
It uses playback identifiers and radio or CD metadata locally to detect track changes.

Only the build downloads content, from the Noisemaker shader CDN and GitHub.
Build requests do not include Veilamp audio samples, track titles, artist names, library files, or account identifiers.
The receiving services may see connection metadata, such as the client's IP address and user agent.

The plugin does not store logs.
If a program fails, it calls Veilamp's plugin logging API with the public program code and error.
If startup fails, it logs the error.
On Noise Factor's side, we keep basic server logs no longer than 7 days, to aid with troubleshooting.

## Check

Use Node.js 22 or later:

```sh
npm run check
npm test
```

The tests check program selection, audio bounds, event permissions, pause, tempo, divider, captions, and canvas dimensions.
Unit tests use a test renderer. `npm run test:render` checks the built entry with real WebGL and blocks runtime network requests.

## License and attribution

Copyright (c) 2026 Noise Factor LLC.
The repository code uses the [MIT License](LICENSE).
The [Trademark Policy](TRADEMARK.md) covers use of the Noisemaker and Noise Factor names.
