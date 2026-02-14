import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDb, Task, Agent, Event } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Task as TaskType, CreateTaskRequest, Agent as AgentType } from '@/lib/types';

// GET /api/tasks
export async function GET(request: NextRequest) {
  try {
    await connectDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const businessId = searchParams.get('business_id');
    const workspaceId = searchParams.get('workspace_id');
    const assignedAgentId = searchParams.get('assigned_agent_id');
    const appId = searchParams.get('app_id');

    const filter: Record<string, unknown> = {};
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) filter.status = statuses[0];
      else if (statuses.length > 1) filter.status = { $in: statuses };
    }
    if (businessId) filter.business_id = businessId;
    if (workspaceId) filter.workspace_id = workspaceId;
    if (assignedAgentId) filter.assigned_agent_id = assignedAgentId;
    if (appId) filter.app_id = appId;

    const tasks = await Task.find(filter).sort({ created_at: -1 }).lean() as any[];

    // Fetch agent info for assigned and created_by agents
    const agentIds = Array.from(new Set([
      ...tasks.map(t => t.assigned_agent_id).filter(Boolean),
      ...tasks.map(t => t.created_by_agent_id).filter(Boolean),
    ]));
    const agents = agentIds.length > 0 ? await Agent.find({ _id: { $in: agentIds } }).lean() as any[] : [];
    const agentMap = new Map(agents.map(a => [a._id, a]));

    const transformedTasks = tasks.map((task: any) => {
      const aa = task.assigned_agent_id ? agentMap.get(task.assigned_agent_id) : null;
      const ca = task.created_by_agent_id ? agentMap.get(task.created_by_agent_id) : null;
      return {
        ...task,
        id: task._id,
        assigned_agent_name: aa?.name || undefined,
        assigned_agent_emoji: aa?.avatar_emoji || undefined,
        created_by_agent_name: ca?.name || undefined,
        assigned_agent: aa ? { id: aa._id, name: aa.name, avatar_emoji: aa.avatar_emoji } : undefined,
      };
    });

    return NextResponse.json(transformedTasks);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/tasks
export async function POST(request: NextRequest) {
  try {
    await connectDb();
    const body: CreateTaskRequest = await request.json();
    console.log('[POST /api/tasks] Received body:', JSON.stringify(body));

    if (!body.title) {
      console.log('[POST /api/tasks] Title missing or empty');
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const workspaceId = (body as { workspace_id?: string }).workspace_id || 'default';
    const status = (body as { status?: string }).status || 'inbox';

    await Task.create({
      _id: id, title: body.title, description: body.description || null,
      status, priority: body.priority || 'normal',
      assigned_agent_id: body.assigned_agent_id || null,
      created_by_agent_id: body.created_by_agent_id || null,
      workspace_id: workspaceId, business_id: body.business_id || 'default',
      app_id: body.app_id || null, due_date: body.due_date || null,
    });

    let eventMessage = `New task: ${body.title}`;
    if (body.created_by_agent_id) {
      const creator = await Agent.findById(body.created_by_agent_id).lean() as any;
      if (creator) eventMessage = `${creator.name} created task: ${body.title}`;
    }

    await Event.create({
      _id: uuidv4(), type: 'task_created',
      agent_id: body.created_by_agent_id || null, task_id: id,
      message: eventMessage, created_at: now,
    });

    // Fetch with agent joins
    const task = await Task.findById(id).lean() as any;
    const result: any = { ...task, id: task._id };
    if (task?.assigned_agent_id) {
      const aa = await Agent.findById(task.assigned_agent_id).lean() as any;
      if (aa) { result.assigned_agent_name = aa.name; result.assigned_agent_emoji = aa.avatar_emoji; }
    }
    if (task?.created_by_agent_id) {
      const ca = await Agent.findById(task.created_by_agent_id).lean() as any;
      if (ca) { result.created_by_agent_name = ca.name; result.created_by_agent_emoji = ca.avatar_emoji; }
    }

    if (task) broadcast({ type: 'task_created', payload: result as TaskType });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
