/// <reference types="vite/client" />

type ScreenSource = {
  id: string;
  name: string;
  displayId: string;
  width: number;
  height: number;
  scaleFactor: number;
};

declare global {
  interface Window {
    recorderApi: {
      listScreens: () => Promise<ScreenSource[]>;
      showSaveDialog: (kind: "video" | "audio") => Promise<string | null>;
      writeTempRecording: (buffer: Uint8Array) => Promise<string>;
      exportRecording: (options: {
        inputPath: string;
        outputPath: string;
        audioOnly: boolean;
      }) => Promise<string>;
      showItemInFolder: (targetPath: string) => Promise<void>;
    };
  }
}

export {};
