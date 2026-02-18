import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CRON_PATH = '/Users/betty/.openclaw/cron/jobs.json';
const RUNS_DIR = '/Users/betty/.openclaw/cron/runs';

interface RunEntry {
  ts: number;
  jobId: string;
  action: string;
  status?: string;
  error?: string;
  summary?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
  sessionId?: string;
  sessionKey?: string;
}

function loadRunHistory(jobId: string, limit = 50): RunEntry[] {
  try {
    const filePath = path.join(RUNS_DIR, `${jobId}.jsonl`);
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean);
    return lines
      .map(line => { try { return JSON.parse(line) as RunEntry; } catch { return null; } })
      .filter((r): r is RunEntry => r !== null && r.action === 'finished')
      .slice(-limit)
      .reverse(); // newest first
  } catch { return []; }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeRuns = url.searchParams.get('runs') !== 'false';
    const runLimit = Math.min(parseInt(url.searchParams.get('runLimit') || '20'), 100);

    const raw = JSON.parse(fs.readFileSync(CRON_PATH, 'utf-8'));
    const jobList: any[] = raw.jobs || [];

    const jobs = jobList.map(job => {
      const runs = includeRuns ? loadRunHistory(job.id, runLimit) : [];
      
      return {
        id: job.id,
        name: job.name,
        agentId: job.agentId === 'main' ? 'betty99bot' : (job.agentId || 'betty99bot'),
        enabled: job.enabled,
        schedule: formatSchedule(job.schedule),
        scheduleRaw: job.schedule,
        model: job.payload?.model,
        prompt: job.payload?.message ? (job.payload.message as string).substring(0, 300) : 
                job.payload?.text ? (job.payload.text as string).substring(0, 300) : undefined,
        payloadKind: job.payload?.kind,
        channel: job.delivery?.channel,
        deliveryTo: job.delivery?.to,
        sessionTarget: job.sessionTarget,
        lastRunAt: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : undefined,
        lastStatus: job.state?.lastStatus,
        lastDurationMs: job.state?.lastDurationMs,
        consecutiveErrors: job.state?.consecutiveErrors || 0,
        lastError: job.state?.lastError,
        createdAt: job.createdAtMs ? new Date(job.createdAtMs).toISOString() : undefined,
        nextRunAt: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : undefined,
        runs: runs.map(r => ({
          ts: r.ts,
          status: r.status,
          error: r.error,
          summary: r.summary?.substring(0, 200),
          runAt: r.runAtMs ? new Date(r.runAtMs).toISOString() : undefined,
          durationMs: r.durationMs,
          sessionId: r.sessionId,
        })),
        totalRuns: runs.length,
      };
    });

    // Build a timeline: all runs from all jobs, sorted by time
    const allRuns: Array<{
      jobId: string;
      jobName: string;
      agentId: string;
      model?: string;
      ts: number;
      status?: string;
      error?: string;
      summary?: string;
      runAt: string;
      durationMs?: number;
      sessionId?: string;
    }> = [];

    for (const job of jobs) {
      for (const run of job.runs) {
        allRuns.push({
          jobId: job.id,
          jobName: job.name || job.id,
          agentId: job.agentId,
          model: job.model,
          ts: run.ts,
          status: run.status,
          error: run.error,
          summary: run.summary,
          runAt: run.runAt || new Date(run.ts).toISOString(),
          durationMs: run.durationMs,
          sessionId: run.sessionId,
        });
      }
    }
    allRuns.sort((a, b) => b.ts - a.ts);

    return NextResponse.json({ jobs, timeline: allRuns.slice(0, 200) });
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
