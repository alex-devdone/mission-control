import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Agent } from '@/lib/types';

const AGENT_LIMITS_URL = 'http://localhost:5280/api/agents';

interface AgentLimitsData {
  id: string;          // openclaw agent id
  name: string;
  model: string;       // e.g. "anthropic/claude-opus-4-6"
  provider_type: string;
  status: 'ok' | 'low' | 'critical' | 'unknown';
  limit_5h: number | null;
  limit_week: number | null;
  reset_at: string | null;
  reset_week_at: string | null;
  fallbacks: string[];
}

/** Map full model string to short display name */
function shortModelName(model: string): string {
  if (model.includes('opus-4-6')) return 'opus 4.6';
  if (model.includes('opus-4-5')) return 'opus 4.5';
  if (model.includes('sonnet-4-5')) return 'sonnet 4.5';
  if (model.includes('haiku-4-5')) return 'haiku 4.5';
  if (model.includes('glm-5')) return 'GLM-5';
  if (model.includes('codex')) return 'codex';
  // Fallback: last segment
  const parts = model.split('/');
  return parts[parts.length - 1];
}

/** Map provider_type to provider_account_id used in MC */
function providerAccountId(providerType: string): string {
  switch (providerType) {
    case 'anthropic': return 'anthropic';
    case 'z-ai': return 'zai';
    case 'openai': return 'openai';
    case 'gemini': return 'gemini';
    default: return providerType;
  }
}

// GET /api/agents/limits - Return all agents with their current limits
export async function GET() {
  try {
    const agents = queryAll<Agent>('SELECT id, name, model, provider_account_id, limit_5h, limit_week, last_poll_at FROM agents');
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Failed to fetch agent limits:', error);
    return NextResponse.json({ error: 'Failed to fetch agent limits' }, { status: 500 });
  }
}

// POST /api/agents/limits - Fetch limits from centralized agent-limits service
export async function POST() {
  try {
    // Fetch from centralized agent-limits service
    const res = await fetch(AGENT_LIMITS_URL, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[limits-poll] Agent-limits service error:', res.status, text);
      return NextResponse.json({ error: 'Agent-limits service unavailable', status: res.status }, { status: 502 });
    }

    const limitsData: AgentLimitsData[] = await res.json();

    // Build lookup by openclaw agent id
    const limitsByOcId = new Map<string, AgentLimitsData>();
    for (const ld of limitsData) {
      limitsByOcId.set(ld.id, ld);
    }

    const agents = queryAll<Agent & { openclaw_agent_id?: string }>(
      'SELECT * FROM agents'
    );
    const now = new Date().toISOString();
    let updated = 0;

    for (const agent of agents) {
      const ocId = agent.openclaw_agent_id;
      if (!ocId) continue;

      const ld = limitsByOcId.get(ocId);
      if (!ld) continue;

      const limit5h = ld.limit_5h;
      const limitWeek = ld.limit_week;

      if (limit5h === null && limitWeek === null) continue;

      const old5h = agent.limit_5h ?? 100;
      const model = shortModelName(ld.model);
      const provider = providerAccountId(ld.provider_type);

      const effectiveLimit = limit5h ?? old5h;
      const depleted = ld.status === 'critical' || effectiveLimit < 10;

      // Set agent status: depleted agents go to standby
      const newStatus = depleted ? 'standby' : agent.status;

      run(
        'UPDATE agents SET limit_5h = ?, limit_week = ?, model = ?, provider_account_id = ?, last_poll_at = ?, status = ? WHERE id = ?',
        [effectiveLimit, limitWeek ?? agent.limit_week ?? 100, model, provider, now, newStatus, agent.id]
      );
      updated++;

      // Depleted agents: unassign from active tasks
      if (depleted) {
        const unassigned = queryAll<{ id: string; title: string }>(
          `SELECT id, title FROM tasks WHERE assigned_agent_id = ? AND status NOT IN ('done', 'review')`,
          [agent.id]
        );

        if (unassigned.length > 0) {
          run(
            `UPDATE tasks SET assigned_agent_id = NULL, status = CASE WHEN status IN ('in_progress', 'testing') THEN 'inbox' ELSE status END, updated_at = ? WHERE assigned_agent_id = ? AND status NOT IN ('done', 'review')`,
            [now, agent.id]
          );

          for (const task of unassigned) {
            run(
              'INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [
                uuidv4(),
                'task_status_changed',
                agent.id,
                task.id,
                `${agent.name} unassigned from "${task.title}" — out of capacity (${Math.round(effectiveLimit)}%)`,
                JSON.stringify({ reason: 'limit_depleted', limit_5h: effectiveLimit }),
                now,
              ]
            );
            broadcast({ type: 'task_updated', payload: queryOne('SELECT * FROM tasks WHERE id = ?', [task.id]) });
          }
        }
      }

      // Broadcast agent update via SSE
      const refreshed = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [agent.id]);
      if (refreshed) {
        broadcast({ type: 'agent_updated', payload: refreshed });
      }

      // Create event if limit changed significantly
      if (limit5h !== null) {
        const diff = effectiveLimit - old5h;
        if (Math.abs(diff) > 5) {
          const direction = diff > 0 ? 'recovered' : 'dropped';
          run(
            'INSERT INTO events (id, type, agent_id, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [
              uuidv4(),
              'agent_status_changed',
              agent.id,
              `${agent.name} capacity ${direction} to ${effectiveLimit}%`,
              JSON.stringify({ old: old5h, new: effectiveLimit }),
              now,
            ]
          );
        }
      }
    }

    return NextResponse.json({ success: true, polled_at: now, agents_updated: updated, source: 'agent-limits-service' });
  } catch (error) {
    console.error('Failed to poll limits:', error);
    return NextResponse.json({ error: 'Failed to poll limits' }, { status: 500 });
  }
}
