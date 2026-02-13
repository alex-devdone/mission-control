import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type { Agent } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/[id]/chat — Get chat history for this agent's OpenClaw session
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const agent = queryOne<Agent & { openclaw_agent_id?: string }>(
      'SELECT * FROM agents WHERE id = ?',
      [id]
    );
    if (!agent || !agent.openclaw_agent_id) {
      return NextResponse.json({ error: 'Agent not found or has no OpenClaw ID' }, { status: 404 });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch {
        return NextResponse.json({ error: 'OpenClaw Gateway not available' }, { status: 503 });
      }
    }

    // List sessions — try WS client first, fall back to HTTP
    let allSessions: any[] = [];
    try {
      const wsResult = await client.listSessions();
      // WS may return {sessions: [...]} or just [...]
      if (Array.isArray(wsResult)) {
        allSessions = wsResult;
      } else if ((wsResult as any)?.sessions) {
        allSessions = (wsResult as any).sessions;
      }
    } catch {
      // Fall back to HTTP endpoint
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

    if (!agentSession) {
      return NextResponse.json({ history: [], sessionKey: null, debug: { agentPrefix, sessionCount: allSessions.length } });
    }

    const sessionKey = agentSession.key;

    // Get history using chat.history
    try {
      const history = await client.call('chat.history', { sessionKey, limit: 50 });
      // chat.history returns {messages: [...]} or just [...]
      const messages = Array.isArray(history) ? history : ((history as any)?.messages || (history as any)?.history || []);
      return NextResponse.json({ history: messages, sessionKey });
    } catch (e) {
      console.error('Failed to get session history:', e);
      return NextResponse.json({ history: [], sessionKey, error: String(e) });
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
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const agent = queryOne<Agent & { openclaw_agent_id?: string }>(
      'SELECT * FROM agents WHERE id = ?',
      [id]
    );
    if (!agent || !agent.openclaw_agent_id) {
      return NextResponse.json({ error: 'Agent not found or has no OpenClaw ID' }, { status: 404 });
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch {
        return NextResponse.json({ error: 'OpenClaw Gateway not available' }, { status: 503 });
      }
    }

    // Find agent's active session
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

    if (!agentSession) {
      return NextResponse.json({ error: 'Agent has no active OpenClaw session' }, { status: 404 });
    }

    const sessionKey = agentSession.key;

    // Send via sessions.send with sessionKey
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
