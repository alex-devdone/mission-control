import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { connectDb, OpenclawSession, Agent } from '@/lib/db';
import { broadcast } from '@/lib/events';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch {
        return NextResponse.json({ error: 'Failed to connect to OpenClaw Gateway' }, { status: 503 });
      }
    }
    const sessions = await client.listSessions();
    const session = sessions.find((s) => s.id === id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    console.error('Failed to get OpenClaw session:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content } = body;
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 });

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch {
        return NextResponse.json({ error: 'Failed to connect to OpenClaw Gateway' }, { status: 503 });
      }
    }

    await client.sendMessage(id, `[Mission Control] ${content}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to send message to OpenClaw session:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await connectDb();
    const { id } = await params;
    const body = await request.json();
    const { status, ended_at } = body;

    const session = await OpenclawSession.findOne({ openclaw_session_id: id }).lean() as any;
    if (!session) return NextResponse.json({ error: 'Session not found in database' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (ended_at !== undefined) updates.ended_at = ended_at;
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No updates provided' }, { status: 400 });

    await OpenclawSession.findByIdAndUpdate(session._id, { $set: updates });
    const updatedSession = await OpenclawSession.findById(session._id).lean() as any;

    if (status === 'completed') {
      if (session.agent_id) {
        await Agent.findByIdAndUpdate(session.agent_id, { $set: { status: 'idle' } });
      }
      if (session.task_id) {
        broadcast({ type: 'agent_completed', payload: { taskId: session.task_id, sessionId: id } });
      }
    }

    return NextResponse.json({ ...updatedSession, id: updatedSession._id });
  } catch (error) {
    console.error('Failed to update OpenClaw session:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    await connectDb();
    const { id } = await params;

    let session = await OpenclawSession.findOne({ openclaw_session_id: id }).lean() as any;
    if (!session) session = await OpenclawSession.findById(id).lean() as any;
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const taskId = session.task_id;
    const agentId = session.agent_id;

    await OpenclawSession.findByIdAndDelete(session._id);

    if (agentId) {
      const agent = await Agent.findById(agentId).lean() as any;
      if (agent && agent.role === 'Sub-Agent') {
        await Agent.findByIdAndDelete(agentId);
      } else if (agent) {
        await Agent.findByIdAndUpdate(agentId, { $set: { status: 'idle' } });
      }
    }

    broadcast({ type: 'agent_completed', payload: { taskId, sessionId: id, deleted: true } });
    return NextResponse.json({ success: true, deleted: session._id });
  } catch (error) {
    console.error('Failed to delete OpenClaw session:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
