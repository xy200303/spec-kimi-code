---
spec-id: agent-core-image-generation-tool
version: 1.0.0
status: completed
completed-at: 2026-07-14
---

# 交付记录

## 实现方案

### 架构

- 新增 `ImageGenerationProvider` 接口与 `OpenAIImageGenerationProvider` 实现，复用现有的服务注入模式（与 `WebSearchProvider`、`UrlFetcher` 对齐）。
- 新增 `GenerateImageTool` 内置工具，依赖注入的 `ImageGenerationProvider` 与 `Kaos` 完成图片生成与本地保存。
- 配置层复用 `MoonshotServiceConfig`，在 `config.toml` 中新增 `[services.image_generation]` 段；`rpc/core-impl.ts` 在创建 `ToolServices` 时根据配置组装 Provider 并注入 Agent。

### 关键代码逻辑

1. **Provider (`packages/agent-core/src/tools/providers/openai-image-generation.ts`)**
   - 请求 OpenAI 兼容的 `POST /images/generations`，默认模型 `dall-e-3`。
   - 支持 `apiKey` 与 `tokenProvider`（OAuth）两种鉴权，token 为空/失败时回退到 `apiKey`。
   - 仅接受响应中的 `url` 字段；忽略 `b64_json` 等不支持的形式。

2. **工具 (`packages/agent-core/src/tools/builtin/image/generate-image.ts`)**
   - 输入参数：`prompt`（必填）、`output_path`（必填）、`model`/`size`/`quality`/`style`/`n`（可选）。
   - 调用 `resolvePathAccessPath` 进行路径安全检查，复用 `WriteTool` 的父目录创建逻辑。
   - 使用全局 `fetch` 下载生成的图片 URL，按 10 MiB 限制校验大小。
   - 通过 magic-byte  sniff 推断 MIME 类型并自动追加扩展名；`n > 1` 时生成 `_0`、`_1` 等索引文件。
   - 错误分类：鉴权、网络/下载、超时、取消、路径安全等。

3. **配置与注册**
   - `ServicesConfigSchema` / `ServicesConfigPatchSchema` 增加 `imageGeneration`。
   - `toml.ts` 增加 `image_generation` 的读写映射。
   - `ToolServices` 增加 `imageGenerator` 字段；`ToolManager` 仅在 Provider 存在时注册工具。

## 边界条件

| 场景 | 处理方式 | 验证结果 |
|------|----------|----------|
| 未配置 `[services.image_generation]` | 不注册 `GenerateImage`，模型不可见 | `builtin-current.test.ts` 通过；工具列表无 `GenerateImage` |
| `output_path` 为相对路径 | 按工作目录解析 | 单测通过 |
| `output_path` 无扩展名 | 根据下载字节 sniff 出的 MIME 自动追加 `.png`/`.jpg` 等 | 单测通过 |
| `n > 1` | 生成多个文件，命名 `<stem>_<index>.<ext>` | 单测通过 |
| 后端返回空图片列表 | 返回错误 `Image generation service returned no images.` | 单测通过 |
| 下载 HTTP 失败 | 返回包含 HTTP 状态码的错误 | 单测通过 |
| 路径逃出工作区 | `resolvePathAccessPath` 抛出 `PathSecurityError`，工具返回错误 | 单测通过 |
| OAuth token 为空/失败 | 回退到配置的 `apiKey` | Provider 单测通过 |

## 测试验证

### 测试策略声明

| 项目 | 说明 |
|------|------|
| 测试可行性 | 可通过 mock Provider、`fetch` 与 `Kaos` 完成纯单元测试，无需真实网络或模型调用。 |
| 测试替代方案 | 无。 |
| 单测要求 | 新增工具、Provider、配置解析三类单测，覆盖正常路径与主要错误路径。 |
| 覆盖率 | 新增 13 个工具测试、8 个 Provider 测试、1 个配置解析断言；相关文件均覆盖。 |

### 运行结果

