# 开始使用

## Spec Kimi 是什么

Spec Kimi 基于 Kimi Code 二次开发，是一个用于软件开发的终端 AI Agent。它为实现功能、修复 bug、重构、评审和发布提供规格驱动生命周期：明确预期结果，检查并审查计划，批准范围，执行可追踪任务，最后以验证证据完成交付。

可执行命令为 `spec-kimi`，刻意区别于上游的 `kimi`。CLI 以 TypeScript 编写，运行在 Node.js 之上。

## 安装

本发行版通过本项目构建的 `.tgz` 包安装。请不要使用上游安装脚本、Homebrew 公式或上游包仓库命令，它们安装的是上游产品而不是 Spec Kimi。

::: tip 安装之前
Spec Kimi 是全交互式 TUI 应用。推荐使用支持真彩色与连字的终端，例如 [Kitty](https://sw.kovidgoyal.net/kitty/) 或 [Ghostty](https://ghostty.org/)。
:::

### 本地包安装

需要 Node.js 22.19.0 或更高版本，以及本地包产物：

```sh
node --version
npm install -g /absolute/path/to/spec-kimi-<version>.tgz
spec-kimi --version
```

Windows 用户首次启动前还需要安装 [Git for Windows](https://gitforwindows.org/)。Spec Kimi 会使用其中的 Git Bash 作为 Shell 环境；如果 Git Bash 安装在非标准路径，请把 `KIMI_SHELL_PATH` 设为 `bash.exe` 的绝对路径。

::: warning 注意
包产物是本二次开发版本的分发边界。从上游渠道取得的包或安装器不包含本文所述的 Spec Coding 行为。
:::

## 升级与卸载

升级时安装新交付的本地 `.tgz` 包。卸载本地包：

```sh
npm uninstall -g @moonshot-ai/kimi-code
```

## 第一次启动

进入需要工作的项目后运行 `spec-kimi`：

```sh
cd your-project
spec-kimi
```

交互式会话会始终启用 Spec Coding，Agent 按任务判断是否需要进入 Plan 模式。对于需要规划的任务，描述目标、范围、约束和验收标准；Agent 会在实现前将供审查的项目内文档写入 `specs/<name>/`。

使用 `-c` 继续当前工作目录的上一次会话：

```sh
spec-kimi -c
```

`-p` 只用于探索或摘要等非交互输出：

```sh
spec-kimi -p "总结这个仓库的目录结构"
```

`-p` 无法展示供审查的计划，也无法收集审批。任何需要可审计交付的代码变更，都应使用交互式工作流。

首次启动时输入 `/login` 配置供应商。`/login` 支持 Kimi Code OAuth 和 Kimi Platform API 密钥。接入其他供应商时，配置 `~/.kimi-code/config.toml`；详见[平台与模型](../configuration/providers.md)。

## 第一个规格驱动任务

从有明确结果和边界的任务开始，例如：

```
在 src/utils 中新增一个把字符串转换为 kebab-case 的函数。保持公开 API 不变，补充聚焦测试，并在最终化前展示验证证据。
```

审查 `specs/<name>/` 中生成的 `spec.md`。批准后，运行会按任务清单执行工作，勾选任务即为进度更新；实施与验证完成后，Agent 会按模板填写 `delivery.md`。完整生命周期与记录结构见[规格驱动开发](./spec-coding.md)。

## 常用命令与快捷键

输入 `/help` 可打开内置命令和快捷键面板。最常用的控制项：

| 控制项 | 说明 |
| --- | --- |
| `/new` | 开启新会话 |
| `/sessions` | 浏览并恢复历史会话 |
| `/model` | 切换当前模型 |
| `/compact` | 压缩当前上下文 |
| `Esc` | 中断输出或关闭弹窗 |
| `Ctrl-C` | 中断输出；空闲时连按两次退出 |
| `Shift-Tab` | 切换 Plan 模式 |

## 数据存放在哪里

用户级配置、会话、日志和更新缓存默认保存在 `~/.kimi-code/` 下，可用 `KIMI_CODE_HOME` 迁移。Spec Coding 记录则刻意与其分离，保存在项目根目录的 `specs/<name>/`，可与源代码一起审查。

## 下一步

- [规格驱动开发](./spec-coding.md) — 规格、审批、执行、证据和交付生命周期
- [交互与输入](./interaction.md) — 审批、Plan 模式和 YOLO 模式
- [会话与上下文](./sessions.md) — 恢复、压缩和导出会话
