import { NextResponse } from 'next/server';
import fs from 'fs';

const CONFIG_PATH = '/Users/betty/.openclaw/openclaw.json';

export async function GET() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const defaults = config.agents?.defaults || {};
    const agentsList = config.agents?.list || [];
    const defaultModel = defaults.model as Record<string, unknown> | undefined;

    const availableModels = Object.entries(defaults.models || {}).map(([id, meta]: [string, unknown]) => ({
      id,
      alias: (meta as Record<string, unknown>)?.alias,
    }));

    const agentModels = agentsList.map((a: Record<string, unknown>) => {
      const am = a.model as Record<string, unknown> | undefined;
      return {
        agentId: a.id,
        name: a.name,
        primary: (am?.primary || defaultModel?.primary || 'unknown') as string,
        fallbacks: (am?.fallbacks || defaultModel?.fallbacks || []) as string[],
      };
    });

    const cliBackends = Object.entries(defaults.cliBackends || {}).map(([id, meta]: [string, unknown]) => ({
      id,
      command: (meta as Record<string, unknown>)?.command,
    }));

    return NextResponse.json({
      defaultModel: defaultModel?.primary,
      defaultFallbacks: (defaultModel?.fallbacks || []) as string[],
      availableModels,
      agentModels,
      cliBackends,
    });
  } catch (error) {
    console.error('Failed to read models config:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
