import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDb, Agent, Event, Task, AgentSnapshot } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Agent as AgentType } from '@/lib/types';

const AGENT_LIMITS_URL = 'http://localhost:5280/api/agents';

interface AgentLimitsData {
  id: string;
  name: string;
  model: string;
  provider_type: string;
  status: 'ok' | 'low' | 'critical' | 'unknown';
  limit_5h: number | null;
  limit_week: number | null;
  reset_at: string | null;
  reset_week_at: string | null;
  fallbacks: string[];
}

function shortModelName(model: string): string {
  if (model.includes('opus-4-6')) return 'opus 4.6';
  if (model.includes('opus-4-5')) return 'opus 4.5';
  if (model.includes('sonnet-4-5')) return 'sonnet 4.5';
  if (model.includes('haiku-4-5')) return 'haiku 4.5';
  if (model.includes('glm-5')) return 'GLM-5';
  if (model.includes('codex')) return 'codex';
  const parts = model.split('/');
  return parts[parts.length - 1];
}

function providerAccountId(providerType: string): string {
  switch (providerType) {
    case 'anthropic': return 'anthropic';
    case 'z-ai': return 'zai';
    case 'openai': return 'openai';
    case 'gemini': return 'gemini';
    default: return providerType;
  }
}

// GET /api/agents/limits
export async function GET() {
  try {
    await connectDb();
    const agents = await Agent.find({}, 'name model provider_account_id limit_5h limit_week last_poll_at').lean();
    const result = agents.map((a: any) => ({ ...a, id: a._id }));
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch agent limits:', error);
    return NextResponse.json({ error: 'Failed to fetch agent limits' }, { status: 500 });
  }
}

// POST /api/agents/limits
export async function POST() {
  try {
    await connectDb();
    const res = await fetch(AGENT_LIMITS_URL, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      const text = await res.text();
      console.error('[limits-poll] Agent-limits service error:', res.status, text);
      return NextResponse.json({ error: 'Agent-limits service unavailable', status: res.status }, { status: 502 });
    }

    const limitsData: AgentLimitsData[] = await res.json();
    const limitsByOcId = new Map<string, AgentLimitsData>();
    for (const ld of limitsData) {
      limitsByOcId.set(ld.id, ld);
    }

    const agents = await Agent.find({}).lean() as any[];
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
      const newStatus = depleted ? 'standby' : agent.status;

      await Agent.findByIdAndUpdate(agent._id, {
        $set: {
          limit_5h: effectiveLimit,
          limit_week: limitWeek ?? agent.limit_week ?? 100,
          model, provider_account_id: provider,
          last_poll_at: now, status: newStatus,
        }
      });
      updated++;

      if (depleted) {
        const unassigned = await Task.find({
          assigned_agent_id: agent._id,
          status: { $nin: ['done', 'review'] }
        }).lean() as any[];

        if (unassigned.length > 0) {
          for (const task of unassigned) {
            const newTaskStatus = ['in_progress', 'testing'].includes(task.status) ? 'inbox' : task.status;
            await Task.findByIdAndUpdate(task._id, {
              $set: { assigned_agent_id: null, status: newTaskStatus, updated_at: now }
            });

            await Event.create({
              _id: uuidv4(), type: 'task_status_changed', agent_id: agent._id, task_id: task._id,
              message: `${agent.name} unassigned from "${task.title}" — out of capacity (${Math.round(effectiveLimit)}%)`,
              metadata: { reason: 'limit_depleted', limit_5h: effectiveLimit },
              created_at: now,
            });
            const updatedTask = await Task.findById(task._id).lean();
            if (updatedTask) broadcast({ type: 'task_updated', payload: { ...updatedTask, id: (updatedTask as any)._id } as unknown as import('@/lib/types').Task });
          }
        }
      }

      const refreshed = await Agent.findById(agent._id).lean();
      if (refreshed) {
        broadcast({ type: 'agent_updated', payload: { ...refreshed, id: (refreshed as any)._id } as unknown as AgentType });
      }

      if (limit5h !== null) {
        const diff = effectiveLimit - old5h;
        if (Math.abs(diff) > 5) {
          const direction = diff > 0 ? 'recovered' : 'dropped';
          await Event.create({
            _id: uuidv4(), type: 'agent_status_changed', agent_id: agent._id,
            message: `${agent.name} capacity ${direction} to ${effectiveLimit}%`,
            metadata: { old: old5h, new: effectiveLimit },
            created_at: now,
          });
        }
      }
    }

    // Record snapshots
    try {
      const allAgents = await Agent.find({}).lean() as any[];
      for (const a of allAgents) {
        const activeTask = await Task.findOne({
          assigned_agent_id: a._id,
          status: { $nin: ['done', 'review'] }
        }).lean() as any;
        
        await AgentSnapshot.create({
          snapshot_time: now, agent_id: a._id, agent_name: a.name,
          status: a.status, avatar_emoji: a.avatar_emoji, model: a.model ?? 'unknown',
          limit_5h: a.limit_5h ?? 100, limit_week: a.limit_week ?? 100,
          task_id: activeTask?._id ?? null, task_title: activeTask?.title ?? null,
        });
      }
      // Prune snapshots older than 7 days
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await AgentSnapshot.deleteMany({ snapshot_time: { $lt: cutoff } });
    } catch (snapErr) {
      console.error('[limits-poll] Failed to record snapshots:', snapErr);
    }

    return NextResponse.json({ success: true, polled_at: now, agents_updated: updated, source: 'agent-limits-service' });
  } catch (error) {
    console.error('Failed to poll limits:', error);
    return NextResponse.json({ error: 'Failed to poll limits' }, { status: 500 });
  }
}
