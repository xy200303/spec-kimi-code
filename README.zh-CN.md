# Spec Kimi

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [English](README.md)

Spec Kimi 基于 [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 进行二次开发。它保留上游的终端 Agent 基础能力，并把开发过程从非结构化对话改造成可审查、可追踪、可验证的规格驱动工作流。

本发行版的可执行命令是 `spec-kimi`，刻意区别于上游的 `kimi`，以避免两者安装后发生命令冲突。

## 分发方式

本仓库不提供上游下载链接、Homebrew 命令或上游 npm 仓库安装命令。请只安装本项目构建并交付的 `.tgz` 包：

```sh
npm install -g /absolute/path/to/spec-kimi-<version>.tgz
spec-kimi --version
```

运行前需要确保 Node.js 已在 `PATH` 中。该包用于本地或受控分发，不能用上游包或上游安装器替代。

## 本版本的开发方式

交互式 `spec-kimi` 会话会始终启用 Spec Coding，并默认从 Plan 模式开始。`spec-kimi --plan` 只是显式写出同一种行为，不是另一条开发路径。正常开发流程为：

1. 明确目标、约束、范围和验收标准。
2. 检查项目并生成可审查的规格和设计。
3. 在实现前审批并锁定快照。
4. 用带风险控制和变更追踪的任务执行实现。
5. 验证结果，并输出带证据的交付记录。

`spec-kimi -p` 保留为非交互输出接口，不能展示或审批计划，因此不适合需要可审计过程的开发变更。

## Spec Coding 特性

- **项目内规格记录**：每个运行都写入项目根目录的 `specs/<run-id>/`。其中包含 `spec.md`、`design.md`、`delivery.md` 和机器可读的 `delivery.json`，规格和证据随项目保存，不再落在难以查看的系统目录。
- **目标与审批锁定**：实现前会对获批的规格和设计建立快照；后续文档漂移会被检测，而不是悄悄改变已确认的目标。
- **策略路由**：开发策略路由会选择受控功能开发、故障诊断、重构、评审、发布、研究、规划或 MVP 等策略，并记录选择原因、必需任务类别和建议质量门禁。
- **变更可追踪**：任务记录目的、状态、风险、修改路径、命令和委托轨迹。工具造成的改动能够归因到当前任务。
- **风险分层控制**：低、中、高风险任务使用不同审批要求，审批决策也会留在运行记录中。
- **证据驱动交付**：`fast`、`standard`、`strict`、`release` 四个质量门禁要求逐级增强的证据。完整交付会记录目标、约束、计划、任务、变更、证据、决策、风险、开放问题和回滚说明。
- **最终化锁定**：交付记录最终化后会被锁定，后续工作不能静默改写已经完成的审计链路。

## 快速开始

进入项目后启动交互式规格工作流：

```sh
cd your-project
spec-kimi
```

描述目标和约束，在批准实现前查看 `specs/<run-id>/` 下的文档。完整流程与产物结构见仓库内的 [Spec Coding 指南](docs/zh/guides/spec-coding.md)。

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
