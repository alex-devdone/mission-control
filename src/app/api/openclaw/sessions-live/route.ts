import { NextResponse } from 'next/server';

const GATEWAY_URL = 'http://127.0.0.1:18789';

export async function GET() {
  try {
    const token = process.env.OPENCLAW_GATEWAY_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'OPENCLAW_GATEWAY_TOKEN not set' }, { status: 500 });
    }

    const res = await fetch(`${GATEWAY_URL}/tools/invoke`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tool: 'sessions_list',
        input: { limit: 100, activeMinutes: 30 },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gateway returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const textContent = data.result?.content?.find((c: Record<string, unknown>) => c.text)?.text;
    const parsed = textContent ? JSON.parse(textContent as string) : { count: 0, sessions: [] };

    const nowIso = new Date().toISOString();
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

    return NextResponse.json({
      count: parsed.count || sessions.length,
      sessions,
      modelSourceTimestamp: nowIso,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Failed to fetch live sessions:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
