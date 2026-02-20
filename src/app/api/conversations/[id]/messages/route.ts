import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Message, Agent } from '@/lib/db';
import type { Message as MessageType } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    await connectDb();

    const rows = await Message.find({ conversation_id: id }).sort({ created_at: 1 }).limit(500).lean() as any[];
    const senderIds = Array.from(new Set(rows.map((r) => r.sender_agent_id).filter(Boolean)));
    const senders = senderIds.length ? await Agent.find({ _id: { $in: senderIds } }).lean() as any[] : [];
    const senderMap = new Map(senders.map((s) => [s._id, s]));

    const result: MessageType[] = rows.map((r) => {
      const sender = r.sender_agent_id ? senderMap.get(r.sender_agent_id) : null;
      return {
        id: r._id,
        conversation_id: r.conversation_id,
        sender_agent_id: r.sender_agent_id,
        content: r.content,
        message_type: r.message_type,
        metadata: typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata),
        created_at: r.created_at,
        sender: sender
          ? {
              id: sender._id,
              name: sender.name,
              role: sender.role,
              avatar_emoji: sender.avatar_emoji,
              status: sender.status,
              is_master: sender.is_master,
              workspace_id: sender.workspace_id,
              description: sender.description,
              created_at: sender.created_at,
              updated_at: sender.updated_at,
              openclaw_agent_id: sender.openclaw_agent_id,
              model: sender.model,
              limit_5h: sender.limit_5h,
              limit_week: sender.limit_week,
            }
          : undefined,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    await connectDb();
    const body = await request.json();
    const { content, sender_agent_id = null, message_type = 'text', metadata = null } = body;

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const created = await Message.create({
      conversation_id: id,
      sender_agent_id,
      content,
      message_type,
      metadata,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ id: created._id }, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation message:', error);
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
  }
}
