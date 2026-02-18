'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Server, Cpu, Calendar, Activity } from 'lucide-react';
import type { OpenClawAgentFull, LiveSession, CronJob } from '@/lib/types';
import { LimitChip } from './LimitChip';
import { TokenUsageChart, MiniTokenChart } from './TokenUsageChart';
import type { SessionRecord } from './TokenUsageChart';

function ModelBadge({ model }: { model: string }) {
  const m = model.toLowerCase();
  const colorMap: Record<string, string> = {
    opus: 'bg-indigo-500/20 text-indigo-400',
    sonnet: 'bg-blue-500/20 text-blue-400',
    haiku: 'bg-cyan-500/20 text-cyan-400',
    glm: 'bg-amber-500/20 text-amber-400',
    codex: 'bg-green-500/20 text-green-400',
    gemini: 'bg-emerald-500/20 text-emerald-400',
    gpt: 'bg-teal-500/20 text-teal-400',
  };
  const color = Object.entries(colorMap).find(([k]) => m.includes(k))?.[1] || 'bg-gray-500/20 text-gray-400';
  const short = model.split('/').pop() || model;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${color}`}>{short}</span>;
}

function ChannelBadges({ channels }: { channels: { channel: string; accountId: string; botUsername?: string }[] }) {
  if (!channels.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {channels.map((c, i) => {
        const icon = c.channel === 'telegram' ? '📱' : c.channel === 'discord' ? '💬' : '🔗';
        const label = c.botUsername ? `@${c.botUsername}` : c.accountId;
        return (
          <span key={i} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-mc-bg-tertiary text-mc-text-secondary" title={`${c.channel} (${c.accountId})`}>
            <span>{icon}</span>
            <span className="truncate max-w-[120px]">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

function AgentDetailModal({ agent, cronJobs, sessions, onClose }: {
  agent: OpenClawAgentFull;
  cronJobs: CronJob[];
  sessions: LiveSession[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'info' | 'models' | 'schedulers' | 'activity'>('info');
  const agentJobs = cronJobs.filter(j => j.agentId === agent.id);
  const agentSessions = sessions.filter(s => s.key.includes(agent.id));

  const tabs = [
    { id: 'info' as const, label: 'Info', icon: Server },
    { id: 'models' as const, label: 'Models', icon: Cpu },
    { id: 'schedulers' as const, label: 'Schedulers', icon: Calendar },
    { id: 'activity' as const, label: 'Activity', icon: Activity },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-mc-bg-secondary border border-mc-border rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-mc-border">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <div>
              <h2 className="font-semibold text-mc-text">{agent.name}</h2>
              <p className="text-xs text-mc-text-secondary font-mono">{agent.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-mc-bg-tertiary rounded">
            <X className="w-5 h-5 text-mc-text-secondary" />
          </button>
        </div>

        <div className="flex border-b border-mc-border">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${
                tab === t.id ? 'text-mc-accent border-b-2 border-mc-accent' : 'text-mc-text-secondary hover:text-mc-text'
              }`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {tab === 'info' && (
            <>
              <div>
                <span className="text-mc-text-secondary">Workspace:</span>{' '}
                <span className="font-mono text-xs text-mc-text">{agent.workspace}</span>
              </div>
              <div>
                <span className="text-mc-text-secondary">Channels:</span>
                {agent.channels.length === 0 ? (
                  <span className="text-mc-text-secondary ml-2">None</span>
                ) : (
                  <div className="mt-1 space-y-1">
                    {agent.channels.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span>{c.channel === 'telegram' ? '📱' : '💬'}</span>
                        <span className="text-mc-text">{c.channel}</span>
                        <span className="text-mc-text-secondary font-mono">({c.accountId})</span>
                        {c.botUsername && c.channel === 'telegram' && (
                          <a href={`https://t.me/${c.botUsername}`} target="_blank" rel="noopener noreferrer"
                            className="text-mc-accent hover:underline font-mono"
                            onClick={e => e.stopPropagation()}>
                            @{c.botUsername}
                          </a>
                        )}
                        {c.botUsername && c.channel === 'discord' && (
                          <span className="text-mc-accent font-mono">@{c.botUsername}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {agent.subagents && (
                <div>
                  <span className="text-mc-text-secondary">Can spawn:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {agent.subagents.allowAgents.map(a => (
                      <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary font-mono">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {tab === 'models' && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-mc-text-secondary">Primary:</span>
                <ModelBadge model={agent.model.primary} />
              </div>
              {agent.model.fallbacks && agent.model.fallbacks.length > 0 && (
                <div>
                  <span className="text-mc-text-secondary">Fallbacks:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {agent.model.fallbacks.map(f => <ModelBadge key={f} model={f} />)}
                  </div>
                </div>
              )}
            </>
          )}
          {tab === 'schedulers' && (
            agentJobs.length === 0 ? (
              <p className="text-mc-text-secondary">No scheduled jobs</p>
            ) : (
              <div className="space-y-2">
                {agentJobs.map(j => (
                  <div key={j.id} className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-mc-text text-xs">{j.name || j.id}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        j.enabled
                          ? (j.state?.lastStatus === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400')
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {!j.enabled ? 'disabled' : j.state?.lastStatus || 'ok'}
                      </span>
                    </div>
                    <div className="text-[10px] text-mc-text-secondary font-mono mt-1">
                      {j.schedule.expr || (j.schedule.everyMs ? `every ${Math.round(j.schedule.everyMs / 60000)}min` : j.schedule.at || '?')}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          {tab === 'activity' && (
            agentSessions.length === 0 ? (
              <p className="text-mc-text-secondary">No active sessions</p>
            ) : (
              <div className="space-y-2">
                {agentSessions.map(s => (
                  <div key={s.key} className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-mc-text">{s.key}</span>
                      <span className="text-[10px] text-mc-text-secondary">{s.kind}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-mc-text-secondary">
                      <span>{s.channel}</span>
                      <span>{s.model}</span>
                      <span>{s.totalTokens.toLocaleString()} tokens</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export function ObservatoryAgents() {
  const [agents, setAgents] = useState<OpenClawAgentFull[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<OpenClawAgentFull | null>(null);
  const [sessionRecords, setSessionRecords] = useState<SessionRecord[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/openclaw/agents-full').then(r => r.json()),
      fetch('/api/openclaw/sessions-live').then(r => r.json()).catch(() => ({ sessions: [] })),
      fetch('/api/openclaw/cron').then(r => r.json()).catch(() => ({ jobs: [] })),
      fetch(`/api/sessions/tokens?days=${days}&raw=1`).then(r => r.json()).catch(() => []),
    ]).then(([agentData, sessionData, cronData, rawSessions]) => {
      setAgents(agentData.agents || []);
      setSessions(sessionData.sessions || []);
      setCronJobs(cronData.jobs || []);
      if (Array.isArray(rawSessions)) setSessionRecords(rawSessions);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [days]);

  // Group raw session records by agent_id
  const agentSessionMap = useMemo(() => {
    const map = new Map<string, SessionRecord[]>();
    for (const s of sessionRecords) {
      if (!map.has(s.agent_id)) map.set(s.agent_id, []);
      map.get(s.agent_id)!.push(s);
    }
    return map;
  }, [sessionRecords]);

  const activeAgentIds = new Set(sessions.map(s => {
    const parts = s.key.split(':');
    return parts[1];
  }));

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-mc-text-secondary">Loading agents...</div>;
  }

  const DAY_OPTIONS = [1, 2, 7] as const;

  return (
    <>
      <div className="flex items-center justify-end gap-1 mb-3">
        {DAY_OPTIONS.map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              days === d
                ? 'bg-mc-accent/20 text-mc-accent border border-mc-accent/40'
                : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary border border-transparent'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>
      <TokenUsageChart days={days} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {agents.map(agent => {
          const isActive = activeAgentIds.has(agent.id);
          return (
            <button key={agent.id} onClick={() => setSelectedAgent(agent)}
              className={`text-left bg-mc-bg-secondary rounded-lg p-4 border transition-all hover:bg-mc-bg-tertiary ${
                isActive ? 'border-green-500/50' : 'border-mc-border'
              }`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🤖</span>
                  <div>
                    <div className="font-medium text-sm text-mc-text">{agent.name}</div>
                    <div className="text-[10px] text-mc-text-secondary font-mono">{agent.id}</div>
                  </div>
                </div>
                {isActive && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse mt-1" />}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <ModelBadge model={agent.model.primary} />
                <LimitChip model={agent.model.primary} />
              </div>
              <ChannelBadges channels={agent.channels} />
              <MiniTokenChart sessions={agentSessionMap.get(agent.id) || []} days={days} />
            </button>
          );
        })}
      </div>
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          cronJobs={cronJobs}
          sessions={sessions}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </>
  );
}
