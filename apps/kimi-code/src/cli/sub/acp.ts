/**
 * `kimi acp` sub-command.
 *
 * Starts the Agent Client Protocol (ACP) server over stdio so that
 * ACP-compatible clients (editors, IDEs, custom front-ends) can drive
 * a kimi-code session.
 *
 * Wire-up:
 *  - A {@link KimiHarness} is constructed with the kimi-code host identity
 *    and a dedicated `uiMode: 'acp'` so downstream telemetry can
 *    distinguish ACP sessions from the TUI.
 *  - {@link runAcpServer} owns the JSON-RPC stdio bridge and redirects
 *    rogue `console.*` traffic to stderr.
 *  - `--login` pivots into the device-code login flow instead of
 *    starting the server. This is the entry point ACP clients hit
 *    via the first-class `AuthMethodTerminal` path when they re-invoke
 *    the agent binary with the advertised `args:['--login']` appended.
 *  - On stream close or unhandled error the process exits with the
 *    appropriate code.
 *  - v2 is the default engine; `--engine v1` explicitly selects the legacy
 *    SDK backend.
 */

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Command } from 'commander';

import {
  ACP_BUILTIN_SLASH_COMMANDS,
  runAcpServer,
  V1AcpEngine,
  V2AcpEngine,
  type AcpEngineSession,
  type AvailableCommand,
  type SlashCommandsSnapshot,
} from '@moonshot-ai/acp-adapter';
import { createKimiHarness, type SkillSummary } from '@moonshot-ai/kimi-code-sdk';
import { startServer, type RunningServer } from '@moonshot-ai/kap-server';

import { KIMI_CODE_HOME_ENV } from '#/constant/app';
import { createKimiCodeHostIdentity, getVersion } from '#/cli/version';
import { buildSkillSlashCommands } from '#/tui/commands/skills';

import { runLoginFlow } from './login-flow';

class ManagedV2AcpEngine extends V2AcpEngine {
  constructor(
    options: ConstructorParameters<typeof V2AcpEngine>[0],
    private readonly server: RunningServer,
  ) {
    super(options);
  }

  override async close(): Promise<void> {
    try {
      await super.close();
    } finally {
      await this.server.close();
    }
  }
}

export function registerAcpCommand(parent: Command): void {
  parent
    .command('acp')
    .description('Run kimi-code as an Agent Client Protocol (ACP) server over stdio.')
    .option(
      '--login',
      'Run the device-code login flow then exit (entry point for ACP terminal-auth).',
      false,
    )
    .option(
      '--engine <engine>',
      'Backend engine to use: v2 (kap-server /api/v2, default) or v1 (legacy SDK).',
    )
    .action(async (opts: { login?: boolean; engine?: string }) => {
      if (opts.login === true) {
        await runLoginFlow();
        return;
      }
      const engineName = opts.engine ?? process.env['KIMI_ACP_ENGINE'] ?? 'v2';
      const engine = await buildEngine(engineName);
      // Forward `KIMI_CODE_HOME` (if set) into `authMethods[0].env` so the
      // `kimi login` subprocess clients spawn for terminal-auth writes its
      // token under the same data root the ACP server reads from. Used for
      // sandboxed test setups. Production runs leave the env unset and the
      // field stays empty.
      const sandboxHome = process.env[KIMI_CODE_HOME_ENV];
      const terminalAuthEnv =
        sandboxHome !== undefined && sandboxHome.length > 0
          ? { [KIMI_CODE_HOME_ENV]: sandboxHome }
          : undefined;
      // Legacy `_meta.terminal-auth` fallback for clients that don't yet
      // honor the first-class `type:'terminal'`. `command` is the absolute
      // path to this binary so the client can spawn it with `args:['login']`.
      const legacyCommand = process.argv[1];
      const builtinCommands: AvailableCommand[] = (ACP_BUILTIN_SLASH_COMMANDS as readonly AvailableCommand[]).map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        input: cmd.input,
      }));
      // Skills are session-scoped, so defer discovery until the adapter hands
      // us the just-created session. Failure degrades to builtins-only.
      const resolveSlashCommands = async (
        session: AcpEngineSession,
      ): Promise<SlashCommandsSnapshot> => {
        let skills: readonly SkillSummary[] = [];
        try {
          skills = await session.listSkills();
        } catch {
          skills = [];
        }
        // Keep the advertised palette and the command-to-skill routing map in
        // lockstep from the same snapshot.
        const built = buildSkillSlashCommands(skills);
        const skillCommands = built.commands.map((cmd) => ({
          name: cmd.name,
          description: cmd.description,
        }));
        return {
          commands: [...builtinCommands, ...skillCommands],
          skillCommandMap: built.commandMap,
        };
      };
      try {
        await runAcpServer(engine, {
          agentInfo: { name: 'Kimi Code CLI', version: getVersion() },
          slashCommands: resolveSlashCommands,
          terminalAuthEnv,
          ...(legacyCommand !== undefined && legacyCommand.length > 0
            ? { terminalAuthLegacyCommand: legacyCommand }
            : {}),
        });
        process.exit(0);
      } catch (error) {
        process.stderr.write(`acp server: fatal error: ${String(error)}\n`);
        process.exit(1);
      }
    });
}

async function buildEngine(engineName: string): Promise<import('@moonshot-ai/acp-adapter').AcpEngine> {
  if (engineName === 'v2') {
    const server = await startServer({
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      lockPath: join(tmpdir(), 'kimi-code-acp', `${process.pid}-${randomUUID()}.lock`),
      version: getVersion(),
    });
    return new ManagedV2AcpEngine(
      {
        url: `http://127.0.0.1:${server.port}`,
        token: server.authTokenService.getToken(),
        embeddedHost: server.embeddedSessionHost,
      },
      server,
    );
  }
  if (engineName !== 'v1') {
    throw new Error(`Unsupported ACP engine: ${engineName}. Expected "v1" or "v2".`);
  }
  const identity = createKimiCodeHostIdentity();
  const harness = createKimiHarness({
    identity,
    uiMode: 'acp',
  });
  return new V1AcpEngine(harness);
}
