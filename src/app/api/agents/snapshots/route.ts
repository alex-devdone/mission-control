import { NextRequest, NextResponse } from 'next/server';
import { connectDb, AgentSnapshot } from '@/lib/db';

// GET /api/agents/snapshots?hours=24
export async function GET(request: NextRequest) {
  try {
    await connectDb();
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24', 10);
    const clampedHours = Math.min(Math.max(1, hours), 168);

    const cutoff = new Date(Date.now() - clampedHours * 60 * 60 * 1000).toISOString();

    const rows = await AgentSnapshot.find({
      snapshot_time: { $gte: cutoff }
    }).sort({ snapshot_time: 1, agent_name: 1 }).lean();

    // Group by snapshot_time
    const snapshots: Record<string, any[]> = {};
    for (const row of rows) {
      const r = row as any;
      const time = r.snapshot_time;
      if (!snapshots[time]) snapshots[time] = [];
      snapshots[time].push({
        snapshot_time: r.snapshot_time,
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        status: r.status,
        avatar_emoji: r.avatar_emoji,
        model: r.model,
        limit_5h: r.limit_5h,
        limit_week: r.limit_week,
        task_id: r.task_id,
        task_title: r.task_title,
      });
    }

    const result = Object.entries(snapshots).map(([time, agents]) => ({ time, agents }));
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch snapshots:', error);
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 });
  }
}
