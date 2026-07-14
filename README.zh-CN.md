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

交互式 `spec-kimi` 会话会始终启用 Spec Coding，Agent 按任务判断是否需要进入 Plan 模式。`spec-kimi --plan` 用于在启动时显式进入 Plan 模式。正常开发流程为：

1. 明确目标、约束、范围和验收标准（需要时进入 Plan 模式）。
2. 生成可审查的 `spec.md`，审批后作为本次运行的事实来源。
3. 按 `spec.md` 中的任务清单执行实现，并在文档中勾选任务以更新进度。
4. 验证结果，并按模板填写 `delivery.md`。

`spec-kimi -p` 保留为非交互输出接口，不能展示或审批计划，因此不适合需要可审计过程的开发变更。

## Spec Coding 特性

- **项目内规格记录**：需要写 spec 的运行写入项目根目录的 `specs/<name>/`，只包含 `spec.md`（需求、设计、任务清单、决策）和 `delivery.md`（交付记录）。规格和交付随项目保存，不再落在难以查看的系统目录。
- **文档即状态**：打开 `spec.md` 就是当前进度；在任务清单中打勾就是状态变更；没有额外的索引或看板工具。
- **适度质疑**：Agent 只在需求模糊且高风险时提问，例如自相矛盾、范围不清、隐含技术选型、假设未验证、边界未定义。低风险或明确任务直接执行。
- **代码质量默认高**：函数必须带注释、避免魔法数字、优先复用成熟方案、保持文件与职责边界清晰。
- **四种处理模式**：直接执行（无 spec）、轻量 Spec（原型/Demo）、标准 Spec（功能迭代）、严格 Spec（架构重构/核心模块）。

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
