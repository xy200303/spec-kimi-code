# spec-kimi 命令

`spec-kimi` 是 Spec Kimi 的主命令。Spec Kimi 基于 Kimi Code 二次开发。不带参数运行时，它会在当前工作目录开启交互式规格驱动会话，默认启用 Spec Coding 和 Plan 模式；配合不同 flag 可以恢复会话、调整权限或指定自定义 Skills 目录。

```sh
spec-kimi [options]
spec-kimi <subcommand> [options]
```

## 主命令选项

所有 flag 都是可选的，直接运行 `spec-kimi` 即可进入交互式会话：

| 选项 | 简写 | 说明 |
| --- | --- | --- |
| `--version` | `-V` | 打印版本号并退出 |
| `--help` | `-h` | 显示帮助信息并退出 |
| `--session [id]` | `-S` | 恢复一个会话。带 ID 时直接打开指定会话；不带 ID 时进入交互式选择器 |
| `--continue` | `-c` | 继续当前工作目录下最近一次的会话，无需手动指定 ID |
| `--model <model>` | `-m` | 为本次启动指定模型别名。省略时新会话使用配置文件中的 `default_model` |
| `--prompt <prompt>` | `-p` | 非交互执行单次 prompt，并把 Assistant 输出流式写到 stdout。该模式不会打开 TUI，也不支持计划审查和审批 |
| `--output-format <format>` | | 设置非交互输出格式，支持 `text` 与 `stream-json`。仅可与 `--prompt` 一起使用，默认 `text` |
| `--yolo` | `-y` | 自动批准普通工具调用，跳过审批请求 |
| `--auto` | | 以 auto 权限模式启动；工具审批自动处理，Agent 不会向用户提问 |
| `--plan` | | 显式写出交互式会话的默认行为：以 Spec Coding Plan 模式启动 |
| `--skills-dir <dir>` | | 从指定目录加载 Skills，替换自动发现的用户和项目目录。可重复传入 |
| `--add-dir <dir>` | | 为本次会话添加额外的工作目录。相对路径按当前工作目录解析。可重复传入 |

`-r` / `--resume` 是 `--session` 的隐藏别名；`--yes` 和 `--auto-approve` 是 `--yolo` 的隐藏别名，在帮助信息中不显示。

::: warning 注意
`--yolo` 会跳过普通工具调用的人工确认，包括文件写入和 Shell 命令执行，请只在受信任的工作目录下使用。Plan 模式的退出审批不会被 `--yolo` 跳过；Plan 模式下的 `Bash` 按普通放行规则处理。
:::

### flag 冲突规则

以下组合会在启动时被拒绝：

- `--continue` 与 `--session` 互斥——两者都表示"恢复历史会话"
- `--yolo` 和 `--auto` 互斥——两种权限模式互斥
- `--prompt` 不能与 `--yolo`、`--auto` 或 `--plan` 同时使用——非交互模式固定使用 `auto` 权限
- `--output-format` 只能与 `--prompt` 一起使用

恢复会话时，可以通过 `--auto`、`--yolo` 或 `--plan` 覆盖原会话保存的权限或计划模式。例如，`spec-kimi --continue --auto` 会恢复最近会话并切换到 auto 权限模式。

## 典型用法

直接运行开启新会话：

```sh
spec-kimi
```

从上次中断的地方继续（自动找到当前目录最近的会话）：

```sh
spec-kimi --continue
```

从历史会话列表中挑选，或直接指定已知 ID：

```sh
spec-kimi --session
spec-kimi --session 01HZ...XYZ
```

跳过审批确认，适合已知安全的批处理任务：

```sh
spec-kimi --yolo
```

让 Agent 自行处理一切，不再向用户提问：

```sh
spec-kimi --auto
```

显式写出默认的计划先行行为：

```sh
spec-kimi --plan
```

### 自定义 Skills 目录

有两种方式指定 Skills 目录，语义不同：

- **`--skills-dir <dir>`**（CLI flag）：**替换**自动发现的用户和项目目录，仅对本次启动生效。可重复传入以叠加多个目录：

  ```sh
  spec-kimi --skills-dir /path/to/team-skills --skills-dir ./local-skills
  ```

