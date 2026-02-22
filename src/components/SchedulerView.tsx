'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, AlertTriangle, CheckCircle, XCircle, RefreshCw, ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, Timer, Bot, Zap } from 'lucide-react';

// ── Types ──
interface RunEntry {
  ts: number;
  status?: string;
  error?: string;
  summary?: string;
  runAt: string;
  durationMs?: number;
  sessionId?: string;
}

interface CronJob {
  id: string;
  name: string;
  agentId: string;
  schedule: string;
  scheduleRaw?: { kind: string; expr?: string; everyMs?: number; at?: string; tz?: string };
  enabled: boolean;
  model?: string;
  prompt?: string;
  payloadKind?: string;
  channel?: string;
  deliveryTo?: string;
  sessionTarget?: string;
  lastRunAt?: string;
  lastStatus?: string;
  lastDurationMs?: number;
  consecutiveErrors?: number;
  lastError?: string;
  nextRunAt?: string;
  runs: RunEntry[];
  totalRuns: number;
}

interface TimelineEntry {
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
}

interface AgentInfo { id: string; name: string; }

// ── Helpers ──
const AGENT_COLORS: Record<string, string> = {
  betty99bot: '#8b5cf6',
  devops: '#3b82f6',
  betty99coach: '#22c55e',
  betty99events: '#f97316',
  betty99doctor: '#ef4444',
  betty99travels: '#06b6d4',
  betty99shopping: '#eab308',
  betty99budget: '#ec4899',
  bettydevops: '#a855f7',
  missionLead: '#8b5cf6',
};

