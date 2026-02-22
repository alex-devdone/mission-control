'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Heart, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp,
  Activity, Cpu, Zap, ChevronLeft, ChevronRight, Calendar as CalendarIcon, List,
} from 'lucide-react';

// ── Types ──
interface HeartbeatUsage {
  input: number;
  output: number;
  cacheRead: number;
  totalTokens: number;
  cost?: number;
}

interface HeartbeatRun {
  timestamp: string;
  model: string;
  provider: string;
  summary: string;
  durationMs?: number;
  status: 'ok' | 'error';
  usage: HeartbeatUsage;
}

interface HeartbeatAgent {
  agentId: string;
  name: string;
  heartbeat: { enabled: boolean; every: string; model: string };
  runs: HeartbeatRun[];
}

interface TimelineRun extends HeartbeatRun {
  agentId: string;
  agentName: string;
}

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
  missionlead: '#8b5cf6',
  mcGlmDev: '#3b82f6',
  mcCodexDev: '#22c55e',
  mcQA: '#f97316',
};

function getAgentColor(agentId: string): string {
  return AGENT_COLORS[agentId] || '#6b7280';
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseInterval(every: string): number {
  const match = every.match(/^(\d+)(s|m|h)$/);
  if (!match) return 600_000;
  const val = parseInt(match[1]);
  if (match[2] === 's') return val * 1000;
  if (match[2] === 'm') return val * 60_000;
  return val * 3600_000;
}

// ── Run Card (day view) ──
function HeartbeatRunCard({ run }: { run: TimelineRun }) {
  const [expanded, setExpanded] = useState(false);
  const runDate = new Date(run.timestamp);

  return (
    <div className={`border border-mc-border rounded-lg overflow-hidden transition-all ${run.status === 'error' ? 'border-red-500/30 bg-red-500/5' : 'bg-mc-bg-secondary'}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left px-3 py-2.5 hover:bg-mc-bg-tertiary transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-mc-text-secondary w-12 shrink-0">{formatTime(runDate)}</span>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getAgentColor(run.agentId) }} />
          <span className="text-sm font-medium truncate flex-1">{run.agentName}</span>
          {run.status === 'ok' ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
          <span className="text-[10px] text-mc-text-secondary font-mono">{formatTokens(run.usage.totalTokens)} tok</span>
        </div>
        <div className="flex items-center gap-2 mt-1 ml-14">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary font-mono">
            {run.model.split('/').pop()}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-mc-border px-3 py-2 text-xs space-y-1.5">
          {run.summary && (
            <div className="text-mc-text-secondary leading-relaxed whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {run.summary}
            </div>
          )}
          <div className="flex items-center gap-3 text-[10px] text-mc-text-secondary pt-1">
            <span>Time: {runDate.toLocaleString()}</span>
            <span>In: {formatTokens(run.usage.input)}</span>
            <span>Out: {formatTokens(run.usage.output)}</span>
            {run.usage.cacheRead > 0 && <span>Cache: {formatTokens(run.usage.cacheRead)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Day Column (week view) ──
function DayColumn({ date, runs, isToday }: { date: Date; runs: TimelineRun[]; isToday: boolean }) {
  const dayRuns = runs.filter(r => isSameDay(new Date(r.timestamp), date));

  return (
    <div className={`flex-1 min-w-[140px] border-r border-mc-border last:border-0 ${isToday ? 'bg-mc-pink/5' : ''}`}>
      <div className={`text-center py-2 border-b border-mc-border sticky top-0 bg-mc-bg-secondary z-10 ${isToday ? 'bg-mc-pink/10' : ''}`}>
        <div className="text-[10px] text-mc-text-secondary uppercase">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div className={`text-sm font-semibold ${isToday ? 'text-mc-pink' : ''}`}>{date.getDate()}</div>
        {dayRuns.length > 0 && (
          <div className="text-[9px] text-mc-text-secondary">{dayRuns.length} beat{dayRuns.length !== 1 ? 's' : ''}</div>
        )}
      </div>

      <div className="p-1.5 space-y-1">
        {dayRuns.length === 0 ? (
          <div className="text-center py-4 text-[10px] text-mc-text-secondary opacity-50">&mdash;</div>
        ) : (
          dayRuns.map((run, i) => (
            <div
              key={`${run.agentId}-${run.timestamp}-${i}`}
              className={`px-1.5 py-1 rounded text-[10px] border cursor-default ${
                run.status === 'error' ? 'border-red-500/30 bg-red-500/10' : 'border-mc-border bg-mc-bg-tertiary'
              }`}
              title={`${run.agentName}\n${new Date(run.timestamp).toLocaleTimeString()}\n${run.model.split('/').pop()}\n${formatTokens(run.usage.totalTokens)} tokens\n${run.summary || ''}`}
            >
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getAgentColor(run.agentId) }} />
                <span className="font-mono text-mc-text-secondary">{formatTime(new Date(run.timestamp))}</span>
                {run.status === 'error' ? <XCircle className="w-2.5 h-2.5 text-red-400 ml-auto" /> : <CheckCircle className="w-2.5 h-2.5 text-green-400 ml-auto" />}
              </div>
              <div className="truncate mt-0.5 font-medium">{run.agentName}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Upcoming Heartbeats Panel ──
function UpcomingPanel({ agents }: { agents: HeartbeatAgent[] }) {
  const upcoming = useMemo(() => {
    const now = Date.now();
    return agents
      .filter(a => a.heartbeat.enabled)
      .map(a => {
        const lastRun = a.runs[0];
        const intervalMs = parseInterval(a.heartbeat.every);
        const lastTs = lastRun ? new Date(lastRun.timestamp).getTime() : now;
        const nextTs = lastTs + intervalMs;
        return { ...a, nextDate: new Date(Math.max(nextTs, now)) };
      })
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
  }, [agents]);

  return (
    <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
      <h3 className="text-xs font-semibold text-mc-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Zap className="w-3 h-3" /> Upcoming
      </h3>
      <div className="space-y-1.5">
        {upcoming.map(agent => (
          <div key={agent.agentId} className="flex items-center gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getAgentColor(agent.agentId) }} />
            <span className="font-mono text-mc-text-secondary w-14 shrink-0">
              {isSameDay(agent.nextDate, new Date())
                ? formatTime(agent.nextDate)
                : agent.nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="truncate flex-1">{agent.name}</span>
            <span className="text-[9px] text-mc-text-secondary">{agent.heartbeat.every}</span>
          </div>
        ))}
        {upcoming.length === 0 && <p className="text-[10px] text-mc-text-secondary">No upcoming heartbeats</p>}
      </div>
    </div>
  );
}

// ── Agent Card (list view) ──
function AgentHeartbeatCard({ agent }: { agent: HeartbeatAgent }) {
  const [expanded, setExpanded] = useState(false);
  const lastRun = agent.runs[0];
  const totalTokens = agent.runs.reduce((sum, r) => sum + r.usage.totalTokens, 0);

  return (
    <div className={`border border-mc-border rounded-lg overflow-hidden ${!agent.heartbeat.enabled ? 'opacity-50' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2.5 hover:bg-mc-bg-tertiary transition-colors flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getAgentColor(agent.agentId) }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{agent.name}</div>
          <div className="text-[10px] text-mc-text-secondary font-mono flex items-center gap-2">
            <span>{agent.heartbeat.model.split('/').pop()}</span>
            <span className="text-mc-text-secondary">every {agent.heartbeat.every}</span>
          </div>
        </div>
        {lastRun ? (
          lastRun.status === 'ok'
            ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
            : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        ) : (
          <span className="w-3.5 h-3.5 rounded-full bg-gray-600 shrink-0" />
        )}
        <span className="text-[10px] text-mc-text-secondary whitespace-nowrap">
          {lastRun ? timeAgo(lastRun.timestamp) : 'no runs'}
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${agent.heartbeat.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-500'}`}>
          {agent.heartbeat.enabled ? 'ON' : 'OFF'}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-mc-text-secondary shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-mc-text-secondary shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-mc-border px-3 py-2.5 text-xs space-y-2 bg-mc-bg-secondary">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div><span className="text-mc-text-secondary">Agent:</span> {agent.name}</div>
            <div><span className="text-mc-text-secondary">Model:</span> {agent.heartbeat.model.split('/').pop()}</div>
            <div><span className="text-mc-text-secondary">Interval:</span> {agent.heartbeat.every}</div>
            <div><span className="text-mc-text-secondary">Total tokens:</span> {formatTokens(totalTokens)}</div>
          </div>

          {lastRun?.summary && (
            <div className="text-[10px] text-mc-text-secondary bg-mc-bg p-2 rounded font-mono leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap">
              {lastRun.summary}
            </div>
          )}

          {agent.runs.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-mc-text-secondary uppercase mb-1">Recent Runs ({agent.runs.length})</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {agent.runs.slice(0, 20).map((run, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[10px] px-2 py-1 rounded ${run.status === 'error' ? 'bg-red-500/10' : 'bg-mc-bg'}`}>
                    {run.status === 'ok' ? <CheckCircle className="w-3 h-3 text-green-400 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                    <span className="font-mono text-mc-text-secondary shrink-0">{new Date(run.timestamp).toLocaleString()}</span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary font-mono shrink-0">
                      {run.model.split('/').pop()}
                    </span>
                    <span className="font-mono shrink-0">{formatTokens(run.usage.totalTokens)} tok</span>
                    {run.usage.cacheRead > 0 && (
                      <span className="text-[9px] text-mc-text-secondary shrink-0">({formatTokens(run.usage.cacheRead)} cached)</span>
                    )}
                    <span className="text-mc-text-secondary truncate">{run.summary.substring(0, 60)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agent.runs.length === 0 && (
            <p className="text-[10px] text-mc-text-secondary py-2">No heartbeat runs found in session history.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──
export function HeartbeatView() {
  const [agents, setAgents] = useState<HeartbeatAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState('all');
  const [view, setView] = useState<'day' | 'week' | 'list'>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/heartbeats?runLimit=200');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch (e) {
      console.error('Failed to fetch heartbeat data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filtered = useMemo(() =>
    filterAgent === 'all' ? agents : agents.filter(a => a.agentId === filterAgent),
    [agents, filterAgent]
  );

  // Build flat timeline from all agent runs
  const timeline: TimelineRun[] = useMemo(() => {
    const runs: TimelineRun[] = [];
    for (const a of filtered) {
      for (const r of a.runs) {
        runs.push({ ...r, agentId: a.agentId, agentName: a.name });
      }
    }
    runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return runs;
  }, [filtered]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Day view runs
  const dayRuns = useMemo(() =>
    timeline.filter(r => isSameDay(new Date(r.timestamp), selectedDate)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [timeline, selectedDate]
  );

  // Week view dates
  const weekDays = useMemo(() => getDaysInRange(getWeekStart(selectedDate), 7), [selectedDate]);

  const totalRuns = agents.reduce((sum, a) => sum + a.runs.length, 0);
  const totalErrors = agents.reduce((sum, a) => sum + a.runs.filter(r => r.status === 'error').length, 0);
  const activeAgents = agents.filter(a => a.heartbeat.enabled && a.runs.length > 0).length;
  const totalTokensAll = agents.reduce((sum, a) => sum + a.runs.reduce((s, r) => s + r.usage.totalTokens, 0), 0);

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
          <Heart className="w-8 h-8 text-mc-pink mx-auto mb-2 animate-pulse" />
          <p className="text-mc-text-secondary text-sm">Loading heartbeats...</p>
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
            <Heart className="w-5 h-5 text-mc-pink" />
            <h2 className="font-semibold text-lg">Heartbeats</h2>
            <span className="bg-mc-bg-tertiary text-mc-text-secondary text-xs px-2 py-0.5 rounded">{agents.length} agents</span>
          </div>
          <div className="flex items-center gap-2">
            {totalErrors > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                <XCircle className="w-3 h-3" /> {totalErrors}
              </span>
            )}
            <span className="text-xs text-green-400">{activeAgents} active</span>
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
                onClick={() => setView(v as 'day' | 'week' | 'list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                  view === v ? 'bg-mc-pink text-white' : 'text-mc-text-secondary hover:text-mc-text-primary hover:bg-mc-bg-tertiary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Date navigation (day/week views) */}
          {view !== 'list' && (
            <div className="flex items-center gap-2">
              <button onClick={() => navigateDate(-1)} className="p-1.5 hover:bg-mc-bg-tertiary rounded">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goToToday} className="text-xs px-2 py-1 hover:bg-mc-bg-tertiary rounded text-mc-pink font-medium">
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
            {agents.map(a => (
              <option key={a.agentId} value={a.agentId}>{a.name}</option>
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
                  <p className="text-sm">No heartbeats on {formatDate(selectedDate)}</p>
                  <p className="text-xs mt-1 opacity-60">Try a different date or check the list view</p>
                </div>
              ) : (
                <>
                  <div className="text-xs text-mc-text-secondary mb-3">
                    {dayRuns.length} heartbeat{dayRuns.length !== 1 ? 's' : ''} on {formatDate(selectedDate)}
                    {dayRuns.filter(r => r.status === 'error').length > 0 && (
                      <span className="text-red-400 ml-2">
                        ({dayRuns.filter(r => r.status === 'error').length} errors)
                      </span>
                    )}
                  </div>
                  {dayRuns.map((run, i) => (
                    <HeartbeatRunCard key={`${run.agentId}-${run.timestamp}-${i}`} run={run} />
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
                  runs={timeline}
                  isToday={isSameDay(day, today)}
                />
              ))}
            </div>
          )}

          {/* List View */}
          {view === 'list' && (
            <div className="p-4 space-y-1">
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-mc-text-secondary">
                  <Heart className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No heartbeat agents found</p>
                </div>
              ) : (
                filtered.map(agent => (
                  <AgentHeartbeatCard key={agent.agentId} agent={agent} />
                ))
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="hidden lg:block w-64 border-l border-mc-border p-3 overflow-y-auto bg-mc-bg">
          {/* Upcoming */}
          <UpcomingPanel agents={agents} />

          {/* Stats */}
          <div className="mt-4 bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <h3 className="text-xs font-semibold text-mc-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Stats
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-mc-bg p-2 rounded text-center">
                <div className="text-lg font-bold text-mc-text-primary">{agents.length}</div>
                <div className="text-[9px] text-mc-text-secondary">Agents</div>
              </div>
              <div className="bg-mc-bg p-2 rounded text-center">
                <div className="text-lg font-bold text-green-400">{activeAgents}</div>
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

          {/* Token usage */}
          <div className="mt-4 bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <h3 className="text-xs font-semibold text-mc-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Token Usage
            </h3>
            <div className="text-center bg-mc-bg p-3 rounded mb-2">
              <div className="text-xl font-bold text-mc-accent">{formatTokens(totalTokensAll)}</div>
              <div className="text-[9px] text-mc-text-secondary">Total Tokens</div>
            </div>
            {/* By agent */}
            <div className="text-[9px] text-mc-text-secondary uppercase tracking-wider mt-1 mb-0.5 font-semibold">By Agent</div>
            <div className="space-y-1 mb-2">
              {agents.map(a => {
                const agentTokens = a.runs.reduce((s, r) => s + r.usage.totalTokens, 0);
                if (agentTokens === 0) return null;
                return (
                  <div key={a.agentId} className="flex items-center gap-2 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getAgentColor(a.agentId) }} />
                    <span className="truncate flex-1">{a.name}</span>
                    <span className="font-mono text-mc-text-secondary">{formatTokens(agentTokens)}</span>
                  </div>
                );
              })}
            </div>
            {/* By model */}
            <div className="text-[9px] text-mc-text-secondary uppercase tracking-wider mb-0.5 font-semibold">By Model</div>
            <div className="space-y-1">
              {(() => {
                const modelMap = new Map<string, number>();
                agents.forEach(a => a.runs.forEach(r => {
                  const m = r.model || 'unknown';
                  modelMap.set(m, (modelMap.get(m) || 0) + r.usage.totalTokens);
                }));
                return Array.from(modelMap.entries())
                  .filter(([, t]) => t > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([model, tokens]) => (
                    <div key={model} className="flex items-center gap-2 text-[10px]">
                      <Cpu className="w-3 h-3 text-mc-text-secondary shrink-0" />
                      <span className="truncate flex-1 font-mono">{model.split('/').pop()}</span>
                      <span className="font-mono text-mc-text-secondary">{formatTokens(tokens)}</span>
                    </div>
                  ));
              })()}
            </div>
          </div>

          {/* Agent legend */}
          <div className="mt-4 bg-mc-bg-secondary border border-mc-border rounded-lg p-3">
            <h3 className="text-xs font-semibold text-mc-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Cpu className="w-3 h-3" /> Agents
            </h3>
            <div className="space-y-1">
              {agents.map(a => (
                <button
                  key={a.agentId}
                  onClick={() => setFilterAgent(filterAgent === a.agentId ? 'all' : a.agentId)}
                  className={`w-full flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors ${
                    filterAgent === a.agentId ? 'bg-mc-pink/20 text-mc-pink' : 'hover:bg-mc-bg-tertiary'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getAgentColor(a.agentId) }} />
                  <span className="truncate flex-1 text-left">{a.name}</span>
                  <span className="text-[9px] text-mc-text-secondary">{a.runs.length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