- **`extra_skill_dirs`**（`config.toml`）：**叠加**到自动发现的目录之上，长期生效，适合配置团队共享 Skills。详见 [Agent Skills](../customization/skills.md)。

## 非交互执行

在脚本或 CI 中运行单次 prompt 时，`-p` 只适合输出型工作，不能代替交互式 Spec Coding 工作流：

```sh
spec-kimi -p "Summarize the current repository status"
```

输出采用 transcript 样式：thinking 内容和 Assistant 正文都以 `• ` 开头，换行后两个空格缩进。Assistant 正文输出到 stdout；thinking、工具进度和"恢复会话"提示输出到 stderr。`-p` 模式不会请求人工审批，普通工具调用按 `auto` 权限策略处理，静态 deny 规则仍然生效。

临时切换模型：

```sh
spec-kimi -m kimi-code/kimi-for-coding -p "Explain the latest diff"
```

需要结构化读取输出时，使用 `stream-json` 格式——stdout 每行都是一个 JSON 对象：

```sh
spec-kimi -p "List changed files" --output-format stream-json
```

`stream-json` 模式下，普通回复输出 Assistant 消息；模型调用工具时，先输出带 `tool_calls` 的 Assistant 消息，再输出对应的 Tool 消息，最后继续输出后续 Assistant 消息。thinking 内容不会写入 JSONL；工具进度和恢复会话提示仍写到 stderr。

## 子命令

`spec-kimi` 提供以下子命令：`login`（非交互式登录）、`acp`（ACP IDE 模式）、`server`（运行并管理本地 REST/WebSocket/web 服务）、`web`（`spec-kimi server run --open` 的别名）、`doctor`（校验配置文件）、`export`（导出会话）、`migrate`（迁移旧版数据）、`upgrade`（检查更新）、`provider`（管理供应商）。

### `spec-kimi login`

通过 RFC 8628 device-code 流程登录 Kimi Code OAuth，无需进入 TUI。命令会发起一次 device authorization 请求，将验证地址和用户码打印到 stderr，然后轮询直到浏览器侧完成授权。生成的 token 写入与 TUI `/login` 相同的本地位置，下次启动 `spec-kimi` 时会自动加载。

```sh
spec-kimi login
```

该子命令没有任何 flag。在轮询期间随时按 `Ctrl-C` 可取消登录；取消或失败时退出码为 `1`，成功为 `0`。

### `spec-kimi acp`

把 Kimi Code CLI 切换到 ACP（Agent Client Protocol）模式，在标准输入/输出上以 JSON-RPC 形式与 IDE 对话，让编辑器直接驱动 spec-kimi 的会话和工具调用。通常不需要手动运行——IDE 会把它作为子进程入口启动。配置方式见[在 IDE 中使用](../guides/ides.md)，技术细节见 [spec-kimi acp 参考](./kimi-acp.md)。

```sh
spec-kimi acp
```

