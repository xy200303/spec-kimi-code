<div align="center">

# Spec Kimi

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [English](README.md)

**基于 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 的规格驱动二次开发版本。**

Spec Kimi 保留上游的终端 Agent 基础能力，并把开发过程从非结构化对话改造成可审查、可追踪、可验证的规格驱动工作流。

本发行版的可执行命令是 `spec-kimi`，刻意区别于上游的 `kimi`，以避免两者安装后发生命令冲突。

</div>

---

## 分发方式

本仓库不提供上游下载链接、Homebrew 命令或上游 npm 仓库安装命令。请只安装本项目构建并交付的 `.tgz` 包：

```sh
npm install -g /absolute/path/to/spec-kimi-<version>.tgz
spec-kimi --version
```

运行前需要确保 Node.js 已在 `PATH` 中。该包用于本地或受控分发，不能用上游包或上游安装器替代。

## 与上游 kimi-code 的区别

Spec Kimi 主要在四个方面与上游不同：品牌与命令、规格驱动工作流、IDE 集成，以及 Agent 能力。

### 1. 品牌与可执行命令

- 上游：`kimi`
- Spec Kimi：`spec-kimi`

重命名后的二进制文件可以与上游同时安装，不会产生 PATH 冲突。所有包元数据、CLI 帮助和文档均使用 `spec-kimi`。

### 2. 规格驱动工作流（默认启用）

上游采用开放式对话模型，每轮对话相对独立。Spec Kimi 将开发变成一次可追踪、可审计的规格运行：

| | 上游 kimi-code | Spec Kimi |
|---|---|---|
| 默认模式 | 自由对话 | 默认启用 Spec Coding |
| 计划方式 | 可选 `/plan` 命令 | 交互式会话自动判断是否需要进入 Plan 模式；`spec-kimi --plan` 启动时直接进入 Plan 模式 |
| 产物位置 | 系统/会话级 | 项目内 `specs/<name>/` 目录 |
| 必需文件 | 无 | `spec.md`（需求、设计、任务清单、决策）+ `delivery.md`（交付记录） |
| 进度追踪 | 隐式 | `spec.md` 任务清单是事实来源；勾选任务即更新进度 |
| 验收方式 | 即兴 | 执行前需通过计划审批与验收标准 |
| 交付记录 | 无 | 结构化 `delivery.md`，包含证据、验证与审计链路 |

Spec Kimi 的标准流程为：

1. 明确目标、约束、范围和验收标准。
2. 生成可审查的 `spec.md` 并完成审批。
3. 按 `spec.md` 中的任务清单执行实现，并在文档中勾选任务以更新进度。
4. 验证结果，并按模板填写 `delivery.md`。

`spec-kimi -p` 保留为非交互输出接口，不能展示或审批计划，因此不适合需要可审计过程的开发变更。

### 3. 自适应意图澄清

Spec Kimi 扩展了上游的质疑策略：不仅在任务开始时，而且在任务执行过程中遇到不清晰需求时，都会触发澄清循环。如果用户请求存在歧义、自相矛盾、范围缺失或未验证假设，Agent 会先提出关键问题，并用复述方式让用户确认后再继续。

### 4. VS Code 扩展增强

内置的 VS Code 扩展增加了项目内规格运行集成：

- 项目级规格运行入口。
- 资源视图中列出当前规格运行。
- 可展开的规格运行文档树。
- 展示机器可读的交付记录。
- 任务推进时自动刷新规格运行视图。

### 5. GenerateImage 生图工具

Spec Kimi 新增了内置的 `GenerateImage` 工具，调用 OpenAI 兼容的 `/images/generations` 端点。通过 `config.toml` 配置：

```toml
[services.image_generation]
base_url = "https://api.openai.com/v1"
api_key = "sk-xxxxxxxxxxxxxxxx"
```

该工具会将生成的图片下载到指定路径，根据响应自动推断文件扩展名，并限制单张图片不超过 10 MiB。

### 6. 开发与贡献模式

- 本 fork 维护独立的 `main` 分支。
- `upstream/main` 跟踪 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code)，并定期合并进来。
- 新功能在特性分支上开发，适当时通过规格驱动工作流合并。

## Spec Coding 特性

- **四种处理模式**：直接执行（无 spec）、轻量 Spec（原型/Demo）、标准 Spec（功能迭代）、严格 Spec（架构重构/核心模块）。
- **项目内规格记录**：需要写 spec 的运行写入项目根目录的 `specs/<name>/`，只包含 `spec.md`（需求、设计、任务清单、决策）和 `delivery.md`（交付记录）。规格和交付随项目保存，不再落在难以查看的系统目录。
- **文档即状态**：打开 `spec.md` 就是当前进度；在任务清单中打勾就是状态变更；没有额外的索引或看板工具。
- **适度质疑**：Agent 只在需求模糊且高风险时提问，例如自相矛盾、范围不清、隐含技术选型、假设未验证、边界未定义。低风险或明确任务直接执行。
- **代码质量默认高**：函数必须带注释、避免魔法数字、优先复用成熟方案、保持文件与职责边界清晰。

## 快速开始

进入项目后启动交互式规格工作流：

```sh
cd your-project
spec-kimi
```

描述目标和约束，在批准实现前查看 `specs/<name>/` 下的文档。完整流程与产物结构见仓库内的 [Spec Coding 指南](docs/zh/guides/spec-coding.md)。

## 本地开发

环境要求：Node.js >= 24.15.0、pnpm 10.33.0。

```sh
pnpm install
pnpm --dir apps/kimi-code run dev
pnpm --filter @moonshot-ai/kimi-code run typecheck
```

## 上游与许可证

Spec Kimi 派生自 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code)。上游产品文档和安装渠道描述的是上游产品，不适用于本发行版。

基于 [MIT License](LICENSE) 发布。
