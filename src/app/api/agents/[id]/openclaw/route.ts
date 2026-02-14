import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDb, Agent, OpenclawSession, Event } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent as AgentType, OpenClawSession } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/agents/[id]/openclaw
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDb();
    const { id } = await params;

    const agent = await Agent.findById(id).lean();
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const session = await OpenclawSession.findOne({ agent_id: id, status: 'active' }).lean();

    if (!session) {
      return NextResponse.json({ linked: false, session: null });
    }

    return NextResponse.json({ linked: true, session: { ...session, id: (session as any)._id } });
  } catch (error) {
    console.error('Failed to get OpenClaw session:', error);
    return NextResponse.json({ error: 'Failed to get OpenClaw session' }, { status: 500 });
  }
}

// POST /api/agents/[id]/openclaw
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDb();
    const { id } = await params;

    const agent = await Agent.findById(id).lean() as any;
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const existingSession = await OpenclawSession.findOne({ agent_id: id, status: 'active' }).lean();
    if (existingSession) {
      return NextResponse.json(
        { error: 'Agent is already linked to an OpenClaw session', session: { ...existingSession, id: (existingSession as any)._id } },
        { status: 409 }
      );
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch {
        return NextResponse.json({ error: 'Failed to connect to OpenClaw Gateway' }, { status: 503 });
      }
    }

    try { await client.listSessions(); } catch (err) {
      console.error('Failed to verify OpenClaw connection:', err);
      return NextResponse.json({ error: 'Connected but failed to communicate with OpenClaw Gateway' }, { status: 503 });
    }

    const sessionId = uuidv4();
    const openclawSessionId = `mission-control-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;
    const now = new Date().toISOString();

    await OpenclawSession.create({
      _id: sessionId,
      agent_id: id,
      openclaw_session_id: openclawSessionId,
      channel: 'mission-control',
      status: 'active',
      created_at: now,
    });

    await Event.create({
      _id: uuidv4(), type: 'agent_status_changed', agent_id: id,
      message: `${agent.name} connected to OpenClaw Gateway`, created_at: now,
    });

    const session = await OpenclawSession.findById(sessionId).lean();
    return NextResponse.json({ linked: true, session: { ...session, id: (session as any)._id } }, { status: 201 });
  } catch (error) {
    console.error('Failed to link agent to OpenClaw:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to link agent to OpenClaw' },
      { status: 500 }
    );
  }
}

// DELETE /api/agents/[id]/openclaw
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDb();
    const { id } = await params;

    const agent = await Agent.findById(id).lean() as any;
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const existingSession = await OpenclawSession.findOne({ agent_id: id, status: 'active' }).lean() as any;
    if (!existingSession) {
      return NextResponse.json({ error: 'Agent is not linked to an OpenClaw session' }, { status: 404 });
    }

    const now = new Date().toISOString();
    await OpenclawSession.findByIdAndUpdate(existingSession._id, { $set: { status: 'inactive' } });

    await Event.create({
      _id: uuidv4(), type: 'agent_status_changed', agent_id: id,
      message: `${agent.name} disconnected from OpenClaw Gateway`, created_at: now,
    });

    return NextResponse.json({ linked: false, success: true });
  } catch (error) {
    console.error('Failed to unlink agent from OpenClaw:', error);
    return NextResponse.json({ error: 'Failed to unlink agent from OpenClaw' }, { status: 500 });
  }
}
