---
id: agent-core-image-generation-tool
type: feature
status: done
priority: p2
mode: standard
author: user
created: 2026-07-14
updated: 2026-07-14
---

# Agent Core 增加生图工具

## 目标

在 `packages/agent-core` 中新增一个名为 `GenerateImage` 的内置工具，让 Agent 能够调用 OpenAI 兼容的 `/images/generations` 接口生成图片，将图片下载到本地工作目录，并返回保存路径。配置、鉴权和后端实现通过现有的服务注入机制接入，保持 `agent-core` 与具体厂商实现解耦。

## 验收标准

- [x] 新增 `GenerateImageTool`，工具 schema 暴露 `prompt`、`output_path`，以及可选的 `model`、`size`、`quality`、`style`、`n` 字段。
- [x] 工具仅在 `services.imageGeneration` 配置存在时被注册；未配置时不向模型暴露。
- [x] 工具调用时先通过路径安全策略解析 `output_path`，再请求后端生成图片并下载到该路径；当 `n > 1` 时生成多个文件并返回所有路径。
- [x] 下载完成后根据响应字节自动推断图片格式，若 `output_path` 无扩展名则自动追加正确的扩展名。
- [x] 错误处理覆盖：鉴权失败、网络/超时错误、后端返回非 2xx、路径越权/敏感路径、空提示词等，返回带分类前缀的错误信息。
- [x] 新增 `OpenAIImageGenerationProvider`，实现 `ImageGenerationProvider` 接口，支持 `apiKey` / `tokenProvider` 两种鉴权方式、自定义 `baseUrl` / `defaultHeaders` / `customHeaders`，并可通过 `fetchImpl` 注入以便测试。
- [x] `config.toml` 中新增 `[services.image_generation]` 段，字段与 `MoonshotServiceConfig` 一致（`base_url`、`api_key`、`oauth`、`custom_headers`），读写均可通过现有 TOML 配置流程。
- [x] 在 `ToolServices` 中新增 `imageGenerator` 字段，并在 `rpc/core-impl.ts` 的 `createRuntimeConfig` 中根据配置创建 Provider 注入 Agent。
- [x] 新增单元测试覆盖：工具 schema、成功生成并保存、多图保存、无扩展名自动补全、各类错误分类、Provider HTTP 请求格式与鉴权回退、TOML 配置序列化/反序列化。
- [x] `pnpm --filter @moonshot-ai/agent-core typecheck` 通过；相关新增/修改测试通过（全量测试存在与本次改动无关的预失败）。

## 约束条件

- 仅修改 `packages/agent-core` 内的文件，以及 `packages/agent-core` 自身暴露的类型；不侵入 `apps/*` 或 `packages/server`。
- 不引入新的运行时依赖，使用项目已有的 `zod`、`undici`（如需要）或全局 `fetch`。
- 必须复用现有的路径访问控制（`resolvePathAccessPath`）、工具结果构建器（`ToolResultBuilder`）、服务配置模型（`MoonshotServiceConfig`）和服务注入机制（`ToolServices`）。
- 默认不启用；必须通过 `config.toml` 显式配置 `[services.image_generation]` 才会注册工具。

## 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 后端接口 | OpenAI 兼容 `/images/generations` | 用户明确要求，且与现有 Provider 抽象一致。 |
| Provider 模式 | `ImageGenerationProvider` 接口 + `OpenAIImageGenerationProvider` 实现 | 与 `WebSearchProvider` / `UrlFetcher` 保持一致，便于注入和测试。 |
| 配置模型 | 复用 `MoonshotServiceConfig` | 字段完全满足需求，无需新增类型。 |
| 文件下载 | 工具内使用 `fetch` 下载，Kaos `writeBytes` 写入 | 路径访问、二进制写入都已由现有基础设施支持。 |
| 输入显示 | `ToolInputDisplay` 的 `generic` 类型 | 协议中暂无专门图片生成显示类型，使用 `generic` 避免跨包修改协议。 |

## 任务清单

### 已完成

