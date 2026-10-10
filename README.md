# Noisemaker for Veilamp

[MIT License](LICENSE) · [Noise Factor](https://noisefactor.io)

A generative audio visualizer for [Veilamp](https://veilamp.com/).
The plugin uses the [Noisemaker](https://github.com/noisefactorllc/noisemaker) shader engine.
It selects public programs from [Noiseblaster](https://blaster.noisedeck.app/).

## Install

1. Clone or download this repository.
2. Open Veilamp. Select Settings > Plugins > Import folder.
3. Select the `plugin` folder that contains `plugin.json` and `index.js`.
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

The plugin needs internet access to load the runtime, shader assets, and programs.
The files run directly in Veilamp. You can import the files without a build step.
We checked the native integration with Veilamp 0.3.6 on macOS.

## Visuals with friend streams

The optional Veilamp source extension adds automatic DSL sharing.
Both peers need this extension and the Noisemaker plugin enabled.
The existing `visualizer` permission controls DSL access. No new buttons or permissions are required.

When a friend streams your shared track, their plugin receives your current DSL and later program changes.
The receiver renders the program locally and uses their received audio for `audio()` inputs.
The transport sends DSL text and version markers. A DSL comment carries the BPM and divider.
It does not send pixels, images, or audio analysis samples.
It uses Veilamp's signed private-route requests and requires an authorized friend and a shared track.
Signed peer requests contain the requester identity and track ID.
Seance is not a dependency.

The streamer controls Dice, TAP, and the divider.
The listener's tray shows “Visuals currently controlled by peer.” It shows the streamer's current BPM and divider.
All three buttons are gray and disabled for listeners. Keyboard shortcuts cannot change the peer's visual or timing.
BPM and divider changes apply without recompiling unchanged effects.
A temporary disconnect retains the last received visual and timing.
Local playback restores the local visual and timing. It enables the controls again.
Each peer uses its own playback samples and local clock. Matching settings do not guarantee identical frames.
Disabling the plugin or removing its visualizer grant clears its outgoing program.
The outgoing program stays in memory and has a 256 KiB limit.

Standard Veilamp builds keep the plugin's local visuals and audio response.
They need the source extension to share DSL.

To build Veilamp with the extension:

1. Get the official [Veilamp source](https://gitlab.com/wrewtopia-labs-group/veilamp).
2. Check the patch with `python3 extension/apply.py --check /path/to/veilamp`.
3. Apply it with `python3 extension/apply.py /path/to/veilamp`.
4. Follow Veilamp's build instructions. Enable `custom-protocol` for a standalone desktop binary.
5. Import this repository's `plugin` folder into each peer. Enable Noisemaker with the existing grants.

The patch targets the Veilamp 0.3.6 source and includes native transport and sandbox tests.
The Veilamp extension follows upstream MPL-2.0 licensing. This repository's plugin and application script use MIT.

## Controls

Open the control tray with the button at the lower right.

| Button | Action |
| --- | --- |
| Dice | Select another program and randomize its audio inputs. |
| TAP | Tap repeatedly to set the tempo. |
| Divider | Tap to cycle through /1, /2, /4, /8, and /16. |

The local tempo starts at 140 BPM. The divider starts at /4.
The tray shows the current BPM and divider. Listeners use the streamer's values.
The loop duration is four beats multiplied by the divider.
For example, /4 gives a loop of 16 beats.
The keyboard shortcuts are R for randomize, T for tempo, and Escape to close the tray.
The shortcuts apply when the plugin has focus.

The title, author, and program code fade after a short delay.
A track change selects another program when Veilamp grants playback access.
The canvas uses half its normal pixel density when its width or height exceeds 1024 pixels.

Veilamp blocks pointer input for plugins in its built-in Visualizer view.
The plugin uses a panel so its buttons receive input.

## Programs and audio

The randomizer selects a generative program from the public catalog.
It skips programs that require images, media, camera, video, MIDI, or custom effects.
It replaces up to four numeric runtime parameters with Noisemaker `audio()` inputs.
Programs with one available numeric parameter receive one input.
The audio bounds stay within 0–1. Noisemaker scales them to each parameter's range.

Veilamp sends 32 spectrum bands and a mono waveform.
The plugin maps these samples to low, mid, high, volume, spectrum, and waveform values in Noisemaker.
The shader parameters read these values through `audio()`.
Pause clears the audio values. The program's timed animation can continue.

## WAV playback

In a local check, Veilamp 0.3.6 did not play a WAV with an inconsistent RIFF length.
A copy with the corrected RIFF length played.
The copy retained all audio and metadata bytes.
The original file stayed unchanged.
This plugin does not change media files.

## Network and privacy

The plugin sends read-only HTTPS requests to these Noise Factor services:

- `shaders.noisedeck.app` provides the Noisemaker browser runtime and the current version 1 shader manifest. It also provides effect bundles or shader assets for the selected program.
- `blaster.noisedeck.app` provides public program lists and the DSL for selected programs. The plugin may request more catalog pages. It may try another program if a candidate is incompatible.

These HTTPS requests do not include Veilamp audio samples, track titles, artist names, library files, or account identifiers.
It uses audio samples locally to set Noisemaker `audio()` inputs.
It uses playback identifiers and radio or CD metadata locally to detect track changes.

The receiving service and CDN may see connection metadata, such as the client's IP address and user agent.
The code for a requested public program appears in the URL.

The plugin does not store logs.
If a program fails, it calls Veilamp's plugin logging API with the public program code and error.
If startup fails, it logs the error.
The plugin does not control retention of service or CDN access logs.

## Check

Use Node.js 22 or later:

```sh
npm run check
npm test
```

The tests check program selection, audio bounds, event permissions, pause, tempo, divider, captions, and canvas dimensions.
They use a test renderer. They do not prove native playback or GPU rendering.
To check the native integration, import the plugin into Veilamp and use real audio.
Check Play, Pause, the control tray, randomize, TAP, and the divider.

## License and attribution

Copyright (c) 2026 Noise Factor LLC.
The repository code uses the [MIT License](LICENSE).
The [Trademark Policy](TRADEMARK.md) covers use of the Noisemaker and Noise Factor names.

The parameter randomizer follows [Visualize](https://github.com/noisefactorllc/visualize).
The repository does not bundle Veilamp, the Noisemaker runtime, or public programs.
