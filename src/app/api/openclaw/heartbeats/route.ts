import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { connectDb, HeartbeatRun } from '@/lib/db';

const CONFIG_PATH = '/Users/betty/.openclaw/openclaw.json';
const AGENTS_DIR = '/Users/betty/.openclaw/agents';

// In-memory sync tracking to avoid re-querying DB every request
const lastSyncedAt: Map<string, number> = new Map();
const SYNC_INTERVAL_MS = 60_000; // Re-sync at most every 60s

interface JSONLMessage {
  type: string;
  timestamp?: string;
  message?: {
    role: string;
    content?: Array<{ type: string; text?: string }>;
    model?: string;
    provider?: string;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
      cost?: { input?: number; output?: number };
    };
    stopReason?: string;
    timestamp?: number;
  };
}

interface ParsedRun {
  agent_id: string;
  timestamp: string;
  model: string;
  provider: string;
  summary: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost: number | null;
}

function parseSessionJSONL(filePath: string, agentId: string, sinceTimestamp?: string): ParsedRun[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const stat = fs.statSync(filePath);

    let content: string;
    if (stat.size > 50 * 1024 * 1024) {
      const fd = fs.openSync(filePath, 'r');
      const tailSize = 5 * 1024 * 1024;
      const buf = Buffer.alloc(tailSize);
      fs.readSync(fd, buf, 0, tailSize, stat.size - tailSize);
      fs.closeSync(fd);
      content = buf.toString('utf-8');
      const firstNewline = content.indexOf('\n');
      if (firstNewline > 0) content = content.slice(firstNewline + 1);
    } else {
      content = fs.readFileSync(filePath, 'utf-8');
    }

    const lines = content.trim().split('\n').filter(Boolean);
    const entries: JSONLMessage[] = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip bad lines */ }
    }

    const sinceMs = sinceTimestamp ? new Date(sinceTimestamp).getTime() : 0;
    const runs: ParsedRun[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.type !== 'message') continue;
      if (entry.message?.role !== 'user') continue;

      const text = entry.message.content?.[0]?.text || '';
      if (!text.includes('Read HEARTBEAT') && !text.includes('HEARTBEAT_OK')) continue;

      const heartbeatTimestamp = entry.timestamp || '';

      // Collect all assistant messages in this heartbeat sequence, pick the best one
      // (prefer the final 'stop' response over intermediate 'toolUse' or 'error' messages)
      let bestResp: JSONLMessage | null = null;
      for (let j = i + 1; j < entries.length; j++) {
        const resp = entries[j];
        if (resp.type !== 'message') continue;
        if (resp.message?.role === 'user') break;
        if (resp.message?.role !== 'assistant') continue;

        // Skip intermediate tool-use and error-before-retry messages with no content
        const stop = resp.message.stopReason;
        if (stop === 'stop' || stop === 'end_turn') {
          bestResp = resp;
          break; // Final answer found
        }
        // Keep track of the latest assistant message as fallback
        if (!bestResp || (resp.message.usage?.totalTokens || 0) > (bestResp.message?.usage?.totalTokens || 0)) {
          bestResp = resp;
        }
      }

      if (bestResp?.message) {
        const msg = bestResp.message;
        const runTimestamp = bestResp.timestamp || heartbeatTimestamp;

        // Skip entries older than what we already have
        if (sinceMs && runTimestamp) {
          const runMs = new Date(runTimestamp).getTime();
          if (runMs <= sinceMs) continue;
        }

        const replyText = msg.content?.map(c => c.text || '').join('') || '';
        const usage = msg.usage;

        const totalCost = usage?.cost
          ? (typeof usage.cost === 'object'
            ? Object.values(usage.cost).reduce((sum: number, v) => sum + (typeof v === 'number' ? v : 0), 0)
            : null)
          : null;

        runs.push({
          agent_id: agentId,
          timestamp: runTimestamp,
          model: msg.model || '',
          provider: msg.provider || '',
          summary: replyText.substring(0, 300),
          status: msg.stopReason === 'error' ? 'error' : 'ok',
          input_tokens: usage?.input || 0,
          output_tokens: usage?.output || 0,
          cache_read_tokens: usage?.cacheRead || 0,
          total_tokens: usage?.totalTokens || 0,
          cost: totalCost,
        });
      }
    }

    return runs;
  } catch {
    return [];
  }
}

