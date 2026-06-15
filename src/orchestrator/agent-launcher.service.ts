import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as path from 'path';

@Injectable()
export class AgentLauncherService {
  private readonly logger = new Logger(AgentLauncherService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Spawns an agent TypeScript file as a child process via `npx tsx`.
   *
   * The agent script path is resolved against the AI_AGENTS_PATH env var
   * (default: /workspace/ai-agents/src/agents), so the caller only passes
   * the bare filename (e.g. "ocr-nlp-agent.ts").
   *
   * Environment variables provided in `agentEnv` are merged on top of
   * `process.env`, which already carries all MCP config and backend URLs
   * injected into the container at startup.
   *
   * @param agentScript  Filename of the agent (e.g. "ocr-nlp-agent.ts")
   * @param agentEnv     Per-invocation env vars extracted from the message payload
   * @returns            Promise that resolves on exit code 0, rejects otherwise
   */
  /**
   * Like launchAgent but captures stdout and parses the last JSON object from it.
   * Use for agents that print a single JSON result to stdout (e.g. genai-cdc-agent).
   */
  launchAgentWithOutput<T>(
    agentScript: string,
    agentEnv: Record<string, string>,
  ): Promise<T> {
    const agentsBasePath = this.configService.get<string>(
      'AI_AGENTS_PATH',
      '../ai-agents/src/agents',
    );
    const scriptPath = path.resolve(agentsBasePath, agentScript);
    const mergedEnv: NodeJS.ProcessEnv = { ...process.env, ...agentEnv };

    this.logger.log(`Launching agent (with output): ${agentScript}`);

    return new Promise<T>((resolve, reject) => {
      let stdout = '';

      const child = spawn('npx', ['tsx', scriptPath], {
        shell: false,
        stdio: ['inherit', 'pipe', 'inherit'],
        env: mergedEnv,
      });

      child.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.on('error', (err) => {
        this.logger.error(`Failed to spawn ${agentScript}: ${err.message}`);
        reject(err);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Agent ${agentScript} exited with code ${code}`));
        }
        try {
          const match = stdout.match(/\{[\s\S]*\}/);
          if (!match) throw new Error('No JSON output found in agent stdout');
          resolve(JSON.parse(match[0]) as T);
        } catch (e) {
          reject(
            new Error(
              `Failed to parse output of ${agentScript}: ${(e as Error).message}. Raw: ${stdout.slice(0, 200)}`,
            ),
          );
        }
      });
    });
  }

  launchAgent(
    agentScript: string,
    agentEnv: Record<string, string>,
  ): Promise<void> {
    const agentsBasePath = this.configService.get<string>(
      'AI_AGENTS_PATH',
      '../ai-agents/src/agents',
    );
    const scriptPath = path.resolve(agentsBasePath, agentScript);

    const mergedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...agentEnv,
    };

    this.logger.log(
      `Launching agent: ${agentScript} | env keys: ${Object.keys(agentEnv).join(', ')}`,
    );

    return new Promise<void>((resolve, reject) => {
      const child = spawn('npx', ['tsx', scriptPath], {
        shell: false,
        stdio: 'inherit',
        env: mergedEnv,
      });

      child.on('error', (err) => {
        this.logger.error(
          `Failed to spawn agent process for ${agentScript}: ${err.message}`,
          err.stack,
        );
        reject(err);
      });

      child.on('close', (code, signal) => {
        if (code === 0) {
          this.logger.log(
            `Agent ${agentScript} completed successfully (exit 0)`,
          );
          resolve();
        } else {
          const reason = signal
            ? `killed by signal ${signal}`
            : `exited with code ${code}`;
          const err = new Error(
            `Agent ${agentScript} failed: ${reason}`,
          );
          this.logger.error(err.message);
          reject(err);
        }
      });
    });
  }
}
