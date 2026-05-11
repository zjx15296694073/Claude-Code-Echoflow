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
  <a href="#桌面端预览">桌面端预览</a> · <a href="#安装方式">安装方式</a> · <a href="#桌面端亮点">桌面端亮点</a> · <a href="#更多文档">更多文档</a>
</p>

---

## 桌面端预览

Claude Code Echoflow 的桌面端把会话、多项目、分支 / Worktree、右侧代码改动、代码 Diff、权限确认、提供商配置和远程入口集中到一个图形化工作台里。

<p align="center">
  <a href="https://github.com/zjx15296694073/Claude-Code-Echoflow/releases"><img src="https://img.shields.io/badge/⬇_下载桌面端-macOS_%7C_Windows-D97757?style=for-the-badge" alt="下载桌面端"></a>
</p>

---

## 安装方式

### 方式一：下载桌面端安装包

前往 [Releases](https://github.com/zjx15296694073/Claude-Code-Echoflow/releases) 下载对应平台的安装包：

- **Windows**：下载 `Claude-Code-Echoflow_*_windows_x64_nsis.exe`，双击安装
- **macOS**：下载 `Claude-Code-Echoflow_*_macos_*.dmg`，拖入 Applications 文件夹
- 如果 macOS 提示无法打开，请在 **系统设置 → 隐私与安全性** 中允许运行

首次启动后，在桌面端设置里配置模型提供商、API Key 和默认模型。推荐使用 **清云EchoflowAPI**（https://api.echoflow.cn）。

### 方式二：从源码启动 CLI

适合想调试底层 CLI、服务端或自行开发的用户：

```bash
bun install
cp .env.example .env
./bin/claude-haha
```

更多配置见 [环境变量](docs/guide/env-vars.md) 和 [全局使用](docs/guide/global-usage.md)。

### 方式三：通过 .env 配置模型

在项目根目录创建 `.env` 文件，填入你的 API 信息：

```env
# 清云EchoflowAPI
ANTHROPIC_AUTH_TOKEN=your_api_key_here
ANTHROPIC_BASE_URL=https://api.echoflow.cn
ANTHROPIC_MODEL=your_model_name

# 通用设置
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

更多第三方模型配置见 [第三方模型接入](docs/guide/third-party-models.md)。

---

## 功能特性

### 核心编码能力

| 功能 | 说明 |
|------|------|
| **代码生成与编辑** | AI 自动编辑文件、创建新文件、重构代码 |
| **代码 Diff 可视化** | 实时查看 AI 对文件的增删改，支持逐行对比 |
| **多文件编辑** | 一次对话可同时修改多个文件 |
| **终端命令执行** | Bash / PowerShell 命令的自动执行与审批 |
| **Git 工作流** | 自动提交、创建 PR、分支管理 |
| **LSP 集成** | 语言服务器协议支持，代码诊断与补全 |
| **Notebook 编辑** | 支持 Jupyter Notebook (.ipynb) 的读写编辑 |
| **全局搜索** | Grep / Glob 文件搜索与内容检索 |

### AI 能力

| 功能 | 说明 |
|------|------|
| **多模型支持** | Claude、GPT、DeepSeek、GLM、Kimi 等 10+ 模型提供商 |
| **多 Agent 编排** | 并行子 Agent 执行、Teams 协作、Buddy 伙伴模式 |
| **Skills 技能系统** | 可扩展的专用能力插件，支持条件激活和自定义工作流 |
| **Plan Mode** | 复杂任务先规划再执行，支持用户审批 |
| **Memory 记忆系统** | 跨会话持久化记忆 (MEMORY.md / CLAUDE.md) |
| **Auto Memory** | 自动提取和写入会话记忆 |
| **Hooks 钩子系统** | 工具调用前后的自定义拦截与处理 |
| **Compact 压缩** | 长对话上下文自动压缩，节省 Token |
| **Task 任务系统** | 创建、跟踪、管理子任务列表 |

### 桌面端特性

| 功能 | 说明 |
|------|------|
| **多标签会话** | 同时进行多个 AI 对话，标签页切换 |
| **项目切换** | 多项目/仓库之间快速切换上下文 |
| **Worktree 隔离** | 基于 Git Worktree 的代码变更隔离 |
| **右侧改动面板** | 聊天时实时查看文件变更状态 |
| **权限审批** | 危险操作集中弹窗确认，支持批量审批 |
| **Computer Use** | AI 截图、点击、键盘输入控制桌面应用 |
| **H5 远程访问** | 手机或浏览器扫码接入桌面端会话 |
| **IM 接入** | 支持钉钉、飞书、Telegram、微信远程对话与审批 |
| **定时任务** | 创建计划任务，定时触发 AI 工作 |
| **Token 用量统计** | 历史 Token 消耗趋势图表 |
| **Voice 语音** | 语音输入与输出支持 |
| **Claude in Chrome** | Chrome 扩展集成，浏览器内编辑 |
| **Vim 模式** | 终端内支持 Vim 键位操作 |
| **暗色/亮色主题** | 多种终端与桌面端主题切换 |
| **国际化** | 中英文双语界面 |

### 开发者工具

| 功能 | 说明 |
|------|------|
| **MCP 协议** | Model Context Protocol 服务端/客户端支持 |
| **Plugin 插件系统** | 可安装第三方插件扩展功能 |
| **Workflow 工作流** | 自定义脚本化工作流 |
| **Bridge 桥接** | 远程控制本地 CLI，手机/Web 端操控 |
| **Daemon 守护** | 后台常驻进程，定时任务/IM 消息监听 |
| **SSH 远程** | SSH 连接到远程服务器操作 |
| **Self-Hosted Runner** | 自托管运行器，自定义执行环境 |
| **Environment Runner** | BYOC (Bring Your Own Compute) 环境运行 |

---

## 更多文档

| 文档 | 说明 |
|------|------|
| [快速上手](docs/desktop/01-quick-start.md) | 桌面端快速上手指南 |
| [安装指南](docs/desktop/04-installation.md) | 详细的安装步骤和问题排查 |
| [架构设计](docs/desktop/02-architecture.md) | 桌面端架构设计说明 |
| [桌面端功能](docs/desktop/03-features.md) | 桌面端功能详细说明 |
| [环境变量](docs/guide/env-vars.md) | 完整环境变量参考 |
| [第三方模型](docs/guide/third-party-models.md) | 接入多种模型提供商 |
| [全局使用](docs/guide/global-usage.md) | 在任意目录启动 claude-haha |
| [常见问题](docs/guide/faq.md) | 常见错误排查 |
| [H5 远程访问](docs/desktop/06-h5-access.md) | 手机或浏览器远程接入桌面端 |
| [Computer Use](docs/features/computer-use.md) | 桌面控制功能 — [架构解析](docs/features/computer-use-architecture.md) |
| [记忆系统](docs/memory/01-usage-guide.md) | 跨会话持久化记忆 — [实现细节](docs/memory/02-implementation.md) |
| [多 Agent 系统](docs/agent/01-usage-guide.md) | 多代理编排与 Teams 协作 |
| [Skills 系统](docs/skills/01-usage-guide.md) | 可扩展能力插件与自定义工作流 |
| [IM 接入](docs/im/) | 钉钉 / 飞书 / Telegram / 微信 接入指南 |

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
