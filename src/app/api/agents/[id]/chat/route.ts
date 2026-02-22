import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Agent } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent as AgentType } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/[id]/chat — Get chat history for this agent's OpenClaw session
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    await connectDb();
    const agent = await Agent.findById(id).lean() as any;
    if (!agent || !agent.openclaw_agent_id) {
      return NextResponse.json({ error: 'Agent not found or has no OpenClaw ID' }, { status: 404 });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch {
        return NextResponse.json({ error: 'OpenClaw Gateway not available' }, { status: 503 });
      }
    }

    let allSessions: any[] = [];
    try {
      const wsResult = await client.listSessions();
      if (Array.isArray(wsResult)) {
        allSessions = wsResult;
      } else if ((wsResult as any)?.sessions) {
        allSessions = (wsResult as any).sessions;
      }
    } catch {
      try {
        const httpRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:17789'}/api/openclaw/sessions`);
        if (httpRes.ok) {
          const data = await httpRes.json();
          allSessions = data?.sessions?.sessions || [];
        }
      } catch { /* ignore */ }
    }

    const agentPrefix = `agent:${agent.openclaw_agent_id.toLowerCase()}:`;
    const agentSession = allSessions.find((s: any) =>
      (s.key || '').toLowerCase().startsWith(agentPrefix)
    );

    // Use existing session or construct the expected main session key
    const sessionKey = agentSession?.key || `agent:${agent.openclaw_agent_id}:main`;

    try {
      const history = await client.call('chat.history', { sessionKey, limit: 50 });
      const messages = Array.isArray(history) ? history : ((history as any)?.messages || (history as any)?.history || []);
      return NextResponse.json({ history: messages, sessionKey });
    } catch (e) {
      console.error('Failed to get session history:', e);
      // Return empty history but still provide sessionKey so user can send messages
      return NextResponse.json({ history: [], sessionKey });
    }
  } catch (error) {
    console.error('Failed to get agent chat:', error);
    return NextResponse.json({ error: 'Failed to get chat history' }, { status: 500 });
  }
}

/**
 * POST /api/agents/[id]/chat — Send a message to this agent's OpenClaw session
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    await connectDb();
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const agent = await Agent.findById(id).lean() as any;
    if (!agent || !agent.openclaw_agent_id) {
      return NextResponse.json({ error: 'Agent not found or has no OpenClaw ID' }, { status: 404 });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch {
        return NextResponse.json({ error: 'OpenClaw Gateway not available' }, { status: 503 });
      }
    }

    let allSessions: any[] = [];
    try {
      const wsResult = await client.listSessions();
      if (Array.isArray(wsResult)) allSessions = wsResult;
      else if ((wsResult as any)?.sessions) allSessions = (wsResult as any).sessions;
    } catch {
      try {
        const httpRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:17789'}/api/openclaw/sessions`);
        if (httpRes.ok) {
          const data = await httpRes.json();
          allSessions = data?.sessions?.sessions || [];
        }
      } catch { /* ignore */ }
    }

    const agentPrefix = `agent:${agent.openclaw_agent_id.toLowerCase()}:`;
    const agentSession = allSessions.find((s: any) =>
      (s.key || '').toLowerCase().startsWith(agentPrefix)
    );

    // Use existing session or construct the expected main session key
    const sessionKey = agentSession?.key || `agent:${agent.openclaw_agent_id}:main`;

    await client.call('sessions.send', {
      sessionKey,
      message: `[Mission Control Chat] ${content}`,
    });

    return NextResponse.json({ success: true, sessionKey });
  } catch (error) {
    console.error('Failed to send agent chat:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send' },
      { status: 500 }
    );
  }
}
