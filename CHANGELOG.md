# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-03-18

### Added

- Initial Windows desktop app for recording one or two displays
- Dedicated monitor modes for recording only monitor 1, only monitor 2, or both monitors
- Left/right display ordering before recording
- Recording frame rate control: 15 / 24 / 30 / 60 FPS
- Recording quality control: Original / 1080p / 720p
- Microphone and system audio capture
- Pause and resume support
- MP4 export and audio-only MP3 export
- Installer with selectable installation directory
- English, Chinese, and Japanese README files

### Fixed

- Packaged app white-screen issue caused by absolute asset paths
- Recorder state handling after stop/save
- MP4 export stability issues
- Background rendering throttling improvements during screen capture
