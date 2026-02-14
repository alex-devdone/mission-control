'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bot, Clock, Activity, X, RefreshCw } from 'lucide-react';

interface AgentModel {
  primary: string;
  fallbacks: string[];
}

interface AgentChannel {
  channel: string;
  accountId?: string;
}

interface OpenClawAgent {
  id: string;
  name: string;
  workspace: string;
  model: AgentModel;
  channels: AgentChannel[];
  subagents?: { allowAgents?: string[] };
}

interface CronJob {
  id: string;
  name: string;
  agentId: string;
  schedule?: string;
  every?: string;
  at?: string;
  cron?: string;
  enabled: boolean;
  model?: string;
  lastRun?: string;
  lastStatus?: string;
  consecutiveErrors?: number;
  error?: string;
}

interface ActiveSession {
  key: string;
  updatedAt: number;
  age: number;
}

interface AgentHealth {
  agentId: string;
  name: string;
  sessions: { count: number; recent: ActiveSession[] };
  heartbeat: { enabled: boolean; every: string };
}

function ModelBadge({ model }: { model: string }) {
  if (!model || model === 'unknown') return null;
  const m = model.toLowerCase();
  const colorMap: Record<string, string> = {
    opus: 'bg-indigo-500/20 text-indigo-400',
    sonnet: 'bg-blue-500/20 text-blue-400',
    haiku: 'bg-cyan-500/20 text-cyan-400',
    glm: 'bg-amber-500/20 text-amber-400',
    codex: 'bg-green-500/20 text-green-400',
    gpt: 'bg-emerald-500/20 text-emerald-400',
    gemini: 'bg-purple-500/20 text-purple-400',
  };
  const color = Object.entries(colorMap).find(([k]) => m.includes(k))?.[1] || 'bg-gray-500/20 text-gray-400';
  const short = model.split('/').pop() || model;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${color}`}>
      {short}
    </span>
  );
}

function AgentDetailModal({ agent, cronJobs, agentHealth, onClose }: {
  agent: OpenClawAgent;
  cronJobs: CronJob[];
  agentHealth: AgentHealth | undefined;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'info' | 'models' | 'schedulers' | 'activity'>('info');
  const agentCrons = cronJobs.filter(j => j.agentId === agent.id);
  const recentSessions = agentHealth?.sessions?.recent || [];
  const sessionCount = agentHealth?.sessions?.count || 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-mc-bg-secondary border border-mc-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-mc-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="font-semibold">{agent.name}</h3>
              <p className="text-xs text-mc-text-secondary font-mono">{agent.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-mc-bg-tertiary rounded">
            <X className="w-5 h-5 text-mc-text-secondary" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-mc-border">
          {(['info', 'models', 'schedulers', 'activity'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs uppercase tracking-wider ${tab === t ? 'text-mc-accent border-b-2 border-mc-accent' : 'text-mc-text-secondary hover:text-mc-text'}`}
            >
              {t}
              {t === 'schedulers' && agentCrons.length > 0 && (
                <span className="ml-1 text-[10px] bg-mc-bg-tertiary px-1 rounded">{agentCrons.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'info' && (
            <div className="space-y-3">
              <div className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                <div className="text-xs text-mc-text-secondary mb-1">Agent ID</div>
                <div className="font-mono text-sm">{agent.id}</div>
              </div>
              {agent.workspace && (
                <div className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                  <div className="text-xs text-mc-text-secondary mb-1">Workspace</div>
                  <div className="font-mono text-sm truncate">{agent.workspace}</div>
                </div>
              )}
              <div className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                <div className="text-xs text-mc-text-secondary mb-1">Channels</div>
                <div className="flex gap-2 flex-wrap">
                  {agent.channels.length > 0 ? agent.channels.map((ch, i) => (
                    <span key={i} className="text-sm px-2 py-0.5 bg-mc-bg-tertiary rounded">
                      {ch.channel === 'telegram' ? '📱' : ch.channel === 'discord' ? '💬' : '🔌'} {ch.channel}
                      {ch.accountId && ch.accountId !== 'default' && <span className="text-mc-text-secondary text-xs ml-1">({ch.accountId})</span>}
                    </span>
                  )) : <span className="text-mc-text-secondary text-sm">No channel bindings</span>}
                </div>
              </div>
              <div className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                <div className="text-xs text-mc-text-secondary mb-1">Sessions</div>
                <span className="text-sm">{sessionCount} total</span>
              </div>
              {agentHealth?.heartbeat && (
                <div className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                  <div className="text-xs text-mc-text-secondary mb-1">Heartbeat</div>
                  <span className={`text-sm ${agentHealth.heartbeat.enabled ? 'text-green-400' : 'text-mc-text-secondary'}`}>
                    {agentHealth.heartbeat.enabled ? `Every ${agentHealth.heartbeat.every}` : 'Disabled'}
                  </span>
                </div>
              )}
              {agent.subagents?.allowAgents && agent.subagents.allowAgents.length > 0 && (
                <div className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                  <div className="text-xs text-mc-text-secondary mb-1">Can spawn sub-agents</div>
                  <div className="flex flex-wrap gap-1">
                    {agent.subagents.allowAgents.map(a => (
                      <span key={a} className="text-[10px] px-1.5 py-0.5 bg-mc-bg-tertiary rounded font-mono">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'models' && (
            <div className="space-y-3">
              <div className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                <div className="text-xs text-mc-text-secondary mb-1">Primary Model</div>
                <div className="flex items-center gap-2">
                  <ModelBadge model={agent.model.primary} />
                  <span className="font-mono text-sm">{agent.model.primary}</span>
                </div>
              </div>
              {agent.model.fallbacks.length > 0 && (
                <div className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                  <div className="text-xs text-mc-text-secondary mb-1">Fallback Chain</div>
                  <div className="space-y-1">
                    {agent.model.fallbacks.map((m, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-mc-text-secondary">{i + 1}.</span>
                        <ModelBadge model={m} />
                        <span className="font-mono text-xs">{m}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'schedulers' && (
            <div className="space-y-2">
              {agentCrons.length === 0 ? (
                <div className="text-center py-8 text-mc-text-secondary">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No scheduled jobs</p>
                </div>
              ) : agentCrons.map(job => (
                <div key={job.id} className={`bg-mc-bg rounded-lg p-3 border ${job.consecutiveErrors ? 'border-red-500/50' : 'border-mc-border'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{job.name || job.id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${job.enabled !== false ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {job.enabled !== false ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="text-xs text-mc-text-secondary font-mono">
                    {job.every || job.at || job.cron || job.schedule || 'Unknown schedule'}
                  </div>
                  {job.model && <div className="mt-1"><ModelBadge model={job.model} /></div>}
                  {job.consecutiveErrors ? (
                    <div className="text-xs text-red-400 mt-1">⚠️ {job.consecutiveErrors} consecutive error(s)</div>
                  ) : null}
                  {job.error && (
                    <div className="text-xs text-red-400 mt-1 truncate">{job.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-2">
              {recentSessions.length === 0 ? (
                <div className="text-center py-8 text-mc-text-secondary">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recent sessions</p>
                </div>
              ) : recentSessions.map((s, i) => {
                const ageMinutes = Math.round(s.age / 60000);
                const ageStr = ageMinutes < 60 ? `${ageMinutes}m ago` : ageMinutes < 1440 ? `${Math.round(ageMinutes/60)}h ago` : `${Math.round(ageMinutes/1440)}d ago`;
                const isRecent = s.age < 300000; // < 5 min
                const kind = s.key.includes(':subagent:') ? 'subagent' : s.key.includes(':cron:') ? 'cron' : s.key.includes(':main') ? 'main' : 'other';

                return (
                  <div key={i} className="bg-mc-bg rounded-lg p-3 border border-mc-border">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs truncate flex-1">{s.key.split(':').slice(2).join(':') || s.key}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ml-2 ${
                        kind === 'main' ? 'bg-blue-500/20 text-blue-400' :
                        kind === 'subagent' ? 'bg-purple-500/20 text-purple-400' :
                        kind === 'cron' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>{kind}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {isRecent && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                      <span className={`text-xs ${isRecent ? 'text-green-400' : 'text-mc-text-secondary'}`}>{ageStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function OpenClawAgentsSidebar() {
  const [agents, setAgents] = useState<OpenClawAgent[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [agentHealthMap, setAgentHealthMap] = useState<Map<string, AgentHealth>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<OpenClawAgent | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [agentsRes, cronRes, statusRes] = await Promise.all([
        fetch('/api/openclaw/agents-full'),
        fetch('/api/openclaw/cron'),
        fetch('/api/openclaw/status'),
      ]);

      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }
      if (cronRes.ok) {
        const data = await cronRes.json();
        setCronJobs(data.jobs || []);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        // The status endpoint returns health snapshot with per-agent session info
        const healthAgents: AgentHealth[] = data.sessions || [];
        if (Array.isArray(healthAgents)) {
          const map = new Map<string, AgentHealth>();
          // sessions from status are OpenClawSessionInfo objects, not AgentHealth
          // Let's use the health data from agents-full or status
        }
      }
      setError(null);
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Refresh every 30s
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const getAgentStatus = (agent: OpenClawAgent): 'active' | 'idle' => {
    const health = agentHealthMap.get(agent.id);
    if (health?.sessions?.recent?.length) {
      // Has a session updated in last 5 minutes
      if (health.sessions.recent.some(s => s.age < 300000)) return 'active';
    }
    return 'idle';
  };

  const channelIcon = (ch: string) => {
    if (ch === 'telegram') return '📱';
    if (ch === 'discord') return '💬';
    return '🔌';
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-mc-accent-cyan" />
          <span className="text-sm font-medium uppercase tracking-wider">OpenClaw Agents</span>
        </div>
        <div className="text-xs text-mc-text-secondary animate-pulse">Loading agents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-mc-accent-cyan" />
          <span className="text-sm font-medium uppercase tracking-wider">OpenClaw Agents</span>
        </div>
        <div className="text-xs text-red-400">{error}</div>
        <button onClick={() => { setLoading(true); fetchAll(); }} className="text-xs text-mc-accent mt-2 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-2">
      <div className="flex items-center justify-between px-2 mb-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-mc-accent-cyan" />
          <span className="text-xs font-medium uppercase tracking-wider">OpenClaw</span>
          <span className="bg-mc-bg-tertiary text-mc-text-secondary text-[10px] px-1.5 py-0.5 rounded">{agents.length}</span>
        </div>
      </div>

      <div className="space-y-0.5">
        {agents.map(agent => {
          const agentCrons = cronJobs.filter(j => j.agentId === agent.id);
          const errorCrons = agentCrons.filter(j => j.consecutiveErrors && j.consecutiveErrors > 0);

          return (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-mc-bg-tertiary transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium truncate">{agent.name}</span>
                  {agent.channels.map((ch, i) => (
                    <span key={i} className="text-[10px]" title={`${ch.channel}${ch.accountId ? ` (${ch.accountId})` : ''}`}>{channelIcon(ch.channel)}</span>
                  ))}
                  {errorCrons.length > 0 && (
                    <span className="text-[10px] text-red-400">⚠️{errorCrons.length}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <ModelBadge model={agent.model.primary} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          cronJobs={cronJobs}
          agentHealth={agentHealthMap.get(selectedAgent.id)}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
