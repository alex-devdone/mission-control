import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDb, Agent, Event, OpenclawSession, Task, TaskActivity, Message, ConversationParticipant } from '@/lib/db';
import type { Agent as AgentType, UpdateAgentRequest } from '@/lib/types';

// GET /api/agents/[id] - Get a single agent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await params;
    const agent = await Agent.findById(id).lean();

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({ ...agent, id: (agent as any)._id });
  } catch (error) {
    console.error('Failed to fetch agent:', error);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}

// PATCH /api/agents/[id] - Update an agent
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await params;
    const body: UpdateAgentRequest = await request.json();

    const existing = await Agent.findById(id).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.role !== undefined) updates.role = body.role;
    if (body.description !== undefined) updates.description = body.description;
    if (body.avatar_emoji !== undefined) updates.avatar_emoji = body.avatar_emoji;
    if (body.status !== undefined) {
      updates.status = body.status;
      const now = new Date().toISOString();
      await Event.create({
        _id: uuidv4(), type: 'agent_status_changed', agent_id: id,
        message: `${(existing as any).name} is now ${body.status}`, created_at: now,
      });
    }
    if (body.is_master !== undefined) updates.is_master = body.is_master ? 1 : 0;
    if (body.soul_md !== undefined) updates.soul_md = body.soul_md;
    if (body.user_md !== undefined) updates.user_md = body.user_md;
    if (body.agents_md !== undefined) updates.agents_md = body.agents_md;
    if ((body as Record<string, unknown>).model !== undefined) updates.model = (body as Record<string, unknown>).model;
    if ((body as Record<string, unknown>).provider_account_id !== undefined) updates.provider_account_id = (body as Record<string, unknown>).provider_account_id;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    await Agent.findByIdAndUpdate(id, { $set: updates });
    const agent = await Agent.findById(id).lean();
    return NextResponse.json({ ...agent, id: (agent as any)._id });
  } catch (error) {
    console.error('Failed to update agent:', error);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}

// DELETE /api/agents/[id] - Delete an agent
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await params;
    const existing = await Agent.findById(id).lean();

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    await OpenclawSession.deleteMany({ agent_id: id });
    await Event.deleteMany({ agent_id: id });
    await Message.deleteMany({ sender_agent_id: id });
    await ConversationParticipant.deleteMany({ agent_id: id });
    await Task.updateMany({ assigned_agent_id: id }, { $set: { assigned_agent_id: null } });
    await Task.updateMany({ created_by_agent_id: id }, { $set: { created_by_agent_id: null } });
    await TaskActivity.updateMany({ agent_id: id }, { $set: { agent_id: null } });
    await Agent.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete agent:', error);
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 });
  }
}