function getAgentColor(agentId: string): string {
  return AGENT_COLORS[agentId] || '#6b7280';
}

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function getDaysInRange(start: Date, days: number): Date[] {
  const result: Date[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    result.push(d);
  }
  return result;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Status Badge ──
function StatusBadge({ status, errors }: { status?: string; errors?: number }) {
  if (errors && errors > 0) return (
    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
      <AlertTriangle className="w-3 h-3" /> {errors}
    </span>
  );
  if (status === 'ok') return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
  if (status === 'error') return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  return <Clock className="w-3.5 h-3.5 text-gray-500" />;
}

// ── Run Detail Card ──
function RunCard({ run, job, agentName }: { run: TimelineEntry; job?: CronJob; agentName: string }) {
  const [expanded, setExpanded] = useState(false);
  const runDate = new Date(run.runAt);

  return (
    <div
      className={`border border-mc-border rounded-lg overflow-hidden transition-all ${run.status === 'error' ? 'border-red-500/30 bg-red-500/5' : 'bg-mc-bg-secondary'}`}
    >
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left px-3 py-2.5 hover:bg-mc-bg-tertiary transition-colors">
        <div className="flex items-center gap-2">
          {/* Time */}
          <span className="text-xs font-mono text-mc-text-secondary w-12 shrink-0">{formatTime(runDate)}</span>
          {/* Agent color dot */}
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getAgentColor(run.agentId) }} />
          {/* Job name */}
          <span className="text-sm font-medium truncate flex-1">{run.jobName}</span>
          {/* Status */}
          <StatusBadge status={run.status} />
          {/* Duration */}
          <span className="text-[10px] text-mc-text-secondary font-mono">{formatDuration(run.durationMs)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 ml-14">
          <span className="text-[10px] text-mc-text-secondary">{agentName}</span>
          {run.model && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary font-mono">
              {run.model.split('/').pop()}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-mc-border px-3 py-2 text-xs space-y-1.5">
          {run.summary && (
            <div className="text-mc-text-secondary leading-relaxed whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {run.summary}
            </div>
          )}
          {run.error && (
            <div className="text-red-400 font-mono text-[10px] bg-red-500/10 p-2 rounded">
              {run.error}
            </div>
          )}
          <div className="flex items-center gap-3 text-[10px] text-mc-text-secondary pt-1">
            <span>Started: {runDate.toLocaleString()}</span>
            {run.durationMs && <span>Duration: {formatDuration(run.durationMs)}</span>}
            {run.sessionId && <span className="font-mono">{run.sessionId.slice(0, 8)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Day Column (for week view) ──
function DayColumn({ date, runs, jobs, agents, isToday }: {
  date: Date;
  runs: TimelineEntry[];
  jobs: CronJob[];
  agents: AgentInfo[];
  isToday: boolean;
}) {
  const dayRuns = runs.filter(r => isSameDay(new Date(r.runAt), date));
  const getAgentName = (id: string) => agents.find(a => a.id === id)?.name || id;

  // Group by hour
  const hourGroups = new Map<number, TimelineEntry[]>();
  dayRuns.forEach(r => {
    const hour = new Date(r.runAt).getHours();
    if (!hourGroups.has(hour)) hourGroups.set(hour, []);
    hourGroups.get(hour)!.push(r);
  });

  return (
    <div className={`flex-1 min-w-[140px] border-r border-mc-border last:border-0 ${isToday ? 'bg-mc-accent-purple/5' : ''}`}>
      {/* Day header */}
      <div className={`text-center py-2 border-b border-mc-border sticky top-0 bg-mc-bg-secondary z-10 ${isToday ? 'bg-mc-accent-purple/10' : ''}`}>
        <div className="text-[10px] text-mc-text-secondary uppercase">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div className={`text-sm font-semibold ${isToday ? 'text-mc-accent-purple' : ''}`}>{date.getDate()}</div>
        {dayRuns.length > 0 && (
          <div className="text-[9px] text-mc-text-secondary">{dayRuns.length} run{dayRuns.length !== 1 ? 's' : ''}</div>
        )}
      </div>

      {/* Runs */}
      <div className="p-1.5 space-y-1">
        {dayRuns.length === 0 ? (
          <div className="text-center py-4 text-[10px] text-mc-text-secondary opacity-50">—</div>
        ) : (
          dayRuns.map((run, i) => (
            <div
              key={`${run.jobId}-${run.ts}-${i}`}
              className={`px-1.5 py-1 rounded text-[10px] border cursor-default ${
                run.status === 'error' ? 'border-red-500/30 bg-red-500/10' : 'border-mc-border bg-mc-bg-tertiary'
              }`}
              title={`${run.jobName}\n${new Date(run.runAt).toLocaleTimeString()}\n${formatDuration(run.durationMs)}\n${run.summary || ''}`}
            >
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getAgentColor(run.agentId) }} />
                <span className="font-mono text-mc-text-secondary">{formatTime(new Date(run.runAt))}</span>
                {run.status === 'error' ? <XCircle className="w-2.5 h-2.5 text-red-400 ml-auto" /> : <CheckCircle className="w-2.5 h-2.5 text-green-400 ml-auto" />}
              </div>
              <div className="truncate mt-0.5 font-medium">{run.jobName.replace(/-/g, ' ').slice(0, 20)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Upcoming Schedules ──
function UpcomingPanel({ jobs, agents }: { jobs: CronJob[]; agents: AgentInfo[] }) {
  const upcoming = jobs
    .filter(j => j.enabled && j.nextRunAt)
    .map(j => ({ ...j, nextDate: new Date(j.nextRunAt!) }))
    .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
    .slice(0, 8);

  const getAgentName = (id: string) => agents.find(a => a.id === id)?.name || id;

  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
      <h3 className="text-xs font-semibold text-mc-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Zap className="w-3 h-3" /> Upcoming
      </h3>
      <div className="space-y-1.5">
        {upcoming.map(job => (
          <div key={job.id} className="flex items-center gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getAgentColor(job.agentId) }} />
            <span className="font-mono text-mc-text-secondary w-14 shrink-0">
              {isSameDay(job.nextDate, new Date())
                ? formatTime(job.nextDate)
                : job.nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="truncate flex-1">{job.name || job.id}</span>
            <span className="text-[9px] text-mc-text-secondary">{getAgentName(job.agentId).split(/(?=[A-Z])/).pop()}</span>
          </div>
        ))}
        {upcoming.length === 0 && <p className="text-[10px] text-mc-text-secondary">No upcoming jobs</p>}
      </div>
    </div>
  );
}

// ── Job List Panel ──
function JobListPanel({ jobs, agents, filterAgent }: { jobs: CronJob[]; agents: AgentInfo[]; filterAgent: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const getAgentName = (id: string) => agents.find(a => a.id === id)?.name || id;

  const filtered = filterAgent === 'all' ? jobs : jobs.filter(j => j.agentId === filterAgent);
  const sorted = [...filtered].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

  return (
    <div className="space-y-1">
      {sorted.map(job => (
        <div key={job.id} className={`border border-mc-border rounded-lg overflow-hidden ${!job.enabled ? 'opacity-50' : ''}`}>
          <button
            onClick={() => setExpanded(expanded === job.id ? null : job.id)}
            className="w-full text-left px-3 py-2 hover:bg-mc-bg-tertiary transition-colors flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getAgentColor(job.agentId) }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{job.name || job.id}</div>
              <div className="text-[10px] text-mc-text-secondary font-mono">{job.schedule}</div>
            </div>
            <StatusBadge status={job.lastStatus} errors={job.consecutiveErrors} />
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${job.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-500'}`}>
              {job.enabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {expanded === job.id && (
            <div className="border-t border-mc-border px-3 py-2.5 text-xs space-y-2 bg-mc-bg-secondary">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-mc-text-secondary">Agent:</span> {getAgentName(job.agentId)}</div>
                <div><span className="text-mc-text-secondary">Model:</span> {job.model?.split('/').pop() || '—'}</div>
                <div><span className="text-mc-text-secondary">Target:</span> {job.sessionTarget || '—'}</div>
                <div><span className="text-mc-text-secondary">Channel:</span> {job.channel || '—'}</div>
                <div><span className="text-mc-text-secondary">Last run:</span> {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : 'Never'}</div>
                <div><span className="text-mc-text-secondary">Duration:</span> {formatDuration(job.lastDurationMs)}</div>
                <div><span className="text-mc-text-secondary">Next:</span> {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—'}</div>
                <div><span className="text-mc-text-secondary">Runs:</span> {job.totalRuns}</div>
              </div>
              {job.prompt && (
                <div className="text-[10px] text-mc-text-secondary bg-mc-bg p-2 rounded font-mono leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {job.prompt}
                </div>
              )}
              {job.lastError && (
                <div className="text-[10px] text-red-400 bg-red-500/10 p-2 rounded font-mono">
                  {job.lastError}
                </div>
              )}

              {/* Run history */}
              {job.runs.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-mc-text-secondary uppercase mb-1">Recent Runs</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {job.runs.slice(0, 10).map((run, i) => (
                      <div key={i} className={`flex items-center gap-2 text-[10px] px-2 py-1 rounded ${run.status === 'error' ? 'bg-red-500/10' : 'bg-mc-bg'}`}>
                        {run.status === 'ok' ? <CheckCircle className="w-3 h-3 text-green-400 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                        <span className="font-mono text-mc-text-secondary">{new Date(run.runAt).toLocaleString()}</span>
                        <span className="font-mono">{formatDuration(run.durationMs)}</span>
                        {run.error && <span className="text-red-400 truncate">{run.error.slice(0, 50)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──
export function SchedulerView() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'day' | 'week' | 'list'>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filterAgent, setFilterAgent] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const [cronRes, agentsRes] = await Promise.all([
        fetch('/api/openclaw/cron?runLimit=30'),
        fetch('/api/openclaw/agents-full'),
      ]);

      if (cronRes.ok) {
        const data = await cronRes.json();
        setJobs(data.jobs || []);
        setTimeline(data.timeline || []);
      }
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents((data.agents || []).map((a: any) => ({ id: a.id, name: a.name })));
      }
    } catch (e) {
      console.error('Failed to fetch scheduler data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getAgentName = (id: string) => agents.find(a => a.id === id)?.name || id;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Filter timeline by agent
  const filteredTimeline = useMemo(() =>
    filterAgent === 'all' ? timeline : timeline.filter(r => r.agentId === filterAgent),
    [timeline, filterAgent]
  );

  // Day view: runs for selected date
  const dayRuns = useMemo(() =>
    filteredTimeline.filter(r => isSameDay(new Date(r.runAt), selectedDate)).sort((a, b) => b.ts - a.ts),
    [filteredTimeline, selectedDate]
  );

  // Week view dates
  const weekDays = useMemo(() => getDaysInRange(getWeekStart(selectedDate), 7), [selectedDate]);

  // Stats
  const totalErrors = jobs.filter(j => j.consecutiveErrors && j.consecutiveErrors > 0).length;
  const totalActive = jobs.filter(j => j.enabled).length;
  const totalRuns = timeline.length;

  // Navigation
  const navigateDate = (delta: number) => {
    const d = new Date(selectedDate);
    if (view === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    setSelectedDate(d);
  };

  const goToToday = () => setSelectedDate(new Date());

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-8 h-8 text-mc-accent-purple mx-auto mb-2 animate-pulse" />
          <p className="text-mc-text-secondary text-sm">Loading schedulers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-mc-border bg-mc-bg-secondary">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-mc-accent-purple" />
            <h2 className="font-semibold text-lg">Schedulers</h2>
            <span className="bg-mc-bg-tertiary text-mc-text-secondary text-xs px-2 py-0.5 rounded">{jobs.length} jobs</span>
          </div>
          <div className="flex items-center gap-2">
            {totalErrors > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                <AlertTriangle className="w-3 h-3" /> {totalErrors}
              </span>
            )}
            <span className="text-xs text-green-400">{totalActive} active</span>
            <span className="text-[10px] text-mc-text-secondary">{totalRuns} runs</span>
            <button onClick={() => { setLoading(true); fetchData(); }} className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex gap-1 bg-mc-bg rounded-lg p-0.5">
            {([['day', CalendarIcon, 'Day'], ['week', CalendarIcon, 'Week'], ['list', List, 'List']] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => setView(v as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                  view === v ? 'bg-mc-accent-purple text-white' : 'text-mc-text-secondary hover:text-mc-text-primary hover:bg-mc-bg-tertiary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Date navigation (for day/week views) */}
          {view !== 'list' && (
            <div className="flex items-center gap-2">
              <button onClick={() => navigateDate(-1)} className="p-1.5 hover:bg-mc-bg-tertiary rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goToToday} className="text-xs px-2 py-1 hover:bg-mc-bg-tertiary rounded text-mc-accent-purple font-medium">
                Today
              </button>
              <span className="text-sm font-medium min-w-[140px] text-center">
                {view === 'week'
                  ? `${formatDate(weekDays[0])} — ${formatDate(weekDays[6])}`
                  : formatDate(selectedDate)}
              </span>
              <button onClick={() => navigateDate(1)} className="p-1.5 hover:bg-mc-bg-tertiary rounded">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Agent filter */}
          <select
            value={filterAgent}
            onChange={e => setFilterAgent(e.target.value)}
            className="bg-mc-bg border border-mc-border rounded px-2 py-1.5 text-xs"
          >
            <option value="all">All Agents</option>
            {Array.from(new Set(jobs.map(j => j.agentId))).sort().map(id => (
              <option key={id} value={id}>{getAgentName(id)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main area */}
        <div className="flex-1 overflow-y-auto">
          {/* Day View */}
          {view === 'day' && (
            <div className="p-4 space-y-2">
              {dayRuns.length === 0 ? (
                <div className="text-center py-16 text-mc-text-secondary">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No runs on {formatDate(selectedDate)}</p>
                  <p className="text-xs mt-1 opacity-60">Try a different date or check the list view</p>
                </div>
              ) : (
                <>
                  <div className="text-xs text-mc-text-secondary mb-3">
                    {dayRuns.length} run{dayRuns.length !== 1 ? 's' : ''} on {formatDate(selectedDate)}
                    {dayRuns.filter(r => r.status === 'error').length > 0 && (
                      <span className="text-red-400 ml-2">
                        ({dayRuns.filter(r => r.status === 'error').length} errors)
                      </span>
                    )}
                  </div>
                  {dayRuns.map((run, i) => (
                    <RunCard key={`${run.jobId}-${run.ts}-${i}`} run={run} job={jobs.find(j => j.id === run.jobId)} agentName={getAgentName(run.agentId)} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Week View */}
          {view === 'week' && (
            <div className="flex h-full overflow-x-auto">
              {weekDays.map(day => (
                <DayColumn
                  key={day.toISOString()}
                  date={day}
                  runs={filteredTimeline}
                  jobs={jobs}
                  agents={agents}
                  isToday={isSameDay(day, today)}
                />
              ))}
            </div>
          )}

          {/* List View */}
          {view === 'list' && (
            <div className="p-4">
              <JobListPanel jobs={jobs} agents={agents} filterAgent={filterAgent} />
            </div>
          )}
        </div>

        {/* Sidebar: upcoming (hidden on mobile) */}
        <div className="hidden lg:block w-64 border-l border-mc-border p-3 overflow-y-auto bg-mc-bg">
          <UpcomingPanel jobs={jobs} agents={agents} />
          
          {/* Agent legend */}
          <div className="mt-4 bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <h3 className="text-xs font-semibold text-mc-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Bot className="w-3 h-3" /> Agents
            </h3>
            <div className="space-y-1">
              {Array.from(new Set(jobs.map(j => j.agentId))).sort().map(agentId => {
                const agentJobs = jobs.filter(j => j.agentId === agentId);
                const activeCount = agentJobs.filter(j => j.enabled).length;
                return (
                  <button
                    key={agentId}
                    onClick={() => setFilterAgent(filterAgent === agentId ? 'all' : agentId)}
                    className={`w-full flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors ${
                      filterAgent === agentId ? 'bg-mc-accent-purple/20 text-mc-accent-purple' : 'hover:bg-mc-bg-tertiary'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getAgentColor(agentId) }} />
                    <span className="truncate flex-1 text-left">{getAgentName(agentId)}</span>
                    <span className="text-[9px] text-mc-text-secondary">{activeCount}/{agentJobs.length}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <h3 className="text-xs font-semibold text-mc-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Timer className="w-3 h-3" /> Stats
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-mc-bg p-2 rounded text-center">
                <div className="text-lg font-bold text-mc-text-primary">{jobs.length}</div>
                <div className="text-[9px] text-mc-text-secondary">Jobs</div>
              </div>
              <div className="bg-mc-bg p-2 rounded text-center">
                <div className="text-lg font-bold text-green-400">{totalActive}</div>
                <div className="text-[9px] text-mc-text-secondary">Active</div>
              </div>
              <div className="bg-mc-bg p-2 rounded text-center">
                <div className="text-lg font-bold text-mc-text-primary">{totalRuns}</div>
                <div className="text-[9px] text-mc-text-secondary">Total Runs</div>
              </div>
              <div className="bg-mc-bg p-2 rounded text-center">
                <div className="text-lg font-bold text-red-400">{totalErrors}</div>
                <div className="text-[9px] text-mc-text-secondary">Errors</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
