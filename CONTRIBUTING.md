# Contributing

Thank you for contributing to Dual Screen Recorder.

## Development Setup

Requirements:

- Windows
- Node.js 22+
- npm 11+

Install dependencies:

```bash
npm install
```

Start the app in development mode:

```bash
npm run dev
```

Build locally:

```bash
npm run build
```

Package the Windows installer:

```bash
npm run dist
```

## Pull Requests

Please keep pull requests focused.

Good pull requests usually include:

- a short explanation of the problem
- a clear summary of the fix
- reproduction steps when fixing a bug
- screenshots or recordings when UI behavior changes

## Bug Reports

When opening a bug report, include:

- Windows version
- whether one or two monitors were used
- whether microphone and system audio were enabled
- whether the issue happened during recording, export, or playback
- sample output file details when relevant

## Coding Notes

- The app is Windows-first
- Electron main process lives in `src/main`
- Preload bridge lives in `src/preload`
- Renderer UI and recording logic live in `src/renderer`

## Releases

GitHub Actions can build and publish Windows installers when a version tag such as `v0.1.1` is pushed.
