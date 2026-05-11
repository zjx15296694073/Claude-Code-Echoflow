# Claude Code Echoflow / 清云Echoflow

<p align="center">
  <img src="desktop/public/app-icon.png" alt="Claude Code Echoflow" width="240">
</p>

<div align="center">

[![GitHub Stars](https://img.shields.io/github/stars/zjx15296694073/Claude-Code-Echoflow?style=social)](https://github.com/zjx15296694073/Claude-Code-Echoflow/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/zjx15296694073/Claude-Code-Echoflow?style=social)](https://github.com/zjx15296694073/Claude-Code-Echoflow/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/zjx15296694073/Claude-Code-Echoflow)](https://github.com/zjx15296694073/Claude-Code-Echoflow/issues)
[![License](https://img.shields.io/github/license/zjx15296694073/Claude-Code-Echoflow)](https://github.com/zjx15296694073/Claude-Code-Echoflow/blob/main/LICENSE)
[![中文](https://img.shields.io/badge/🇨🇳_中文-当前-blue)](README.md)

</div>

Claude Code Echoflow（清云Echoflow）是一个**桌面端 Claude Code 工作台**：把会话、多项目、分支 / Worktree、右侧代码改动、代码 Diff、权限审批、模型提供商、Computer Use、H5 远程访问、IM 接入和定时任务集中到一个 macOS / Windows APP 里。

<p align="center">
  <a href="#安装桌面端">安装桌面端</a> · <a href="#桌面端亮点">桌面端亮点</a> · <a href="#从源码启动-cli">从源码启动 CLI</a>
</p>

---

## 安装桌面端

1. 前往 [Releases](https://github.com/zjx15296694073/Claude-Code-Echoflow/releases) 下载 macOS 或 Windows 桌面端安装包。
2. 首次启动后，在桌面端设置里配置模型提供商、API Key 和默认模型。
3. 推荐使用 **清云EchoflowAPI**（https://api.echoflow.cn）作为模型提供商。

## 从源码启动 CLI

适合想调试底层 CLI、服务端或自行开发的用户：

```bash
bun install
cp .env.example .env
./bin/claude-haha
```

---

## 桌面端亮点

- **多会话工作台**：标签页、项目切换、终端入口和会话历史集中管理。
- **分支 / Worktree 启动**：新会话可以选择仓库分支，并决定使用当前工作树还是隔离 Worktree。
- **右侧代码改动面板**：聊天时直接在右侧查看已更改文件、增删行和当前工作区状态。
- **代码修改可视化**：直接查看 AI 对文件的编辑、Diff 和执行过程。
- **权限与确认流**：危险命令、工具调用和 AI 反问可以在桌面端集中审批。
- **多模型提供商**：支持 Anthropic 兼容 API、第三方模型和本地配置。
- **Computer Use**：让 Agent 在授权后截图、点击、输入并控制桌面应用。
- **H5 远程访问**：用一次性令牌在手机或其他设备上接入当前桌面端会话。
- **IM 接入**：通过 Telegram / 飞书 / 微信 / 钉钉远程对话、切换项目和审批权限。
- **定时任务与用量统计**：在桌面端创建计划任务，并查看本机 Token 使用趋势。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript |
| 桌面 APP | Tauri 2 |
| 桌面 UI | React + Vite |
| 本地运行时 | [Bun](https://bun.sh) |
| 终端 UI | React + [Ink](https://github.com/vadimdemedes/ink) |
| CLI 解析 | Commander.js |
| API | Anthropic SDK |
| 协议 | MCP, LSP |

## 感谢

感谢以下开源项目和社区实践为本项目提供参考与启发：

- [React](https://github.com/facebook/react)：前端工程与组件化 UI 生态。
- [Tauri](https://github.com/tauri-apps/tauri)：跨端桌面应用能力与工程实践。
- [cc-haha](https://github.com/NanmiCoder/cc-haha)：本项目基于 cc-haha 二次开发。
- [cc-switch](https://github.com/farion1231/cc-switch)：模型供应商配置能力参考。

---

## ⭐ Star 趋势图

如果这个项目对您有帮助，请给个 ⭐ Star 支持一下！

<a href="https://www.star-history.com/#zjx15296694073/Claude-Code-Echoflow&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=zjx15296694073/Claude-Code-Echoflow&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=zjx15296694073/Claude-Code-Echoflow&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=zjx15296694073/Claude-Code-Echoflow&type=Date" />
  </picture>
</a>

---

## Disclaimer

本项目基于 cc-haha 二次开发，原始源码来源于 Anthropic npm registry。所有原始源码版权归 [Anthropic](https://www.anthropic.com) 所有。仅供学习和研究用途。
