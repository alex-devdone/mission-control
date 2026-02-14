import { NextRequest, NextResponse } from 'next/server';
import { connectDb, App, Agent, Event } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { App as AppType, CreateAppRequest } from '@/lib/types';
import { broadcast } from '@/lib/events';

export async function GET(req: NextRequest) {
  try {
    await connectDb();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';

    const apps = await App.find({ workspace_id: workspaceId }).sort({ updated_at: -1 }).lean() as any[];
    const agentIds = Array.from(new Set(apps.map(a => a.current_agent_id).filter(Boolean)));
    const agents = agentIds.length > 0 ? await Agent.find({ _id: { $in: agentIds } }).lean() as any[] : [];
    const agentMap = new Map(agents.map(a => [a._id, a]));

    const result = apps.map(a => ({
      ...a, id: a._id,
      current_agent_name: a.current_agent_id && agentMap.has(a.current_agent_id) ? agentMap.get(a.current_agent_id)!.name : undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching apps:', error);
    return NextResponse.json({ error: 'Failed to fetch apps' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDb();
    const body: CreateAppRequest = await req.json();
    const id = uuidv4();

    await App.create({
      _id: id, name: body.name, description: body.description || null,
      path: body.path, port: body.port || null, workspace_id: body.workspace_id || 'default',
    });

    const app = await App.findById(id).lean() as any;
    if (app) broadcast({ type: 'task_created', payload: { ...app, id: app._id } as unknown as import('@/lib/types').Task });

    return NextResponse.json({ ...app, id: app._id }, { status: 201 });
  } catch (error) {
    console.error('Error creating app:', error);
    return NextResponse.json({ error: 'Failed to create app' }, { status: 500 });
  }
}