使用 `--engine v2` 可选择实验性的 v2 后端，也可以设置 `KIMI_ACP_ENGINE=v2`。命令行参数的优先级高于环境变量。后端和扩展细节见 [spec-kimi acp 参考](./kimi-acp.md#引擎选择)。

### `spec-kimi server`

运行并管理本地 Kimi 服务 —— 同一个进程同时挂载 REST + WebSocket API 与 web UI。父命令拆成按需入口 (`run`) 与 OS 级生命周期管理 (`install`、`uninstall`、`start`、`stop`、`restart`、`status`)。`spec-kimi server run` 会确保一个后台守护进程在运行、健康后返回；如需把服务挂在当前终端，请加 `--foreground`。

服务运行时，`GET /openapi.json` 会返回 REST OpenAPI 文档，`GET /asyncapi.json` 会返回本地 WebSocket 协议的 AsyncAPI 文档。

```sh
spec-kimi server run                # 启动或复用一个后台守护进程
spec-kimi server run --foreground   # 挂在当前终端前台运行
spec-kimi server install            # 注册到 launchd / systemd / schtasks
spec-kimi server start              # 启动 OS 管理的服务
spec-kimi server status             # 查看安装与运行状态
```

#### `spec-kimi server run`

| 选项 | 说明 |
| --- | --- |
| `--port <port>` | 绑定端口；默认 `58627` |
| `--log-level <level>` | 按所选级别开启服务日志；默认不输出 |
| `--debug-endpoints` | 挂载 `/api/v1/debug/*` 调试路由（默认关闭） |
| `--keep-alive` | 让服务在没有客户端连接 60 秒后继续运行，不会因空闲退出；`--host` / `--allowed-host` 会自动启用，`--foreground` 模式下始终开启 |
| `--dangerous-bypass-auth` | 关闭所有 REST 与 WebSocket 路由的 bearer token 鉴权，使 web UI 无需 token 即可连接；仅用于可信网络或自有鉴权代理之后 |
| `--foreground` | 前台运行，不 spawn 后台守护进程 |
| `--open` | 服务健康后用默认浏览器打开 web UI |

`spec-kimi server run` 只绑定本机 loopback 地址。默认会 spawn 一个后台守护进程（多次运行会复用同一个），健康后即退出；守护进程在最后一个 web 客户端断开后自行关闭。加 `--keep-alive` 可让它在空闲超时后继续运行，或加 `--foreground` 则在当前进程中运行——保持挂在终端，在 `SIGINT` / `SIGTERM` 时干净退出。

::: danger 警告
`--dangerous-bypass-auth` 会彻底关闭鉴权。任何能访问该端口的人都能完全控制你的会话、文件系统和 shell。请仅在可信网络或自有鉴权反向代理之后使用，用完后运行 `spec-kimi server kill` 停止服务。
:::

#### `spec-kimi server install`

把服务注册成 OS 管理的进程，开机自启、崩溃后自动重启。根据当前平台选择对应后端：

- **macOS**：写 LaunchAgent plist 到 `~/Library/LaunchAgents/ai.moonshot.kimi-server.plist`，并通过 `launchctl bootstrap gui/<uid>` 启动。
- **Linux**：写 `--user` systemd unit 到 `~/.config/systemd/user/kimi-server.service`，并执行 `systemctl --user enable --now`。
- **Windows**：通过 `schtasks /Create /XML` 注册名为 `KimiServer` 的计划任务。

| 选项 | 说明 |
| --- | --- |
| `--port <port>` | 被托管的服务绑定端口；默认 `58627` |
| `--log-level <level>` | 写入生成 unit 的日志级别 |
| `--force` | 已安装时强制覆盖 |
| `--json` | 用 JSON 替代人类可读输出 |

本机地址、选定的端口和日志级别会写入 `~/.kimi-code/server/install.json`，即便服务停掉 `spec-kimi server status` 也能读到。

#### 生命周期子命令

| 命令 | 说明 |
| --- | --- |
| `spec-kimi server uninstall` | 停止并移除 OS 服务定义。幂等。 |
| `spec-kimi server start` | 启动 OS 管理的服务。未安装时会报错。 |
| `spec-kimi server stop` | 停止 OS 管理的服务。 |
| `spec-kimi server restart` | 重启 OS 管理的服务。 |
| `spec-kimi server status` | 打印 installed / running / pid / port / log-path；`--json` 用于脚本。 |

#### `spec-kimi web`

在浏览器中打开 Kimi 的图形会话界面，作为终端 TUI 的替代入口。

等价于 `spec-kimi server run --open`：在后台启动本地 Kimi 服务（若已运行则复用），用默认浏览器打开 web UI，随后命令返回，服务驻留后台。与 `spec-kimi server run` 的唯一区别是默认启用 `--open`（自动打开浏览器），其余行为一致。

```sh
spec-kimi web                 # 后台启动服务并打开浏览器（已运行则复用）
spec-kimi web --no-open       # 不打开浏览器，等同 `spec-kimi server run`
spec-kimi web --foreground    # 在当前终端前台运行，同时打开浏览器
```

停止服务使用 `spec-kimi server kill`，查看活动连接使用 `spec-kimi server ps`；`--port`、`--log-level` 等选项与 `spec-kimi server run` 一致。

### `spec-kimi doctor`

校验 `config.toml` 和 `tui.toml`，不会启动 TUI，也不会修改任一文件。默认检查 `KIMI_CODE_HOME` 下的文件；未设置该环境变量时检查 `~/.kimi-code`。默认路径缺失时会显示为跳过，因为内置默认值仍可生效。

```sh
spec-kimi doctor
```

| 命令 | 说明 |
| --- | --- |
| `spec-kimi doctor` | 校验默认 `config.toml` 和 `tui.toml` |
| `spec-kimi doctor config [path]` | 只校验 `config.toml`；传入 `path` 时使用该文件而不是默认文件 |
| `spec-kimi doctor tui [path]` | 只校验 `tui.toml`；传入 `path` 时使用该文件而不是默认文件 |

显式传入路径时，文件必须存在。所有被检查的文件都有效或被跳过时，退出码为 `0`；任何指定文件缺失或配置无效时，退出码为 `1`。

```sh
# 检查默认配置文件
spec-kimi doctor

# 只检查默认运行时配置
spec-kimi doctor config

# 替换正式 TUI 配置前，先检查候选文件
spec-kimi doctor tui ./tui.toml
```

### `spec-kimi export`

把一个会话打包成 ZIP 文件，便于分享、归档或提交问题反馈。

```sh
spec-kimi export [sessionId] [options]
```

| 参数 / 选项 | 简写 | 说明 |
| --- | --- | --- |
| `sessionId` | | 要导出的会话 ID。省略时自动选择当前工作目录下最近一次的会话，并要求确认 |
| `--output <path>` | `-o` | 输出 ZIP 文件路径。省略时写入当前目录下的默认文件名 |
| `--yes` | `-y` | 跳过默认会话的确认提示，直接导出 |
| `--no-include-global-log` | | 不打包全局诊断日志。默认包含 |

导出包含目标会话目录内的所有文件。全局诊断日志（`~/.kimi-code/logs/kimi-code.log`）默认包含，因为它可能含有其他会话或项目的事件；不想分享时加 `--no-include-global-log`。

```sh
# 导出当前工作目录最近一次会话，跳过确认
spec-kimi export -y

# 导出指定会话到自定义路径
spec-kimi export 01HZ...XYZ -o ./bug-report.zip

# 排除全局诊断日志
spec-kimi export 01HZ...XYZ -o ./bug-report.zip --no-include-global-log
```

### `spec-kimi migrate`

将旧版 kimi-cli 的本地数据迁移到 kimi-code，包括历史会话和配置文件。纯交互式运行，会引导你完成全流程。

```sh
spec-kimi migrate
```

完整迁移说明见[从 kimi-cli 迁移](../guides/migration.md)。

### `spec-kimi upgrade`

立即检查最新版本并展示更新提示，选择操作后退出。也可以使用别名 `spec-kimi update`。

```sh
spec-kimi upgrade
```

对全局 npm、pnpm、yarn、bun 以及 macOS / Linux native 安装，`spec-kimi upgrade` 会展示更新选项；选择 `Install update now` 后运行对应的前台安装命令。当前安装方式无法自动升级时（如 Windows native 安装），改为打印手动更新命令。

### `spec-kimi vis`

在浏览器中启动会话可视化工具，直观查看一次会话的全过程。命令会启动一个指向本地会话的进程内服务器，打印访问地址并打开浏览器，持续运行直到你按下 `Ctrl-C`。

```sh
spec-kimi vis [sessionId] [options]
```

| 参数 / 选项 | 说明 |
| --- | --- |
| `sessionId` | 直接打开指定会话的可视化页面。省略时打开列出所有会话的首页 |
| `--port <number>` | 绑定的端口。默认自动挑选一个空闲端口 |
| `--host <host>` | 绑定的主机。默认 `127.0.0.1` |
| `--no-open` | 不自动打开浏览器，仅打印访问地址 |

```sh
# 启动可视化工具并在浏览器中打开首页
spec-kimi vis

# 直接打开指定会话
spec-kimi vis 01HZ...XYZ

# 绑定固定主机和端口且不打开浏览器（例如在远程主机上）
spec-kimi vis --host 0.0.0.0 --port 8123 --no-open
```

### `spec-kimi provider`

在 shell 中管理供应商，相当于 TUI 中 `/provider` 的非交互版本。适合脚本化部署、CI 初始化，以及在新机器上一行完成配置。

```sh
spec-kimi provider <action> [options]
```

包含五个动作：

#### `spec-kimi provider add <url>`

从自定义 registry（`api.json`）批量导入所有供应商。命令会拉取 registry，为每个条目创建 `[providers.<id>]` 和 `[models.<alias>]`，并写入 `source` 元数据，使 TUI 下次启动时自动刷新同一 registry 地址下的供应商和模型。

| 参数 / 选项 | 说明 |
| --- | --- |
| `<url>` | Registry 地址 |
| `--api-key <key>` | 访问 registry 时携带的 Bearer token。未传时回退到环境变量 `KIMI_REGISTRY_API_KEY`，必填 |

```sh
spec-kimi provider add https://registry.example.com/v1/models/api.json --api-key YOUR_KEY

# 或通过环境变量（适合 CI / .envrc）
KIMI_REGISTRY_API_KEY=YOUR_KEY spec-kimi provider add https://registry.example.com/v1/models/api.json
```

如果某个 provider id 已存在，会先删除再重新写入。不会自动设置默认模型，后续可用 `-m` 或 TUI 内的 `/model` 选择。

#### `spec-kimi provider remove <providerId>`

删除指定供应商及其所有模型 alias。如果被删除的供应商正好是 `default_model` 所属，则同时清空 `default_model`。

```sh
spec-kimi provider remove kohub
```

#### `spec-kimi provider list`

按行打印每个已配置的供应商，含类型、模型数量、来源。加 `--json` 可输出原始的 `providers` 和 `models` 表，便于程序化处理。

```sh
spec-kimi provider list
spec-kimi provider list --json | jq '.providers | keys'
```

#### `spec-kimi provider catalog list [providerId]`

在不修改任何配置的情况下浏览公开的 [models.dev](https://models.dev/) 模型目录。不传参数时列出所有供应商及协议类型和模型数量；传 `providerId` 时列出该供应商下所有模型的上下文窗口和能力。

| 参数 / 选项 | 说明 |
| --- | --- |
| `[providerId]` | 可选，要查看的供应商 id |
| `--filter <substring>` | 按 id 或 name 大小写不敏感子串过滤 |
| `--url <url>` | 覆盖 catalog 地址，默认 `https://models.dev/api.json` |
| `--json` | 以 JSON 形式输出匹配片段 |

```sh
spec-kimi provider catalog list
spec-kimi provider catalog list --filter anthropic
spec-kimi provider catalog list anthropic
```

#### `spec-kimi provider catalog add <providerId>`

按 id 从 catalog 直接导入一个已知供应商，协议类型、base URL、模型信息均由 catalog 提供，只需提供 API key。

| 参数 / 选项 | 说明 |
| --- | --- |
| `<providerId>` | catalog 中的供应商 id，如 `anthropic`、`openai` |
| `--api-key <key>` | 供应商 API key。未传时回退到 `KIMI_REGISTRY_API_KEY`，必填 |
| `--default-model <modelId>` | 可选，导入后把 `default_model` 设为 `<providerId>/<modelId>` |
| `--url <url>` | 覆盖 catalog 地址，默认 `https://models.dev/api.json` |

```sh
spec-kimi provider catalog list anthropic          # 先看可选的模型
spec-kimi provider catalog add anthropic --api-key sk-ant-... --default-model claude-opus-4-7
```

## 下一步

- [斜杠命令](./slash-commands.md) — 交互式 TUI 内的控制命令速查
- [配置文件](../configuration/config-files.md) — `default_model`、权限模式等启动参数的持久化配置
- [Agent Skills](../customization/skills.md) — `--skills-dir` 加载的 Skill 文件格式
