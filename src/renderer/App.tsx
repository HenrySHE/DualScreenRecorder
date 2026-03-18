import { useEffect, useMemo, useRef, useState } from "react";

type ScreenSource = {
  id: string;
  name: string;
  displayId: string;
  width: number;
  height: number;
  scaleFactor: number;
};

type RecorderSession = {
  stop: () => Promise<Blob>;
  pause: () => void;
  resume: () => void;
  previewStream: MediaStream;
  cleanup: () => void;
};

type FrameRateOption = 15 | 24 | 30 | 60;
type QualityOption = "original" | "1080p" | "720p";

type ExportedFiles = {
  rawPath: string;
  videoPath: string;
  audioPath?: string;
};

const MAX_SCREEN_SELECTION = 2;
const FRAME_RATE_OPTIONS: FrameRateOption[] = [15, 24, 30, 60];
const QUALITY_OPTIONS: Array<{ value: QualityOption; label: string }> = [
  { value: "original", label: "Original" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" }
];

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getTargetHeight(maxHeight: number, quality: QualityOption): number {
  if (quality === "720p") {
    return Math.min(maxHeight, 720);
  }

  if (quality === "1080p") {
    return Math.min(maxHeight, 1080);
  }

  return maxHeight;
}

function getVideoBitrate(frameRate: FrameRateOption, quality: QualityOption): number {
  const baseBitrate = quality === "720p" ? 5_000_000 : quality === "1080p" ? 8_000_000 : 12_000_000;
  if (frameRate >= 60) {
    return Math.round(baseBitrate * 1.35);
  }

  if (frameRate <= 15) {
    return Math.round(baseBitrate * 0.7);
  }

  return baseBitrate;
}

function getMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];

  return candidates.find((item) => MediaRecorder.isTypeSupported(item)) ?? "video/webm";
}

async function getScreenStream(sourceId: string, includeAudio: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: includeAudio
      ? {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId
          }
        }
      : false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId
      }
    } as MediaTrackConstraints
  } as MediaStreamConstraints);
}

