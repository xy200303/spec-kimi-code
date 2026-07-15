import type { AvailableCommand } from '@agentclientprotocol/sdk';

/**
 * Built-in slash commands advertised by the ACP adapter.
 *
 * This list mirrors the TUI's `BUILTIN_SLASH_COMMANDS`
 * (`apps/kimi-code/src/tui/commands/registry.ts`) but only includes commands
 * that either have a direct {@link Session} method equivalent in ACP mode or
 * are useful to expose to ACP clients (e.g. `/help`). Commands that are purely
 * TUI-specific (such as `/theme`, `/exit`, `/web`) are intentionally omitted
 * because they cannot be meaningfully executed without a terminal UI.
 */
export const ACP_BUILTIN_SLASH_COMMANDS = [
  {
    name: 'yolo',
    description: 'Toggle YOLO mode: AI auto-approves safe actions, asks for approval on risky ones.',
  },
  {
    name: 'auto',
    description: 'Toggle Auto mode: run all actions automatically, including risky ones.',
  },
  {
    name: 'permission',
    description: 'Set permission mode (yolo | auto | manual).',
    input: { hint: '[yolo|auto|manual]' },
  },
  {
    name: 'model',
    description: 'Switch LLM model.',
    input: { hint: '<model-id>' },
  },
  {
    name: 'effort',
    description: 'Switch thinking effort.',
    input: { hint: '<effort>' },
  },
  {
    name: 'plan',
    description: 'Toggle plan mode.',
    input: { hint: '[on|off|clear]' },
  },
  {
    name: 'swarm',
    description: 'Toggle swarm mode or run one task in swarm mode.',
    input: { hint: '[on|off] | <task>' },
  },
  {
    name: 'compact',
    description: 'Compact the conversation context.',
    input: { hint: '<optional custom summarization instructions>' },
  },
  {
    name: 'init',
    description: 'Analyze the codebase and generate AGENTS.md.',
  },
  {
    name: 'reload',
    description: 'Reload session and apply config.toml settings.',
  },
  {
    name: 'status',
    description: 'Show current session status.',
  },
  {
    name: 'usage',
    description: 'Show session token usage.',
  },
  {
    name: 'mcp',
    description: 'Show MCP server status.',
  },
  {
    name: 'tasks',
    description: 'List background tasks.',
  },
  {
    name: 'help',
    description: 'Show available ACP commands.',
  },
] as const satisfies readonly AvailableCommand[];

export type AcpBuiltinSlashCommandName = (typeof ACP_BUILTIN_SLASH_COMMANDS)[number]['name'];

export const ACP_BUILTIN_SLASH_COMMAND_NAMES = new Set<string>(
  ACP_BUILTIN_SLASH_COMMANDS.map((command) => command.name),
);

export function isAcpBuiltinSlashCommand(name: string): name is AcpBuiltinSlashCommandName {
  return ACP_BUILTIN_SLASH_COMMAND_NAMES.has(name);
}
