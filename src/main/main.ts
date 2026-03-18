import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  shell
} from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type SaveDialogKind = "video" | "audio";

type ExportOptions = {
  inputPath: string;
  outputPath: string;
  audioOnly: boolean;
};

let mainWindow: BrowserWindow | null = null;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function buildDefaultFilename(extension: "mp4" | "mp3"): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${random}.${extension}`;
}

function getFfmpegPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "ffmpeg.exe");
  }

  return path.join(app.getAppPath(), "ffmpeg.exe");
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1240,
    minHeight: 820,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"));
  }
}

async function ensureTempDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), "dual-screen-recorder");
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function writeTempRecording(buffer: Uint8Array): Promise<string> {
  const tempDir = await ensureTempDir();
  const filePath = path.join(tempDir, `recording-${Date.now()}.webm`);
  await fs.writeFile(filePath, Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  return filePath;
}

function runFfmpeg(options: ExportOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();
    const args = options.audioOnly
      ? [
          "-y",
          "-fflags",
          "+genpts",
          "-i",
          options.inputPath,
          "-vn",
          "-c:a",
          "libmp3lame",
          "-q:a",
          "2",
          options.outputPath
        ]
      : [
          "-y",
          "-fflags",
          "+genpts",
          "-i",
          options.inputPath,
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-r",
          "30",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          options.outputPath
        ];

    const child = spawn(ffmpegPath, args, {
      windowsHide: true
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code ?? -1}`));
    });
  });
}

app.whenReady().then(() => {
  ipcMain.handle("screens:list", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 320, height: 180 }
    });
    const displays = screen.getAllDisplays();

    return sources.map((source) => {
      const display = displays.find((item) => item.id.toString() === source.display_id);

      return {
        id: source.id,
        name: source.name,
        displayId: source.display_id,
        width: display?.size.width ?? 0,
        height: display?.size.height ?? 0,
        scaleFactor: display?.scaleFactor ?? 1
      };
    });
  });

  ipcMain.handle("dialog:save", async (_event, kind: SaveDialogKind) => {
    const defaultDirectory = app.getPath("videos");
    const filters =
      kind === "video"
        ? [{ name: "MP4 Video", extensions: ["mp4"] }]
        : [{ name: "MP3 Audio", extensions: ["mp3"] }];

    const defaultPath =
      kind === "video"
        ? path.join(defaultDirectory, buildDefaultFilename("mp4"))
        : path.join(defaultDirectory, buildDefaultFilename("mp3"));

    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath,
      filters
    });

    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle("recording:write-temp", async (_event, array: Uint8Array) => {
    return writeTempRecording(array);
  });

  ipcMain.handle("recording:export", async (_event, options: ExportOptions) => {
    await runFfmpeg(options);
    return options.outputPath;
  });

  ipcMain.handle("shell:show-item", async (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
