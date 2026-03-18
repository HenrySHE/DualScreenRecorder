# Dual Screen Recorder

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Windows desktop screen recorder built with Electron, React, and FFmpeg.

It is designed for people who need to record one or two displays at the same time, capture both microphone and system audio, export to MP4, and optionally extract audio as a separate file.

## Features

- Record only monitor 1, only monitor 2, or two displays at the same time
- Swap left/right display order before recording
- Control recording frame rate: 15 / 24 / 30 / 60 FPS
- Control recording quality: Original / 1080p / 720p
- Capture microphone audio and system audio together
- Pause and resume during the same recording session
- Export recordings as MP4
- Export audio-only output as MP3 from the same recording
- Windows installer with selectable installation directory
- Default output naming format: `YYYY-MM-DD-random.mp4`

## How It Works

The app captures selected screens, composites them into one recording surface, mixes audio sources, and then uses FFmpeg to generate the final MP4 or MP3 output.

This project is focused on practical Windows recording workflows:

- tutorials across two monitors
- software demos
- meeting or training recordings
- voiceover + system audio capture

## Downloads

Prebuilt installers are published in the GitHub Releases page.

After downloading:

1. Run the installer
2. Choose the install directory if needed
3. Launch `Dual Screen Recorder`
4. Choose `Only Monitor 1`, `Only Monitor 2`, or `Record Both Monitors`
5. Set frame rate and quality if needed
6. Choose audio options
7. Start recording

## FFmpeg

This project uses FFmpeg for final video and audio export.

For normal users:

- you do not need to install FFmpeg manually
- the packaged app includes FFmpeg automatically

For developers:

- you normally do not need to install FFmpeg manually either
- the project uses the `ffmpeg-static` package during development and packaging

If you are only cloning the repository and running:

```bash
npm install
npm run dev
```

that is enough to get the app running with FFmpeg support.

## Development

### Requirements

- Windows
- Node.js 22+
- npm 11+

### Local setup

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Package Windows installer

```bash
npm run dist
```

The generated installer is placed in `release/`.

## Project Structure

```text
src/main        Electron main process
src/preload     Secure bridge between Electron and renderer
src/renderer    React UI and recording flow
release/        Packaged app output
```

## Current Limitations

- Windows-first project
- FFmpeg is bundled through `ffmpeg-static` and used during export
- Very long recordings should still be tested in your own environment before production use

## License

This project is released under the [MIT License](./LICENSE).

## Contributing

Issues and pull requests are welcome.

If you report a bug, include:

- Windows version
- whether you used one or two monitors
- whether microphone/system audio were enabled
- whether the issue happened during preview, export, or playback