- [x] 已确认需求范围与实现方式。
- [x] 创建 `packages/agent-core/src/tools/builtin/image/generate-image.ts` 与 `generate-image.md`，实现 `GenerateImageTool`。
- [x] 创建 `packages/agent-core/src/tools/providers/openai-image-generation.ts`，实现 `ImageGenerationProvider` 与 `OpenAIImageGenerationProvider`。
- [x] 在 `packages/agent-core/src/tools/support/services.ts` 的 `ToolServices` 中新增 `imageGenerator?: ImageGenerationProvider`。
- [x] 在 `packages/agent-core/src/config/schema.ts` 的 `ServicesConfigSchema` 与 `ServicesConfigPatchSchema` 中新增 `imageGeneration: MoonshotServiceConfigSchema.optional()`。
- [x] 在 `packages/agent-core/src/config/toml.ts` 中新增 `image_generation` 的序列化/反序列化支持。
- [x] 在 `packages/agent-core/src/tools/builtin/index.ts` 中导出 `GenerateImageTool` 与 Provider 类型。
- [x] 在 `packages/agent-core/src/agent/tool/index.ts` 的 `initializeBuiltinTools` 中，当 `toolServices?.imageGenerator` 存在时注册 `GenerateImageTool`。
- [x] 在 `packages/agent-core/src/rpc/core-impl.ts` 的 `createRuntimeConfig` 中，根据 `config.services?.imageGeneration` 创建 `OpenAIImageGenerationProvider` 并注入 `ToolServices`。
- [x] 新增测试：`test/tools/generate-image.test.ts`、`test/tools/providers/openai-image-generation.test.ts`，并补充 `test/config/configs.test.ts` 中关于 `image_generation` 的用例。
- [x] 运行 `pnpm --filter @moonshot-ai/agent-core typecheck` 与相关测试，修复失败。
- [x] 生成 changeset `.changeset/agent-core-generate-image-tool.md`。

## 风险与应对

| 风险 | 概率 | 影响 | 应对方案 |
|------|------|------|----------|
| 路径安全与扩展名自动追加冲突 | 中 | 中 | 先在解析后的基础路径上操作，追加扩展名前不再次做完整路径检查，但确保追加后仍在同一目录；测试覆盖无扩展名与有扩展名两种情况。 |
| 不同厂商对 `/images/generations` 的响应字段/参数有差异 | 中 | 低 | 仅实现 OpenAI 标准字段；未来若需要兼容其他格式，可在 Provider 层扩展，不影响工具本身。 |
| 测试需要 mock `fetch` 与二进制文件写入 | 高 | 低 | Provider 注入 `fetchImpl`；工具测试使用 `fake-kaos` 与 `vi.stubGlobal('fetch', ...)`，测试后恢复。 |
| `ToolInputDisplay` 没有图片生成专用类型，TUI 展示不够直观 | 低 | 低 | 先用 `generic` 类型；若后续 UI 需要优化，可再在 `packages/protocol` 中新增显示类型。 |

## 关键决策

1. **Provider 由 Host 注入，而非工具直接读取环境变量**：与 `WebSearchTool` 保持一致，`GenerateImageTool` 只依赖 `ImageGenerationProvider` 接口，具体 `baseUrl` / `apiKey` 由 `rpc/core-impl.ts` 根据 `config.toml` 组装后注入。这样配置来源单一，也便于测试。
2. **配置段复用 `MoonshotServiceConfig`**：`[services.image_generation]` 使用与 `moonshot_search` / `moonshot_fetch` 相同的字段集合，降低配置学习与维护成本。
3. **默认 `n = 1`**：工具支持 `n > 1`，但默认生成一张图；多图时按 `<stem>_<index>.<ext>` 命名并返回列表。
4. **下载使用全局 `fetch`**：图片 URL 通常为短期可访问链接，不需要请求头；保持工具简单。Provider 内部请求生成接口时仍使用注入的 `fetchImpl`。

## 待确认问题

- [ ] 是否需要让工具把生成的图片以 `image_url` 内容部分返回给模型，还是仅返回文件路径？（当前按用户要求仅返回路径；若后续需要模型“看到”图片，可再扩展。）

## 变更记录

| 时间 | 操作人 | 变更内容 |
|------|--------|----------|
| 2026-07-14 | user | 初始需求 |
| 2026-07-14 | agent | 完成实现、测试、changeset 与交付记录 |
