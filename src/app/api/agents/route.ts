import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDb, Agent, Event } from '@/lib/db';
import type { Agent as AgentType, CreateAgentRequest } from '@/lib/types';

// GET /api/agents - List all agents
export async function GET(request: NextRequest) {
  try {
    await connectDb();
    const workspaceId = request.nextUrl.searchParams.get('workspace_id');
    
    const filter: Record<string, unknown> = {};
    if (workspaceId) filter.workspace_id = workspaceId;
    
    const agents = await Agent.find(filter).sort({ is_master: -1, name: 1 }).lean();
    const result = agents.map((a: any) => ({ ...a, id: a._id }));
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}

// POST /api/agents - Create a new agent
export async function POST(request: NextRequest) {
  try {
    await connectDb();
    const body: CreateAgentRequest = await request.json();

    if (!body.name || !body.role) {
      return NextResponse.json({ error: 'Name and role are required' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await Agent.create({
      _id: id,
      name: body.name,
      role: body.role,
      description: body.description || null,
      avatar_emoji: body.avatar_emoji || '🤖',
      is_master: body.is_master ? 1 : 0,
      workspace_id: (body as { workspace_id?: string }).workspace_id || 'default',
      soul_md: body.soul_md || null,
      user_md: body.user_md || null,
      agents_md: body.agents_md || null,
    });

    // Log event
    await Event.create({
      _id: uuidv4(),
      type: 'agent_joined',
      agent_id: id,
      message: `${body.name} joined the team`,
      created_at: now,
    });

    const agent = await Agent.findById(id).lean();
    return NextResponse.json({ ...agent, id: (agent as any)._id }, { status: 201 });
  } catch (error) {
    console.error('Failed to create agent:', error);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}
