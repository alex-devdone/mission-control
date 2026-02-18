import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@/lib/db';
import { SessionToken } from '@/lib/db/models';

const GATEWAY_URL = 'http://127.0.0.1:18789';

export async function POST() {
  try {
    const token = process.env.OPENCLAW_GATEWAY_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'OPENCLAW_GATEWAY_TOKEN not set' }, { status: 500 });
    }

    const res = await fetch(`${GATEWAY_URL}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'sessions_list',
        input: { limit: 5000, activeMinutes: 99999 },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gateway returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const textContent = data.result?.content?.find((c: Record<string, unknown>) => c.text)?.text;
    const parsed = textContent ? JSON.parse(textContent as string) : { count: 0, sessions: [] };
    const sessions = parsed.sessions || [];

    await connectDb();

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    let processed = 0;

    for (const session of sessions) {
      const key: string = session.key || '';
      const parts = key.split(':');
      const agentId = parts[1] || 'unknown';

      await SessionToken.findOneAndUpdate(
        { session_id: key },
        {
          $set: {
            agent_id: agentId,
            channel: session.channel || '',
            model: session.model || '',
            total_tokens: session.totalTokens || 0,
            last_seen_at: now,
          },
          $setOnInsert: {
            session_id: key,
            date: today,
            created_at: now,
          },
        },
        { upsert: true }
      );
      processed++;
    }

    return NextResponse.json({ success: true, sessions_processed: processed });
  } catch (error) {
    console.error('Failed to poll session tokens:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectDb();

    const { searchParams } = request.nextUrl;
    const days = parseInt(searchParams.get('days') || '7', 10);
    const agentId = searchParams.get('agent_id');

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().slice(0, 10);

    const matchStage: Record<string, any> = { date: { $gte: sinceDate } };
    if (agentId) matchStage.agent_id = agentId;

    const raw = searchParams.get('raw') === '1';

    if (raw) {
      // Return individual session records for per-agent mini charts
      const sessions = await SessionToken.find(matchStage)
        .sort({ created_at: 1 })
        .select({ _id: 0, session_id: 1, agent_id: 1, model: 1, total_tokens: 1, date: 1, created_at: 1 })
        .lean();
      return NextResponse.json(sessions);
    }

    const results = await SessionToken.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { agent_id: '$agent_id', date: '$date', model: '$model' },
          tokens: { $sum: '$total_tokens' },
        },
      },
      { $sort: { '_id.date': 1, '_id.model': 1 } },
      {
        $project: {
          _id: 0,
          agent_id: '$_id.agent_id',
          date: '$_id.date',
          model: '$_id.model',
          tokens: 1,
        },
      },
    ]);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Failed to query session tokens:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
