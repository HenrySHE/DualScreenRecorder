import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("recorderApi", {
  listScreens: () => ipcRenderer.invoke("screens:list"),
  showSaveDialog: (kind: "video" | "audio") => ipcRenderer.invoke("dialog:save", kind),
  writeTempRecording: (buffer: Uint8Array) => ipcRenderer.invoke("recording:write-temp", buffer),
  exportRecording: (options: {
    inputPath: string;
    outputPath: string;
    audioOnly: boolean;
  }) => ipcRenderer.invoke("recording:export", options),
  showItemInFolder: (targetPath: string) => ipcRenderer.invoke("shell:show-item", targetPath)
});
