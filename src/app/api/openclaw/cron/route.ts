import { NextResponse } from 'next/server';
import fs from 'fs';

const CRON_PATH = '/Users/betty/.openclaw/cron/jobs.json';

export async function GET() {
  try {
    const raw = JSON.parse(fs.readFileSync(CRON_PATH, 'utf-8'));
    const jobList: any[] = raw.jobs || [];

    // Normalize job data for frontend
    const jobs = jobList.map(job => ({
      id: job.id,
      name: job.name,
      agentId: job.agentId === 'main' ? 'betty99bot' : (job.agentId || 'betty99bot'),
      enabled: job.enabled,
      schedule: formatSchedule(job.schedule),
      scheduleRaw: job.schedule,
      model: job.payload?.model,
      prompt: job.payload?.message ? (job.payload.message as string).substring(0, 200) : undefined,
      channel: job.delivery?.channel,
      deliveryTo: job.delivery?.to,
      sessionTarget: job.sessionTarget,
      lastRunAt: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : undefined,
      lastStatus: job.state?.lastStatus,
      lastDurationMs: job.state?.lastDurationMs,
      consecutiveErrors: job.state?.consecutiveErrors || 0,
      lastError: job.state?.lastError,
      createdAt: job.createdAtMs ? new Date(job.createdAtMs).toISOString() : undefined,
    }));

    const byAgent: Record<string, typeof jobs> = {};
    for (const job of jobs) {
      if (!byAgent[job.agentId]) byAgent[job.agentId] = [];
      byAgent[job.agentId].push(job);
    }

    return NextResponse.json({ jobs, byAgent });
  } catch (error) {
    console.error('Failed to read cron jobs:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

function formatSchedule(schedule: any): string {
  if (!schedule) return 'Unknown';
  if (schedule.kind === 'cron') return `${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ''}`;
  if (schedule.kind === 'every') {
    const ms = schedule.everyMs || 0;
    if (ms >= 3600000) return `Every ${ms / 3600000}h`;
    if (ms >= 60000) return `Every ${ms / 60000}m`;
    return `Every ${ms / 1000}s`;
  }
  if (schedule.kind === 'at') return `At ${schedule.at ? new Date(schedule.at).toLocaleString() : 'unknown'}`;
  return JSON.stringify(schedule);
}
