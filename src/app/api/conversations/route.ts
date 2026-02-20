import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Conversation, ConversationParticipant, Agent, Message } from '@/lib/db';
import { ensureTeamConversations } from '@/lib/teamChats';
import type { Conversation as ConversationType, Agent as AgentType, Message as MessageType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await connectDb();
    await ensureTeamConversations();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'group';

    const conversations = await Conversation.find({ type }).sort({ updated_at: -1 }).lean() as any[];
    const conversationIds = conversations.map((c) => c._id);

    const participants = conversationIds.length
      ? await ConversationParticipant.find({ conversation_id: { $in: conversationIds } }).lean() as any[]
      : [];

    const agentIds = Array.from(new Set(participants.map((p) => p.agent_id).filter(Boolean)));
    const agents = agentIds.length
      ? await Agent.find({ _id: { $in: agentIds } }).lean() as any[]
      : [];
    const agentMap = new Map(agents.map((a) => [a._id, a]));

    const lastMessages = conversationIds.length
      ? await Message.aggregate([
          { $match: { conversation_id: { $in: conversationIds } } },
          { $sort: { created_at: -1 } },
          { $group: { _id: '$conversation_id', doc: { $first: '$$ROOT' } } },
        ])
      : [];
    const lastMessageMap = new Map(lastMessages.map((m: any) => [m._id, m.doc]));

    const result: ConversationType[] = conversations.map((c) => {
      const convoParticipants = participants
        .filter((p) => p.conversation_id === c._id)
        .map((p) => agentMap.get(p.agent_id))
        .filter(Boolean)
        .map((a: any): AgentType => ({
          id: a._id,
          name: a.name,
          role: a.role,
          avatar_emoji: a.avatar_emoji,
          status: a.status,
          is_master: a.is_master,
          workspace_id: a.workspace_id,
          description: a.description,
          created_at: a.created_at,
          updated_at: a.updated_at,
          openclaw_agent_id: a.openclaw_agent_id,
          model: a.model,
          limit_5h: a.limit_5h,
          limit_week: a.limit_week,
        }));

      const last = lastMessageMap.get(c._id);
      const lastMessage: MessageType | undefined = last
        ? {
            id: last._id,
            conversation_id: last.conversation_id,
            sender_agent_id: last.sender_agent_id,
            content: last.content,
            message_type: last.message_type,
            metadata: typeof last.metadata === 'string' ? last.metadata : JSON.stringify(last.metadata),
            created_at: last.created_at,
          }
        : undefined;

      return {
        id: c._id,
        title: c.title,
        type: c.type,
        task_id: c.task_id,
        created_at: c.created_at,
        updated_at: c.updated_at,
        participants: convoParticipants,
        last_message: lastMessage,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDb();
    const body = await request.json();
    const { title, participant_agent_ids = [] } = body;

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const conversation = await Conversation.create({ title, type: 'group' });
    for (const agentId of participant_agent_ids as string[]) {
      await ConversationParticipant.updateOne(
        { conversation_id: conversation._id, agent_id: agentId },
        { $setOnInsert: { joined_at: new Date().toISOString() } },
        { upsert: true }
      );
    }

    return NextResponse.json({ id: conversation._id }, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
