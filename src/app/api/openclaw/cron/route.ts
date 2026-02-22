import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { connectDb, CronRun } from '@/lib/db';

const CRON_PATH = '/Users/betty/.openclaw/cron/jobs.json';
const RUNS_DIR = '/Users/betty/.openclaw/cron/runs';

// In-memory sync tracking per job
const lastSyncedAt: Map<string, number> = new Map();
const SYNC_INTERVAL_MS = 60_000;

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

function parseRunFile(filePath: string, sinceTs?: number): RunEntry[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean);
    return lines
      .map(line => { try { return JSON.parse(line) as RunEntry; } catch { return null; } })
      .filter((r): r is RunEntry => {
        if (!r || r.action !== 'finished') return false;
        if (sinceTs && r.ts <= sinceTs) return false;
        return true;
      });
  } catch { return []; }
}

async function syncJob(jobId: string, force = false): Promise<void> {
  const lastSync = lastSyncedAt.get(jobId) || 0;
  if (!force && Date.now() - lastSync < SYNC_INTERVAL_MS) return;

  const filePath = path.join(RUNS_DIR, `${jobId}.jsonl`);
  if (!fs.existsSync(filePath)) {
    lastSyncedAt.set(jobId, Date.now());
    return;
  }

  // Find the latest ts we have stored for this job
  const latestDoc = await CronRun.findOne({ job_id: jobId })
    .sort({ ts: -1 })
    .select('ts')
    .lean();

  const latestTs = (latestDoc as any)?.ts as number | undefined;

  // If we have existing data, skip if file hasn't been modified
  if (latestTs) {
    try {
      const mtime = fs.statSync(filePath).mtimeMs;
      if (mtime < latestTs) {
        lastSyncedAt.set(jobId, Date.now());
        return;
      }
    } catch {
      lastSyncedAt.set(jobId, Date.now());
      return;
    }
  }

  const entries = parseRunFile(filePath, latestTs);
  if (entries.length > 0) {
    // Deduplicate by ts
    const existing = latestTs
      ? new Set(
          (await CronRun.find({
            job_id: jobId,
            ts: { $gte: latestTs },
          }).select('ts').lean()).map((d: any) => d.ts)
        )
      : new Set<number>();

    const toInsert = entries
      .filter(r => !existing.has(r.ts))
      .map(r => ({
        job_id: jobId,
        ts: r.ts,
        status: r.status || null,
        error: r.error || null,
        summary: r.summary?.substring(0, 200) || null,
        run_at_ms: r.runAtMs || null,
        duration_ms: r.durationMs || null,
        session_id: r.sessionId || null,
        session_key: r.sessionKey || null,
      }));

    if (toInsert.length > 0) {
      await CronRun.insertMany(toInsert, { ordered: false }).catch(() => {});
    }
  }

  lastSyncedAt.set(jobId, Date.now());
}

export async function GET(request: Request) {
  try {
    await connectDb();

    const url = new URL(request.url);
    const includeRuns = url.searchParams.get('runs') !== 'false';
    const runLimit = Math.min(parseInt(url.searchParams.get('runLimit') || '20'), 100);
    const forceSync = url.searchParams.get('sync') === 'force';

    const raw = JSON.parse(fs.readFileSync(CRON_PATH, 'utf-8'));
    const jobList: any[] = raw.jobs || [];

    // Sync all jobs in parallel
    await Promise.all(jobList.map(job => syncJob(job.id, forceSync)));

    // Build response from DB
    const jobs = await Promise.all(
      jobList.map(async (job) => {
        const runs = includeRuns
          ? await CronRun.find({ job_id: job.id })
              .sort({ ts: -1 })
              .limit(runLimit)
              .lean()
          : [];

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
          runs: (runs as any[]).map(r => ({
            ts: r.ts,
            status: r.status,
            error: r.error,
            summary: r.summary,
            runAt: r.run_at_ms ? new Date(r.run_at_ms).toISOString() : undefined,
            durationMs: r.duration_ms,
            sessionId: r.session_id,
          })),
          totalRuns: (runs as any[]).length,
        };
      })
    );

    // Build timeline from DB runs
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
