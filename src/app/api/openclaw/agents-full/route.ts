import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = '/Users/betty/.openclaw/openclaw.json';
const AGENTS_DIR = '/Users/betty/.openclaw/agents';

// Cache bot usernames: token -> { username, fetchedAt }
const botUsernameCache = new Map<string, { username: string; fetchedAt: number }>();
const CACHE_TTL = 3600_000; // 1 hour

async function getTelegramBotUsername(token: string): Promise<string | undefined> {
  const cached = botUsernameCache.get(`tg:${token}`);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.username;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    const data = await res.json();
    const username = data.result?.username;
    if (username) botUsernameCache.set(`tg:${token}`, { username, fetchedAt: Date.now() });
    return username;
  } catch { return undefined; }
}

async function getDiscordBotUsername(token: string): Promise<string | undefined> {
  const cached = botUsernameCache.get(`dc:${token}`);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.username;
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    const username = data.username;
    if (username) botUsernameCache.set(`dc:${token}`, { username, fetchedAt: Date.now() });
    return username;
  } catch { return undefined; }
}

export async function GET() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const agentsList = config.agents?.list || [];
    const defaults = config.agents?.defaults || {};
    const bindings = config.bindings || [];

    // Build token lookup maps
    const tgAccounts = config.channels?.telegram?.accounts || {};
    const dcAccounts = config.channels?.discord?.accounts || {};

    // Resolve all unique bot tokens in parallel
    const tgTokens = new Map<string, string>(); // accountId -> token
    const dcTokens = new Map<string, string>();
    Object.entries(tgAccounts).forEach(([accountId, acc]) => {
      const token = (acc as Record<string, unknown>).botToken as string;
      if (token) tgTokens.set(accountId, token);
    });
    if (config.channels?.telegram?.botToken && !tgTokens.has('default')) {
      tgTokens.set('default', config.channels.telegram.botToken);
    }
    Object.entries(dcAccounts).forEach(([accountId, acc]) => {
      const token = (acc as Record<string, unknown>).token as string;
      if (token) dcTokens.set(accountId, token);
    });
    if (config.channels?.discord?.token && !dcTokens.has('default')) {
      dcTokens.set('default', config.channels.discord.token);
    }

    // Resolve all usernames in parallel
    const usernameMap = new Map<string, string | undefined>(); // "tg:accountId" or "dc:accountId" -> username
    const resolvePromises: Promise<void>[] = [];
    Array.from(tgTokens.entries()).forEach(([accountId, token]) => {
      resolvePromises.push(
        getTelegramBotUsername(token).then(u => { usernameMap.set(`tg:${accountId}`, u); })
      );
    });
    Array.from(dcTokens.entries()).forEach(([accountId, token]) => {
      resolvePromises.push(
        getDiscordBotUsername(token).then(u => { usernameMap.set(`dc:${accountId}`, u); })
      );
    });
    await Promise.all(resolvePromises);

    const agents = agentsList.map((agent: Record<string, unknown>) => {
      const agentModel = agent.model as Record<string, unknown> | undefined;
      const defaultModel = defaults.model as Record<string, unknown> | undefined;
      const agentBindings = bindings
        .filter((b: Record<string, unknown>) => b.agentId === agent.id)
        .map((b: Record<string, unknown>) => {
          const match = b.match as Record<string, unknown> | undefined;
          const channel = match?.channel as string;
          const accountId = match?.accountId as string;
          const prefix = channel === 'telegram' ? 'tg' : channel === 'discord' ? 'dc' : '';
          const botUsername = prefix ? usernameMap.get(`${prefix}:${accountId}`) : undefined;
          return { channel, accountId, botUsername };
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

    // Discover agents from directory that aren't in config
    const configAgentIds = new Set(agents.map((a: { id: string }) => a.id));
    try {
      const agentDirs = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'main')
        .map(d => d.name);
      
      for (const dirName of agentDirs) {
        if (!configAgentIds.has(dirName)) {
          // Try to read agent's workspace config for model info
          const agentWorkspace = `/Users/betty/clawd/agents/${dirName}`;
          const defaultPrimary = (defaults.model as Record<string, unknown>)?.primary as string || 'unknown';
          const defaultFallbacks = ((defaults.model as Record<string, unknown>)?.fallbacks || []) as string[];
          
          // Check sessions.json for model override
          let model = defaultPrimary;
          try {
            const sessionsPath = path.join(AGENTS_DIR, dirName, 'sessions', 'sessions.json');
            if (fs.existsSync(sessionsPath)) {
              const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
              // Try to find model from session data
              const firstSession = Object.values(sessions)[0] as Record<string, unknown> | undefined;
              if (firstSession?.model) model = firstSession.model as string;
            }
          } catch { /* ignore */ }

          agents.push({
            id: dirName,
            name: dirName,
            workspace: fs.existsSync(agentWorkspace) ? agentWorkspace : '',
            model: { primary: model, fallbacks: defaultFallbacks },
            channels: [],
            subagents: undefined,
            source: 'directory', // mark as discovered from directory
          });
        }
      }
    } catch { /* agents dir may not exist */ }

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