async function buildRecorderSession(options: {
  selectedSources: ScreenSource[];
  micEnabled: boolean;
  micDeviceId: string;
  systemAudioEnabled: boolean;
  frameRate: FrameRateOption;
  quality: QualityOption;
}): Promise<RecorderSession> {
  if (options.selectedSources.length === 0) {
    throw new Error("Please select at least one screen.");
  }

  const screenStreams = await Promise.all(
    options.selectedSources.map((source, index) =>
      getScreenStream(source.id, options.systemAudioEnabled && index === 0)
    )
  );

  let micStream: MediaStream | null = null;

  if (options.micEnabled) {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: options.micDeviceId ? { deviceId: { exact: options.micDeviceId } } : true,
      video: false
    });
  }

  const videos = screenStreams.map((stream) => {
    const element = document.createElement("video");
    element.srcObject = stream;
    element.muted = true;
    element.playsInline = true;
    return element;
  });

  await Promise.all(videos.map((video) => video.play()));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const videoMetrics = videos.map((video, index) => ({
    width: video.videoWidth || options.selectedSources[index]?.width || 1920,
    height: video.videoHeight || options.selectedSources[index]?.height || 1080
  }));

  const maxHeight = Math.max(...videoMetrics.map((item) => item.height));
  const targetHeight = getTargetHeight(maxHeight, options.quality);
  const scaledWidths = videoMetrics.map((item) =>
    Math.round((item.width / item.height) * targetHeight)
  );

  canvas.width = scaledWidths.reduce((sum, current) => sum + current, 0);
  canvas.height = targetHeight;

  let drawTimer = 0;
  let isActive = true;
  const frameCallbackIds = new Map<HTMLVideoElement, number>();

  const draw = () => {
    if (!isActive) {
      return;
    }

    ctx.fillStyle = "#07111f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let offsetX = 0;

    videos.forEach((video, index) => {
      const width = scaledWidths[index];
      ctx.drawImage(video, offsetX, 0, width, canvas.height);
      offsetX += width;
    });
  };

  const supportsVideoFrameCallback = "requestVideoFrameCallback" in HTMLVideoElement.prototype;

  const registerVideoFrameLoop = (video: HTMLVideoElement) => {
    const callback = () => {
      draw();
      if (!isActive) {
        return;
      }

      const nextId = video.requestVideoFrameCallback(callback);
      frameCallbackIds.set(video, nextId);
    };

    const firstId = video.requestVideoFrameCallback(callback);
    frameCallbackIds.set(video, firstId);
  };

  draw();

  if (supportsVideoFrameCallback) {
    videos.forEach(registerVideoFrameLoop);
  } else {
    drawTimer = window.setInterval(draw, 1000 / options.frameRate);
  }

  const mixedStream = canvas.captureStream(options.frameRate);
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  let hasAudioTrack = false;

  for (const stream of screenStreams) {
    const [track] = stream.getAudioTracks();
    if (track) {
      hasAudioTrack = true;
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(destination);
    }
  }

  if (micStream) {
    const [track] = micStream.getAudioTracks();
    if (track) {
      hasAudioTrack = true;
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(destination);
    }
  }

  if (hasAudioTrack) {
    destination.stream.getAudioTracks().forEach((track) => mixedStream.addTrack(track));
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(mixedStream, {
    mimeType: getMimeType(),
    videoBitsPerSecond: getVideoBitrate(options.frameRate, options.quality),
    audioBitsPerSecond: 192_000
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.start(1000);

  const stop = () =>
    new Promise<Blob>((resolve, reject) => {
      const handleStop = () => {
        cleanupListeners();
        resolve(new Blob(chunks, { type: "video/webm" }));
      };

      const handleError = (event: Event) => {
        cleanupListeners();
        const errorEvent = event as Event & { error?: DOMException };
        reject(errorEvent.error ?? new Error("Recording stopped unexpectedly."));
      };

      const cleanupListeners = () => {
        recorder.removeEventListener("stop", handleStop);
        recorder.removeEventListener("error", handleError);
      };

      recorder.addEventListener("stop", handleStop, { once: true });
      recorder.addEventListener("error", handleError, { once: true });
      recorder.requestData();
      recorder.stop();
    });

  return {
    previewStream: mixedStream,
    stop,
    pause: () => {
      if (recorder.state === "recording") {
        recorder.pause();
      }
    },
    resume: () => {
      if (recorder.state === "paused") {
        recorder.resume();
      }
    },
    cleanup: () => {
      isActive = false;
      window.clearInterval(drawTimer);
      videos.forEach((video) => {
        const callbackId = frameCallbackIds.get(video);
        if (callbackId !== undefined && "cancelVideoFrameCallback" in video) {
          video.cancelVideoFrameCallback(callbackId);
        }
      });
      void audioContext.close();
      mixedStream.getTracks().forEach((track) => track.stop());
      screenStreams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      micStream?.getTracks().forEach((track) => track.stop());
      videos.forEach((video) => {
        video.pause();
        video.srcObject = null;
      });
    }
  };
}

export default function App() {
  const [screens, setScreens] = useState<ScreenSource[]>([]);
  const [selectedScreenIds, setSelectedScreenIds] = useState<string[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [frameRate, setFrameRate] = useState<FrameRateOption>(30);
  const [quality, setQuality] = useState<QualityOption>("1080p");
  const [selectedMicId, setSelectedMicId] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [files, setFiles] = useState<ExportedFiles | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<RecorderSession | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedStartedAtRef = useRef<number | null>(null);
  const pausedDurationMsRef = useRef<number>(0);

  const orderedSelectedScreens = useMemo(
    () => selectedScreenIds.map((id) => screens.find((screen) => screen.id === id)).filter(Boolean) as ScreenSource[],
    [screens, selectedScreenIds]
  );

  useEffect(() => {
    let timer = 0;

    if (isRecording) {
      timer = window.setInterval(() => {
        const pauseOffset = pausedStartedAtRef.current ? Date.now() - pausedStartedAtRef.current : 0;
        setElapsedMs(Date.now() - startedAtRef.current - pausedDurationMsRef.current - pauseOffset);
      }, 300);
    }

    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    void refreshSources();
  }, []);

  async function refreshSources() {
    const screenSources = await window.recorderApi.listScreens();
    setScreens(screenSources);

    setSelectedScreenIds((current) => {
      if (current.length > 0) {
        return current.filter((id) => screenSources.some((screen) => screen.id === id));
      }

      return screenSources.slice(0, Math.min(MAX_SCREEN_SELECTION, screenSources.length)).map((item) => item.id);
    });

    try {
      const permissionProbe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      permissionProbe.getTracks().forEach((track) => track.stop());
    } catch {
      // Device labels can remain generic until the user grants permission.
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const micDevices = devices.filter((device) => device.kind === "audioinput");
    setMicrophones(micDevices);

    if (!selectedMicId && micDevices.length > 0) {
      setSelectedMicId(micDevices[0].deviceId);
    }
  }

  function toggleScreen(sourceId: string) {
    setSelectedScreenIds((current) => {
      if (current.includes(sourceId)) {
        return current.filter((id) => id !== sourceId);
      }

      if (current.length >= MAX_SCREEN_SELECTION) {
        return [...current.slice(1), sourceId];
      }

      return [...current, sourceId];
    });
  }

  function swapScreenOrder() {
    setSelectedScreenIds((current) => {
      if (current.length !== 2) {
        return current;
      }

      return [current[1], current[0]];
    });
  }

  function setSingleScreen(sourceId: string) {
    setSelectedScreenIds([sourceId]);
  }

  function setDualScreenMode() {
    setSelectedScreenIds(screens.slice(0, Math.min(MAX_SCREEN_SELECTION, screens.length)).map((item) => item.id));
  }

  async function handleStart() {
    if (orderedSelectedScreens.length === 0) {
      setStatus("Select at least one screen before starting.");
      return;
    }

    setIsBusy(true);
    setStatus("Preparing streams...");

    try {
      const session = await buildRecorderSession({
        selectedSources: orderedSelectedScreens,
        micEnabled,
        micDeviceId: selectedMicId,
        systemAudioEnabled,
        frameRate,
        quality
      });

      sessionRef.current = session;
      if (previewRef.current) {
        previewRef.current.srcObject = session.previewStream;
        await previewRef.current.play();
      }

      startedAtRef.current = Date.now();
      pausedStartedAtRef.current = null;
      pausedDurationMsRef.current = 0;
      setElapsedMs(0);
      setFiles(null);
      setIsPaused(false);
      setIsRecording(true);
      setStatus("Recording");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to start recording.");
    } finally {
      setIsBusy(false);
    }
  }

  function handlePauseResume() {
    const session = sessionRef.current;

    if (!session || !isRecording) {
      return;
    }

    if (isPaused) {
      session.resume();
      if (pausedStartedAtRef.current) {
        pausedDurationMsRef.current += Date.now() - pausedStartedAtRef.current;
      }
      pausedStartedAtRef.current = null;
      setIsPaused(false);
      setStatus("Recording");
      return;
    }

    session.pause();
    pausedStartedAtRef.current = Date.now();
    setIsPaused(true);
    setStatus("Paused");
  }

  async function handleStop() {
    if (!sessionRef.current) {
      return;
    }

    setIsBusy(true);
    setStatus("Finalizing recording...");

    const session = sessionRef.current;
    sessionRef.current = null;

    try {
      if (isPaused && pausedStartedAtRef.current) {
        pausedDurationMsRef.current += Date.now() - pausedStartedAtRef.current;
        pausedStartedAtRef.current = null;
      }

      const blob = await session.stop();
      session.cleanup();

      if (previewRef.current) {
        previewRef.current.pause();
        previewRef.current.srcObject = null;
      }

      setIsRecording(false);
      setIsPaused(false);
      setStatus("Recording finished. Choose where to save the MP4.");

      const savePath = await window.recorderApi.showSaveDialog("video");
      if (!savePath) {
        setStatus("Recording finished but video save was canceled.");
        return;
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const rawPath = await window.recorderApi.writeTempRecording(bytes);
      const videoPath = await window.recorderApi.exportRecording({
        inputPath: rawPath,
        outputPath: savePath,
        audioOnly: false
      });

      setFiles({ rawPath, videoPath });
      setStatus(`Saved MP4: ${videoPath}`);
    } catch (error) {
      setIsRecording(false);
      setIsPaused(false);
      setStatus(error instanceof Error ? error.message : "Failed to stop recording.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExportAudio() {
    if (!files?.rawPath) {
      setStatus("No completed recording is available for audio export.");
      return;
    }

    setIsBusy(true);
    setStatus("Exporting audio...");

    try {
      const savePath = await window.recorderApi.showSaveDialog("audio");
      if (!savePath) {
        setStatus("Audio export canceled.");
        return;
      }

      const audioPath = await window.recorderApi.exportRecording({
        inputPath: files.rawPath,
        outputPath: savePath,
        audioOnly: true
      });

      setFiles((current) => (current ? { ...current, audioPath } : current));
      setStatus(`Saved audio: ${audioPath}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to export audio.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Windows Recorder</p>
          <h1>Dual Screen Recorder</h1>
          <p className="lede">
            Simultaneously capture one or two displays, mix system audio and microphone,
            save to MP4, then export a clean audio file when needed.
          </p>
        </div>

        <section className="panel">
          <div className="panel-heading">
            <h2>Screens</h2>
            <button className="ghost-button" onClick={() => void refreshSources()} disabled={isBusy}>
              Refresh
            </button>
          </div>
          <div className="quick-mode-grid">
            {screens.slice(0, 2).map((screen, index) => (
              <button
                key={`single-${screen.id}`}
                className={`secondary-button ${selectedScreenIds.length === 1 && selectedScreenIds[0] === screen.id ? "selected-chip" : ""}`}
                onClick={() => setSingleScreen(screen.id)}
                disabled={isRecording || isBusy}
              >
                {`Only Monitor ${index + 1}`}
              </button>
            ))}
            <button
              className={`secondary-button ${selectedScreenIds.length === 2 ? "selected-chip" : ""}`}
              onClick={setDualScreenMode}
              disabled={isRecording || isBusy || screens.length < 2}
            >
              Record Both Monitors
            </button>
          </div>
          <div className="selection-grid">
            {screens.map((screen) => {
              const active = selectedScreenIds.includes(screen.id);
              const orderIndex = selectedScreenIds.indexOf(screen.id);
              return (
                <button
                  key={screen.id}
                  className={`screen-card ${active ? "active" : ""}`}
                  onClick={() => toggleScreen(screen.id)}
                  disabled={isRecording || isBusy}
                >
                  <span>{screen.name}</span>
                  <small>
                    {screen.width} x {screen.height}
                  </small>
                  {active && <strong>{orderIndex === 0 ? "Left / First" : "Right / Second"}</strong>}
                </button>
              );
            })}
          </div>
          <div className="inline-actions">
            <button
              className="secondary-button"
              onClick={swapScreenOrder}
              disabled={isRecording || isBusy || selectedScreenIds.length !== 2}
            >
              Swap Left / Right
            </button>
          </div>
          <p className="hint">You can record only Monitor 1, only Monitor 2, or both. Recording order controls left/right placement in the exported video.</p>
        </section>

        <section className="panel">
          <h2>Recording Settings</h2>
          <label className="field">
            <span>Frame rate</span>
            <select
              value={frameRate}
              onChange={(event) => setFrameRate(Number(event.target.value) as FrameRateOption)}
              disabled={isRecording || isBusy}
            >
              {FRAME_RATE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} FPS
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Quality</span>
            <select
              value={quality}
              onChange={(event) => setQuality(event.target.value as QualityOption)}
              disabled={isRecording || isBusy}
            >
              {QUALITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">Quality controls the exported resolution target. Original keeps source size, while 1080p and 720p cap output height.</p>
        </section>

        <section className="panel">
          <h2>Audio</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={systemAudioEnabled}
              onChange={(event) => setSystemAudioEnabled(event.target.checked)}
              disabled={isRecording || isBusy}
            />
            <span>Include computer audio</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={micEnabled}
              onChange={(event) => setMicEnabled(event.target.checked)}
              disabled={isRecording || isBusy}
            />
            <span>Include microphone</span>
          </label>
          <label className="field">
            <span>Microphone device</span>
            <select
              value={selectedMicId}
              onChange={(event) => setSelectedMicId(event.target.value)}
              disabled={!micEnabled || isRecording || isBusy}
            >
              {microphones.length === 0 && <option value="">No microphone detected</option>}
              {microphones.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || "Microphone"}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel">
          <h2>Controls</h2>
          <div className="controls">
            <button className="primary-button" onClick={() => void handleStart()} disabled={isRecording || isBusy}>
              Start Recording
            </button>
            <button className="secondary-button" onClick={handlePauseResume} disabled={!isRecording || isBusy}>
              {isPaused ? "Resume Recording" : "Pause Recording"}
            </button>
            <button className="danger-button" onClick={() => void handleStop()} disabled={!isRecording || isBusy}>
              Stop and Save MP4
            </button>
            <button className="secondary-button" onClick={() => void handleExportAudio()} disabled={isRecording || isBusy || !files}>
              Export Audio Only
            </button>
          </div>
          <div className="stat-row">
            <span>Status</span>
            <strong>{status}</strong>
          </div>
          <div className="stat-row">
            <span>Elapsed</span>
            <strong>{formatDuration(elapsedMs)}</strong>
          </div>
        </section>

        {files && (
          <section className="panel">
            <h2>Latest Output</h2>
            <div className="output-list">
              <button className="link-button" onClick={() => void window.recorderApi.showItemInFolder(files.videoPath)}>
                Open MP4 in folder
              </button>
              {files.audioPath && (
                <button className="link-button" onClick={() => void window.recorderApi.showItemInFolder(files.audioPath!)}>
                  Open audio in folder
                </button>
              )}
            </div>
          </section>
        )}
      </aside>

      <main className="preview-stage">
        <div className="stage-header">
          <div>
            <p className="eyebrow">Live Composite</p>
            <h2>Recording Preview</h2>
          </div>
          <div className={`recording-pill ${isRecording ? "live" : ""}`}>
            <span className="dot" />
            {isPaused ? "Paused" : isRecording ? "Recording" : "Idle"}
          </div>
        </div>

        <div className="preview-frame">
          <video ref={previewRef} muted playsInline />
          {!isRecording && <div className="empty-state">Start recording to preview the combined output.</div>}
        </div>

        <div className="feature-strip">
          <article>
            <h3>Dual display composition</h3>
            <p>Two selected screens are stitched side by side in the exact left/right order you choose.</p>
          </article>
          <article>
            <h3>Mixed audio capture</h3>
            <p>System sound and microphone are merged into the same timeline during recording.</p>
          </article>
          <article>
            <h3>Pause and continue</h3>
            <p>Pause the current recording session and continue into the same exported file.</p>
          </article>
        </div>
      </main>
    </div>
  );
}