- `pnpm --filter @moonshot-ai/agent-core typecheck`：通过。
- 新增/相关测试：
  - `test/tools/generate-image.test.ts`：13 个测试全部通过。
  - `test/tools/providers/openai-image-generation.test.ts`：8 个测试全部通过。
  - `test/config/configs.test.ts`：全部通过（含新增 `image_generation` 解析断言）。
  - `test/agent/injection/spec-workflow.test.ts`：修复现有类型问题后通过。

## 代码评审

| 检查项 | 状态 | 备注 |
|--------|------|------|
| 注释完整 | ✅ | Provider 与工具头部均有文档注释；复杂逻辑（扩展名推断、多图命名）附说明。 |
| KISS | ✅ | 复用现有配置模型、路径安全、结果构建器，未引入冗余抽象。 |
| 组织合理 | ✅ | 工具位于 `tools/builtin/image/`，Provider 位于 `tools/providers/`，与现有目录结构一致。 |
| 边界清晰 | ✅ | 工具只负责调用 Provider + 文件 I/O；Provider 只负责 HTTP 请求；配置层独立。 |
| 可读性 | ✅ | 命名清晰，使用早返回，错误分类集中。 |
| 复用 | ✅ | 复用 `MoonshotServiceConfig`、`resolvePathAccessPath`、`ToolResultBuilder`、`sniffMediaFromMagic` 等现有能力。 |
| 测试 | ✅ | 新增单测覆盖主要路径与错误路径。 |

## 已知问题

- 当前仓库全量测试在 Windows 环境下存在若干与本次改动无关的预失败，主要涉及 symlink、插件/技能扫描、session store、MCP 连接管理、EXIF 图片读取等。这些失败在修改前已存在，且在禁用 `KIMI_CODE_EXPERIMENTAL_SPEC_CODING` 后仍复现。
- `ToolInputDisplay` 暂使用 `generic` 类型；未来如需更直观的 TUI 展示，可在 `packages/protocol` 中新增专用显示类型。

## 回滚方案

- 删除 `packages/agent-core/src/tools/builtin/image/` 与 `packages/agent-core/src/tools/providers/openai-image-generation.ts`。
- 回滚 `ToolServices`、`config/schema.ts`、`config/toml.ts`、`builtin/index.ts`、`agent/tool/index.ts`、`rpc/core-impl.ts` 的修改。
- 删除相关测试文件与 `.changeset/agent-core-generate-image-tool.md`。

## 变更文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/agent-core/src/tools/builtin/image/generate-image.ts` | 新增 | `GenerateImageTool` 实现 |
| `packages/agent-core/src/tools/builtin/image/generate-image.md` | 新增 | 工具描述（模型可见） |
| `packages/agent-core/src/tools/providers/openai-image-generation.ts` | 新增 | `OpenAIImageGenerationProvider` 实现 |
| `packages/agent-core/src/tools/support/services.ts` | 修改 | `ToolServices` 新增 `imageGenerator` |
| `packages/agent-core/src/config/schema.ts` | 修改 | `ServicesConfigSchema` 与 Patch 新增 `imageGeneration` |
| `packages/agent-core/src/config/toml.ts` | 修改 | `image_generation` 序列化/反序列化 |
| `packages/agent-core/src/tools/builtin/index.ts` | 修改 | 导出 `GenerateImageTool` 与 Provider 类型 |
| `packages/agent-core/src/agent/tool/index.ts` | 修改 | 注册 `GenerateImageTool` |
| `packages/agent-core/src/rpc/core-impl.ts` | 修改 | 根据配置创建并注入 Provider |
| `packages/agent-core/test/tools/generate-image.test.ts` | 新增 | 工具单测 |
| `packages/agent-core/test/tools/providers/openai-image-generation.test.ts` | 新增 | Provider 单测 |
| `packages/agent-core/test/config/configs.test.ts` | 修改 | 补充 `image_generation` TOML 解析断言 |
| `packages/agent-core/test/agent/injection/spec-workflow.test.ts` | 修改 | 修复实验标志 mock 的类型问题 |
| `.changeset/agent-core-generate-image-tool.md` | 新增 | changeset |
| `specs/agent-core-image-generation-tool/spec.md` | 修改 | 更新任务清单与状态 |
| `specs/agent-core-image-generation-tool/delivery.md` | 新增 | 本交付记录 |
