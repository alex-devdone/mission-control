import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Agent, Message } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    await connectDb();
    const body = await request.json().catch(() => ({}));
    const { conversation_id, context } = body;

    const agent = await Agent.findById(id).lean() as any;
    if (!agent || !agent.openclaw_agent_id) {
      return NextResponse.json({ error: 'Agent not found or has no OpenClaw ID' }, { status: 404 });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json({ error: 'OpenClaw Gateway not available' }, { status: 503 });
      }
    }

    let allSessions: any[] = [];
    try {
      const wsResult = await client.listSessions();
      if (Array.isArray(wsResult)) allSessions = wsResult;
      else if ((wsResult as any)?.sessions) allSessions = (wsResult as any).sessions;
    } catch {
      // ignore
    }

    const agentPrefix = `agent:${agent.openclaw_agent_id.toLowerCase()}:`;
    const agentSession = allSessions.find((s: any) => (s.key || '').toLowerCase().startsWith(agentPrefix));
    if (!agentSession) {
      return NextResponse.json({ error: 'Agent has no active session' }, { status: 404 });
    }

    const pingText = `[Mission Control Ping] Please send a quick status update on your current task${context ? ` (${context})` : ''}. Reply concisely: what you're doing now, blockers (if any), and ETA.`;

    // Post "ping sent" message immediately
    if (conversation_id) {
      await Message.create({
        conversation_id,
        sender_agent_id: null,
        content: `🏓 Ping sent to ${agent.name}...`,
        message_type: 'system',
        metadata: { type: 'agent_ping', agent_id: agent._id },
        created_at: new Date().toISOString(),
      });
    }

    // Send and wait for reply (up to 60s)
    const result = await client.call('sessions.send', {
      sessionKey: agentSession.key,
      message: pingText,
      timeoutSeconds: 60,
    }) as any;

    const reply = result?.reply;
    if (reply && conversation_id) {
      // Clean up reply - remove NO_REPLY, reply tags, etc
      const cleanReply = reply
        .replace(/\[\[reply_to[^\]]*\]\]/g, '')
        .replace(/^NO_REPLY$/m, '')
        .trim();

      if (cleanReply) {
        await Message.create({
          conversation_id,
          sender_agent_id: agent._id,
          content: cleanReply,
          message_type: 'text',
          metadata: { type: 'ping_response' },
          created_at: new Date().toISOString(),
        });
      }
    } else if (!reply && conversation_id) {
      await Message.create({
        conversation_id,
        sender_agent_id: null,
        content: `⏳ ${agent.name} didn't respond within 60s (status: ${result?.status || 'unknown'})`,
        message_type: 'system',
        created_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true, reply: reply || null });
  } catch (error) {
    console.error('Failed to ping agent:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to ping agent' }, { status: 500 });
  }
}
