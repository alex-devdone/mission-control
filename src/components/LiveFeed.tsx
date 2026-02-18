'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, Clock, X, Radio, Zap } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Event } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

interface LiveSessionInfo {
  key: string;
  kind: string;
  channel: string;
  updatedAt: number;
  model: string;
  totalTokens: number;
  agentId?: string;
  agentName?: string;
}

function useOpenClawActivity(pollInterval = 15000) {
  const [sessions, setSessions] = useState<LiveSessionInfo[]>([]);

  const fetchSessions = useCallback(async () => {
    try {
      const [sessRes, agentsRes] = await Promise.all([
        fetch('/api/openclaw/sessions-live'),
        fetch('/api/openclaw/agents-full'),
      ]);
      if (!sessRes.ok) return;
      const sessData = await sessRes.json();
      const agentsData = agentsRes.ok ? await agentsRes.json() : { agents: [] };

      const agentMap = new Map<string, string>();
      for (const a of agentsData.agents || []) {
        agentMap.set(a.id, a.name);
      }

      // Only show sessions updated in last 5 min
      const now = Date.now();
      const recent = (sessData.sessions || [])
        .filter((s: LiveSessionInfo) => now - s.updatedAt < 300000)
        .map((s: LiveSessionInfo) => {
          const agentId = s.key.split(':')[1] || '';
          return { ...s, agentId, agentName: agentMap.get(agentId) || agentId };
        })
        .slice(0, 20);

      setSessions(recent);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, pollInterval);
    return () => clearInterval(interval);
  }, [fetchSessions, pollInterval]);

  return sessions;
}

function describeSession(s: LiveSessionInfo): string {
  const name = s.agentName || s.agentId || 'Unknown';
  if (s.key.includes(':main')) return `${name} active in main session`;
  if (s.kind === 'subagent' || s.key.includes(':subagent:')) return `${name} running sub-agent task`;
  if (s.key.includes(':isolated:') || s.key.includes(':cron:')) return `${name} running cron job`;
  if (s.channel && s.channel !== 'unknown') return `${name} responding in ${s.channel}`;
  return `${name} active (${s.model || 'unknown model'})`;
}

type FeedFilter = 'all' | 'tasks' | 'agents' | 'limits';

interface LiveFeedProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function LiveFeed({ isMobileOpen, onMobileClose }: LiveFeedProps) {
  const { events } = useMissionControl();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [collapsed, setCollapsed] = useState(true);
  const liveSessions = useOpenClawActivity();

  const filteredEvents = events.filter((event) => {
    if (filter === 'all') return true;
    if (filter === 'tasks')
      return ['task_created', 'task_assigned', 'task_status_changed', 'task_completed'].includes(
        event.type
      );
    if (filter === 'agents')
      return ['agent_joined', 'agent_status_changed', 'message_sent'].includes(event.type);
    if (filter === 'limits')
      return event.type === 'limit_change';
    return true;
  });

  // Collapsed strip for desktop
  const collapsedStrip = (
    <aside
      onClick={() => setCollapsed(false)}
      className="hidden md:flex bg-mc-bg-secondary border-l border-mc-border flex-col items-center py-3 px-1 h-full cursor-pointer hover:bg-mc-bg-tertiary transition-colors w-10"
    >
      <Radio className="w-4 h-4 text-mc-text-secondary mb-2" />
      <span className="text-[10px] text-mc-text-secondary uppercase tracking-widest" style={{ writingMode: 'vertical-rl' }}>
        Live Feed
      </span>
    </aside>
  );

