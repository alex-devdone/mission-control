import { NextResponse } from 'next/server';
import fs from 'fs';

const CONFIG_PATH = '/Users/betty/.openclaw/openclaw.json';

export async function GET() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const agentsList = config.agents?.list || [];
    const defaults = config.agents?.defaults || {};
    const bindings = config.bindings || [];

    const agents = agentsList.map((agent: Record<string, unknown>) => {
      const agentModel = agent.model as Record<string, unknown> | undefined;
      const defaultModel = defaults.model as Record<string, unknown> | undefined;
      const agentBindings = bindings
        .filter((b: Record<string, unknown>) => b.agentId === agent.id)
        .map((b: Record<string, unknown>) => {
          const match = b.match as Record<string, unknown> | undefined;
          return { channel: match?.channel, accountId: match?.accountId };
        });

      const primary = (agentModel?.primary || defaultModel?.primary || 'unknown') as string;
      const fallbacks = (agentModel?.fallbacks || defaultModel?.fallbacks || []) as string[];

      return {
        id: agent.id,
        name: agent.name || agent.id,
        workspace: agent.workspace || defaults.workspace || '',
        model: { primary, fallbacks },
        channels: agentBindings,
        subagents: agent.subagents,
      };
    });

    const availableModels = Object.entries(defaults.models || {}).map(([id, meta]: [string, unknown]) => ({
      id,
      alias: (meta as Record<string, unknown>)?.alias,
    }));

    return NextResponse.json({
      agents,
      defaults: {
        model: (defaults.model as Record<string, unknown>)?.primary,
        fallbacks: ((defaults.model as Record<string, unknown>)?.fallbacks || []) as string[],
        availableModels,
      },
    });
  } catch (error) {
    console.error('Failed to read OpenClaw config:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
