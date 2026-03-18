# Dual Screen Recorder

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

一个基于 Electron、React 和 FFmpeg 的 Windows 桌面录屏工具。

它适合需要同时录制一个或两个屏幕、同时采集麦克风和系统音频、导出 MP4，并支持单独导出音频文件的场景。

## 功能特性

- 支持录制单屏或双屏
- 支持在录制前切换双屏左右顺序
- 支持同时录制麦克风和电脑系统音频
- 支持暂停和继续录制
- 支持导出 MP4 视频
- 支持从同一段录制中单独导出 MP3 音频
- Windows 安装器支持自定义安装路径
- 默认导出文件名格式为 `YYYY-MM-DD-随机串.mp4`

## 使用场景

- 双屏教学录制
- 软件演示
- 培训或会议录制
- 旁白讲解 + 系统声音采集

## 下载与安装

预编译安装包会发布在 GitHub Releases 页面。

安装步骤：

1. 下载最新安装包
2. 运行安装程序
3. 按需选择安装目录
4. 打开 `Dual Screen Recorder`
5. 选择一个或两个屏幕
6. 设置音频选项
7. 开始录制

## FFmpeg 说明

本项目使用 FFmpeg 来完成最终的视频和音频导出。

对于普通用户：

- 不需要手动安装 FFmpeg
- 打包后的应用会自动内置 FFmpeg

对于开发者：

- 一般也不需要手动安装 FFmpeg
- 项目在开发和打包阶段通过 `ffmpeg-static` 提供 FFmpeg

如果你只是克隆仓库并运行：

```bash
npm install
npm run dev
```

这样就已经具备 FFmpeg 支持。

## 本地开发

### 环境要求

- Windows
- Node.js 22+
- npm 11+

### 启动开发环境

```bash
npm install
npm run dev
```

### 构建

```bash
npm run build
```

### 打包安装器

```bash
npm run dist
```

安装包输出目录为 `release/`。

## 项目结构

```text
src/main        Electron 主进程
src/preload     Electron 与前端之间的安全桥接
src/renderer    React 界面与录制逻辑
release/        打包输出目录
```

## 当前限制

- 当前以 Windows 为主
- FFmpeg 通过 `ffmpeg-static` 集成，并用于导出阶段
- 超长时间录制建议先在你的实际环境中做稳定性验证

## 开源许可证

本项目使用 [MIT License](./LICENSE) 开源。

## 贡献

欢迎提交 Issue 和 Pull Request。

如果要反馈 Bug，建议附带以下信息：

- Windows 版本
- 使用的是单屏还是双屏
- 是否开启麦克风和系统音频
- 问题发生在预览、导出还是播放阶段
