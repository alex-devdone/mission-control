import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDb, Event, Agent, Task } from '@/lib/db';
import type { Event as EventType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await connectDb();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const since = searchParams.get('since');

    const filter: Record<string, unknown> = {};
    if (since) filter.created_at = { $gt: since };

    const events = await Event.find(filter).sort({ created_at: -1 }).limit(limit).lean() as any[];

    const agentIds = Array.from(new Set(events.map(e => e.agent_id).filter(Boolean)));
    const taskIds = Array.from(new Set(events.map(e => e.task_id).filter(Boolean)));
    const agents = agentIds.length > 0 ? await Agent.find({ _id: { $in: agentIds } }).lean() as any[] : [];
    const tasks = taskIds.length > 0 ? await Task.find({ _id: { $in: taskIds } }).lean() as any[] : [];
    const agentMap = new Map(agents.map(a => [a._id, a]));
    const taskMap = new Map(tasks.map(t => [t._id, t]));

    const transformedEvents = events.map((event: any) => ({
      ...event,
      id: event._id,
      agent_name: event.agent_id && agentMap.has(event.agent_id) ? agentMap.get(event.agent_id)!.name : undefined,
      agent_emoji: event.agent_id && agentMap.has(event.agent_id) ? agentMap.get(event.agent_id)!.avatar_emoji : undefined,
      task_title: event.task_id && taskMap.has(event.task_id) ? taskMap.get(event.task_id)!.title : undefined,
      agent: event.agent_id && agentMap.has(event.agent_id) ? {
        id: event.agent_id, name: agentMap.get(event.agent_id)!.name, avatar_emoji: agentMap.get(event.agent_id)!.avatar_emoji,
      } : undefined,
      task: event.task_id && taskMap.has(event.task_id) ? {
        id: event.task_id, title: taskMap.get(event.task_id)!.title,
      } : undefined,
    }));

    return NextResponse.json(transformedEvents);
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDb();
    const body = await request.json();
    if (!body.type || !body.message) return NextResponse.json({ error: 'Type and message are required' }, { status: 400 });

    const id = uuidv4();
    const now = new Date().toISOString();

    await Event.create({
      _id: id, type: body.type, agent_id: body.agent_id || null,
      task_id: body.task_id || null, message: body.message,
      metadata: body.metadata || null, created_at: now,
    });

    return NextResponse.json({ id, type: body.type, message: body.message, created_at: now }, { status: 201 });
  } catch (error) {
    console.error('Failed to create event:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
