import { NextRequest, NextResponse } from 'next/server';
import { connectDb, TaskActivity, Agent } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { TaskActivity as TaskActivityType, ActivityMetadata } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDb();
    const taskId = params.id;

    const activities = await TaskActivity.find({ task_id: taskId }).sort({ created_at: -1 }).lean() as any[];

    const agentIds = Array.from(new Set(activities.map(a => a.agent_id).filter(Boolean)));
    const agents = agentIds.length > 0 ? await Agent.find({ _id: { $in: agentIds } }).lean() as any[] : [];
    const agentMap = new Map(agents.map(a => [a._id, a]));

    const result: TaskActivityType[] = activities.map(row => ({
      id: row._id,
      task_id: row.task_id,
      agent_id: row.agent_id,
      activity_type: row.activity_type,
      message: row.message,
      metadata: row.metadata,
      created_at: row.created_at,
      agent: row.agent_id && agentMap.has(row.agent_id) ? {
        id: agentMap.get(row.agent_id)!._id,
        name: agentMap.get(row.agent_id)!.name,
        avatar_emoji: agentMap.get(row.agent_id)!.avatar_emoji,
        role: '', status: 'working' as const, is_master: false,
        workspace_id: 'default', description: '', created_at: '', updated_at: '',
      } : undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching activities:', error);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }
}

function normalizeMetadata(input: unknown): ActivityMetadata | null {
  if (!input || typeof input !== 'object') return null;
  const data = input as Record<string, unknown>;
  const metadata: ActivityMetadata = {
    ...data,
    model: typeof data.model === 'string' ? data.model : undefined,
    tokens_in: typeof data.tokens_in === 'number' ? data.tokens_in : undefined,
    tokens_out: typeof data.tokens_out === 'number' ? data.tokens_out : undefined,
  };
  return metadata;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDb();
    const taskId = params.id;
    const body = await request.json();
    const { activity_type, message, agent_id, metadata } = body;
    const normalizedMetadata = normalizeMetadata(metadata);

    if (!activity_type || !message) {
      return NextResponse.json({ error: 'activity_type and message are required' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await TaskActivity.create({
      _id: id, task_id: taskId, agent_id: agent_id || null,
      activity_type, message, metadata: normalizedMetadata,
    });

    const activity = await TaskActivity.findById(id).lean() as any;
    let agentInfo: any = undefined;
    if (activity.agent_id) {
      const ag = await Agent.findById(activity.agent_id).lean() as any;
      if (ag) {
        agentInfo = {
          id: ag._id, name: ag.name, avatar_emoji: ag.avatar_emoji,
          role: '', status: 'working' as const, is_master: false,
          workspace_id: 'default', description: '', created_at: '', updated_at: '',
        };
      }
    }

    const result: TaskActivityType = {
      id: activity._id, task_id: activity.task_id, agent_id: activity.agent_id,
      activity_type: activity.activity_type, message: activity.message,
      metadata: activity.metadata, created_at: activity.created_at,
      agent: agentInfo,
    };

    broadcast({ type: 'activity_logged', payload: result });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating activity:', error);
    return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 });
  }
}
