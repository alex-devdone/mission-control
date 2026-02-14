import { NextRequest, NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { connectDb, OpenclawSession } from '@/lib/db';
import type { OpenClawSession } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionType = searchParams.get('session_type');
    const status = searchParams.get('status');

    if (sessionType || status) {
      await connectDb();
      const filter: Record<string, unknown> = {};
      if (sessionType) filter.session_type = sessionType;
      if (status) filter.status = status;

      const sessions = await OpenclawSession.find(filter).sort({ created_at: -1 }).lean() as any[];
      const result = sessions.map(s => ({ ...s, id: s._id }));
      return NextResponse.json(result);
    }

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch {
        return NextResponse.json({ error: 'Failed to connect to OpenClaw Gateway' }, { status: 503 });
      }
    }

    const sessions = await client.listSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Failed to list OpenClaw sessions:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channel, peer } = body;
    if (!channel) return NextResponse.json({ error: 'channel is required' }, { status: 400 });

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch {
        return NextResponse.json({ error: 'Failed to connect to OpenClaw Gateway' }, { status: 503 });
      }
    }

    const session = await client.createSession(channel, peer);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error('Failed to create OpenClaw session:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
