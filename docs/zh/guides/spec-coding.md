# 基于 Spec 的开发

Spec Kimi 将开发记录作为项目的一部分。Agent 会为每个任务选择合适的深度：简单任务直接执行；复杂或模糊的任务先规划。无论哪种方式，完成的变更都应该留下可审查的意图和交付记录，而不是一段未说明缘由的 diff。

## 四种模式

每次任务开始时，Agent 从四种模式中选择一种：

| 模式 | 适用场景 | 产物 |
| --- | --- | --- |
| **直接执行** | Bug 修复、配置变更、简单重构、指令清晰的小任务 | 不写 spec；可事后补充极简 `delivery.md` |
| **原型 spec** | Demo、概念验证、探索性任务 | `spec.md`（核心目标 + 验收标准 + 任务清单）+ `delivery.md` |
| **标准 spec** | 功能模块、迭代开发 | 完整 `spec.md` + `delivery.md` |
| **严格 spec** | 架构重构、核心模块、高风险变更 | 深度 `spec.md`（含风险、关键决策）+ 详细 `delivery.md` |

需要用户确认时，Agent 会调用 `EnterPlanMode` 创建项目本地的 spec 文档并请求审批。只有在需求**既模糊又高风险**时才询问；否则直接执行并允许你后续调整。

## 项目本地记录

一次 spec run 会在项目根目录创建一个语义化命名的目录：

```text
specs/<name>/
  spec.md
  delivery.md
```

`spec.md` 保存需求、设计、任务清单和决策。`delivery.md` 是可读性强的交付记录。复杂项目可以按需添加 `design/` 或 `notes/` 子目录，但核心仍然是这两个文件。

这个路径是有意为之的：文档可以在编辑器中审阅、随项目一起提交、并与源码变更做对比。它们不会被藏在用户级的 Kimi Code 数据目录里。

## spec.md 结构

`spec.md` 以 YAML frontmatter 开头：

```yaml
---
id: nebula-effect
type: feature          # feature | bugfix | optimize | refactor | docs
status: in_progress    # pending | in_progress | done | cancelled
priority: p2           # p0 | p1 | p2 | p3
mode: standard         # prototype | standard | strict
author: user
created: 2024-07-14
updated: 2024-07-14
---
```

正文包含：

- **目标**：要解决什么问题或实现什么效果。
- **验收标准**：用 `- [ ]` / `- [x]` 跟踪的可验证结果清单。
- **约束条件**：范围、技术或资源限制。
- **技术选型**：关键组件/库以及选择理由。
- **任务清单**：分为 进行中 / 已完成 / 待开始；勾选条目即更新状态。
- **风险与应对**：可能出现的问题、概率、影响和应对方案。
- **关键决策**：已经做出的选择及其原因。
- **待确认问题**：尚未解决的高风险问题。
- **变更记录**：需求变更历史。

## delivery.md 结构

`delivery.md` 以 YAML frontmatter 开头：

```yaml
---
spec-id: nebula-effect
version: 1.0.0
status: completed          # draft | completed
completed-at: 2024-07-14T16:20:00Z
---
```

正文包含：

- **实现说明**：架构概览和关键代码逻辑。
- **边界条件**：场景、处理方式与验证结果。
- **测试与验证**：测试策略说明，以及手动/性能/回归测试结果。
- **代码审查**：逐条审查的 checklist。
- **已知问题**：未解决或已推迟的事项。
- **回滚方案**：如何撤销本次变更。
- **变更文件**：新增、修改、删除的文件列表。

Bug 修复的交付记录使用 bug-fix 变体：问题描述、复现步骤、根因分析、修复方案、验证结果和回归测试。

## 质疑原则

Agent 只在需求**既模糊又高风险**时才提问，例如：

- 自相矛盾的需求。
- 范围不清且影响面大的任务。
- 风险显著的隐式技术选型。
- 未经证实的假设。
- 未定义边界。

对于清晰的任务、默认值或低风险变更，Agent 会直接执行，你可以在事后调整。质疑的目的是避免返工，而不是展示严谨。

## 文档即状态

Spec Kimi 没有单独的索引、监听器或仪表盘：

- 打开 `spec.md` 就能看到当前进度。
- 在任务清单里勾选复选框即可改变状态。
- 当人类编辑 `spec.md` 后，Agent 会感知变更并继续。
- 实施完成后，Agent 会按照模板填写 `delivery.md`。

## 使用 CLI

启动项目会话：

```sh
spec-kimi
```

Agent 会根据你的请求决定是否进入 Plan 模式。清晰的小任务直接执行；复杂任务会先生成 `spec.md` 和 `delivery.md` 骨架，然后请求审批。

需要规划时，Agent 会自动调用 `EnterPlanMode`；你也可以用 `--plan` 直接进入 Plan 模式。不要使用 `-p` 执行需要审批的实现工作：`-p` 是非交互式输出接口，无法展示审批步骤。

## 下一步

- [快速开始](./getting-started.md) — 安装本地包并启动项目会话
- [交互与输入](./interaction.md) — 审批与 Plan 模式交互细节
- [会话与上下文](./sessions.md) — 恢复和导出会话