  const feedContent = (
    <aside className={`bg-mc-bg-secondary border-l border-mc-border flex flex-col h-full ${
      isMobileOpen !== undefined ? 'w-full' : 'w-80 max-w-[25%] shrink-0'
    }`}>
      {/* Header */}
      <div className="p-3 border-b border-mc-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
            <span className="text-sm font-medium uppercase tracking-wider">Live Feed</span>
          </div>
          <div className="flex items-center gap-1">
            {onMobileClose && (
              <button onClick={onMobileClose} className="p-1 hover:bg-mc-bg-tertiary rounded md:hidden">
                <X className="w-5 h-5 text-mc-text-secondary" />
              </button>
            )}
            <button onClick={() => setCollapsed(true)} className="hidden md:block p-1 hover:bg-mc-bg-tertiary rounded" title="Collapse panel">
              <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1">
          {(['all', 'tasks', 'agents', 'limits'] as FeedFilter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 text-xs rounded uppercase ${
                filter === tab
                  ? 'bg-mc-accent text-mc-bg font-medium'
                  : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Live OpenClaw Activity */}
      {liveSessions.length > 0 && (filter === 'all' || filter === 'agents') && (
        <div className="px-2 pt-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap className="w-3 h-3 text-green-400" />
            <span className="text-[10px] uppercase tracking-wider text-green-400 font-medium">Live Now</span>
            <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 rounded-full">{liveSessions.length}</span>
          </div>
          <div className="space-y-0.5 mb-2">
            {liveSessions.map((s) => (
              <LiveSessionItem key={s.key} session={s} />
            ))}
          </div>
        </div>
      )}

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredEvents.length === 0 && liveSessions.length === 0 ? (
          <div className="text-center py-8 text-mc-text-secondary text-sm">
            No events yet
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventItem key={event.id} event={event} />
          ))
        )}
      </div>
    </aside>
  );

  // Mobile: render as overlay drawer from right
  if (isMobileOpen !== undefined) {
    return (
      <>
        {isMobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onMobileClose}
          />
        )}
        <div
          className={`fixed inset-y-0 right-0 z-50 w-80 transform transition-transform duration-200 ease-in-out md:hidden ${
            isMobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {feedContent}
        </div>
        <div className="hidden md:flex shrink-0 max-w-[25%]">
          {collapsed ? collapsedStrip : feedContent}
        </div>
      </>
    );
  }

  return collapsed ? collapsedStrip : feedContent;
}

function LiveSessionItem({ session: s }: { session: LiveSessionInfo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className="px-2 py-1.5 rounded bg-green-500/5 border border-green-500/10 cursor-pointer hover:bg-green-500/10 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
        <span className="text-xs text-mc-text truncate">{describeSession(s)}</span>
        <span className="text-[9px] text-mc-text-secondary ml-auto flex-shrink-0">
          {formatDistanceToNow(s.updatedAt, { addSuffix: true })}
        </span>
        <ChevronRight className={`w-3 h-3 text-mc-text-secondary transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>
      {expanded && (
        <div className="mt-1.5 ml-3.5 pt-1.5 border-t border-green-500/10 space-y-1">
          {s.model && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-mc-text-secondary">model:</span>
              <span className="text-mc-text">{s.model}</span>
            </div>
          )}
          {s.totalTokens > 0 && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-mc-text-secondary">tokens:</span>
              <span className="text-mc-cyan font-medium">{formatTokens(s.totalTokens)}</span>
            </div>
          )}
          {s.channel && s.channel !== 'unknown' && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-mc-text-secondary">channel:</span>
              <span className="text-mc-text">{s.channel}</span>
            </div>
          )}
          {s.kind && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-mc-text-secondary">kind:</span>
              <span className="text-mc-text">{s.kind}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-mc-text-secondary">session:</span>
            <span className="text-mc-text font-mono text-[10px] truncate">{s.key}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function parseMetadata(metadata?: string): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function MetadataDetails({ meta }: { meta: Record<string, unknown> }) {
  const entries = Object.entries(meta).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-2 text-[11px]">
          <span className="text-mc-text-secondary shrink-0">{key.replace(/_/g, ' ')}:</span>
          <span className="text-mc-text break-all">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function EventItem({ event }: { event: Event }) {
  const [expanded, setExpanded] = useState(false);
  const meta = parseMetadata(event.metadata);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'task_created': return '📋';
      case 'task_assigned': return '👤';
      case 'task_status_changed': return '🔄';
      case 'task_completed': return '✅';
      case 'message_sent': return '💬';
      case 'agent_joined': return '🎉';
      case 'agent_status_changed': return '🔔';
      case 'system': return '⚙️';
      case 'limit_change': return '📊';
      default: return '📌';
    }
  };

  const isTaskEvent = ['task_created', 'task_assigned', 'task_completed'].includes(event.type);
  const isLimitEvent = event.type === 'limit_change';
  const limitDropping = isLimitEvent && meta && typeof meta.new === 'number' && typeof meta.old === 'number' && meta.new < meta.old;
  const isHighlight = event.type === 'task_created' || event.type === 'task_completed';

  const hasDetails = meta || event.agent_id || event.task_id;

  return (
    <div
      onClick={() => hasDetails && setExpanded(!expanded)}
      className={`p-2 rounded border-l-2 animate-slide-in transition-colors ${
        hasDetails ? 'cursor-pointer' : ''
      } ${
        isHighlight
          ? 'bg-mc-bg-tertiary border-mc-accent-pink'
          : expanded
            ? 'bg-mc-bg-tertiary border-mc-accent/50'
            : 'bg-transparent border-transparent hover:bg-mc-bg-tertiary'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm">{getEventIcon(event.type)}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isTaskEvent ? 'text-mc-accent-pink' : isLimitEvent ? (limitDropping ? 'text-red-400' : 'text-green-400') : 'text-mc-text'}`}>
            {event.message}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs text-mc-text-secondary">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
            {hasDetails && (
              <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${expanded ? 'rotate-90' : ''}`} />
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 ml-6 pt-2 border-t border-mc-border/50 space-y-1.5">
          {event.type && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-mc-text-secondary">type:</span>
              <span className="text-mc-accent font-medium">{event.type}</span>
            </div>
          )}
          {event.agent_id && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-mc-text-secondary">agent:</span>
              <span className="text-mc-text">{event.agent?.name || event.agent_id}</span>
            </div>
          )}
          {event.task_id && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-mc-text-secondary">task:</span>
              <span className="text-mc-text font-mono">{event.task?.title || event.task_id}</span>
            </div>
          )}
          {meta && <MetadataDetails meta={meta} />}
        </div>
      )}
    </div>
  );
}