async function syncAgent(agentId: string, force = false): Promise<void> {
  // Throttle: skip if we synced this agent recently (unless forced)
  const lastSync = lastSyncedAt.get(agentId) || 0;
  if (!force && Date.now() - lastSync < SYNC_INTERVAL_MS) return;

  const sessionsDir = path.join(AGENTS_DIR, agentId, 'sessions');
  if (!fs.existsSync(sessionsDir)) return;

  // Find the latest timestamp we have stored for this agent
  const latestDoc = await HeartbeatRun.findOne({ agent_id: agentId })
    .sort({ timestamp: -1 })
    .select('timestamp')
    .lean();

  const latestTimestamp = (latestDoc as any)?.timestamp as string | undefined;
  const latestMs = latestTimestamp ? new Date(latestTimestamp).getTime() : 0;

  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
  const newRuns: ParsedRun[] = [];

  for (const file of files) {
    const filePath = path.join(sessionsDir, file);

    // If we have existing data, skip files not modified since our latest record
    if (latestMs > 0) {
      try {
        const mtime = fs.statSync(filePath).mtimeMs;
        if (mtime < latestMs) continue;
      } catch { continue; }
    }

    const runs = parseSessionJSONL(filePath, agentId, latestTimestamp);
    newRuns.push(...runs);
  }

  if (newRuns.length > 0) {
    // Deduplicate by timestamp before inserting (in case of overlapping parses)
    const existing = latestTimestamp
      ? new Set(
          (await HeartbeatRun.find({
            agent_id: agentId,
            timestamp: { $gte: latestTimestamp },
          }).select('timestamp').lean()).map((d: any) => d.timestamp)
        )
      : new Set<string>();

    const toInsert = newRuns.filter(r => !existing.has(r.timestamp));
    if (toInsert.length > 0) {
      await HeartbeatRun.insertMany(toInsert, { ordered: false }).catch(() => {
        // Ignore duplicate key errors on concurrent inserts
      });
    }
  }

  lastSyncedAt.set(agentId, Date.now());
}

export async function GET(request: Request) {
  try {
    await connectDb();

    const url = new URL(request.url);
    const runLimit = Math.min(parseInt(url.searchParams.get('runLimit') || '200'), 1000);
    const syncMode = url.searchParams.get('sync'); // 'force' or 'rebuild'
    const forceSync = syncMode === 'force' || syncMode === 'rebuild';

    // Rebuild mode: drop all data and re-sync from scratch
    if (syncMode === 'rebuild') {
      await HeartbeatRun.deleteMany({});
      lastSyncedAt.clear();
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const agentsList: Array<Record<string, unknown>> = config.agents?.list || [];
    const defaults = config.agents?.defaults || {};
    const defaultHeartbeat = defaults.heartbeat as Record<string, unknown> | undefined;

    // Build agent config list and sync in parallel
    const agentConfigs = agentsList
      .map(agent => {
        const agentId = agent.id as string;
        const name = (agent.name || agent.id) as string;
        const hb = agent.heartbeat as Record<string, unknown> | undefined;
        const heartbeatConfig = {
          enabled: hb !== undefined || defaultHeartbeat !== undefined,
          every: (hb?.every || defaultHeartbeat?.every || '10m') as string,
          model: (hb?.model || defaultHeartbeat?.model || 'unknown') as string,
        };
        return { agentId, name, heartbeat: heartbeatConfig };
      })
      .filter(a => a.heartbeat.enabled);

    // Sync all enabled agents in parallel
    await Promise.all(agentConfigs.map(a => syncAgent(a.agentId, forceSync)));

    // Query runs from DB for all enabled agents in parallel
    const agentResults = await Promise.all(
      agentConfigs.map(async (a) => {
        const runs = await HeartbeatRun.find({ agent_id: a.agentId })
          .sort({ timestamp: -1 })
          .limit(runLimit)
          .lean();

        return {
          agentId: a.agentId,
          name: a.name,
          heartbeat: a.heartbeat,
          runs: runs.map((r: any) => ({
            timestamp: r.timestamp,
            model: r.model,
            provider: r.provider,
            summary: r.summary,
            status: r.status,
            durationMs: r.duration_ms,
            usage: {
              input: r.input_tokens,
              output: r.output_tokens,
              cacheRead: r.cache_read_tokens,
              totalTokens: r.total_tokens,
              cost: r.cost,
            },
          })),
        };
      })
    );

    return NextResponse.json({ agents: agentResults });
  } catch (error) {
    console.error('Failed to read heartbeat data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
