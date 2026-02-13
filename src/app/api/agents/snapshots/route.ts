import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

interface SnapshotRow {
  snapshot_time: string;
  agent_id: string;
  agent_name: string;
  status: string;
  avatar_emoji: string;
  model: string;
  limit_5h: number;
  limit_week: number;
  task_id: string | null;
  task_title: string | null;
}

// GET /api/agents/snapshots?hours=24
// Returns distinct snapshot timestamps and their agent data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24', 10);
    const clampedHours = Math.min(Math.max(1, hours), 168); // 1h to 7d

    const rows = queryAll<SnapshotRow>(
      `SELECT snapshot_time, agent_id, agent_name, status, avatar_emoji, model, limit_5h, limit_week, task_id, task_title
       FROM agent_snapshots
       WHERE snapshot_time >= datetime('now', ?)
       ORDER BY snapshot_time ASC, agent_name ASC`,
      [`-${clampedHours} hours`]
    );

    // Group by snapshot_time
    const snapshots: Record<string, SnapshotRow[]> = {};
    for (const row of rows) {
      if (!snapshots[row.snapshot_time]) {
        snapshots[row.snapshot_time] = [];
      }
      snapshots[row.snapshot_time].push(row);
    }

    // Return as ordered array of { time, agents }
    const result = Object.entries(snapshots).map(([time, agents]) => ({
      time,
      agents,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch snapshots:', error);
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 });
  }
}
