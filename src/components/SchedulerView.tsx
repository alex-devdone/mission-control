'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

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
  prompt?: string;
  channel?: string;
}

interface AgentInfo {
  id: string;
  name: string;
}

export function SchedulerView() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'error' | 'disabled'>('all');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const [cronRes, agentsRes] = await Promise.all([
        fetch('/api/openclaw/cron'),
        fetch('/api/openclaw/agents-full'),
      ]);

      if (cronRes.ok) {
        const data = await cronRes.json();
        setJobs(data.jobs || []);
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

  const toggleAgent = (agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  // Group jobs by agent
  const grouped = new Map<string, CronJob[]>();
  jobs.forEach(job => {
    const key = job.agentId || 'unassigned';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(job);
  });

  const filteredGroups = Array.from(grouped.entries()).filter(([agentId]) => {
    if (filterAgent !== 'all' && agentId !== filterAgent) return false;
    return true;
  }).map(([agentId, agentJobs]) => {
    let filtered = agentJobs;
    if (filterStatus === 'active') filtered = agentJobs.filter(j => j.enabled !== false);
    else if (filterStatus === 'error') filtered = agentJobs.filter(j => j.consecutiveErrors && j.consecutiveErrors > 0);
    else if (filterStatus === 'disabled') filtered = agentJobs.filter(j => j.enabled === false);
    return [agentId, filtered] as const;
  }).filter(([, fj]) => fj.length > 0);

  const totalErrors = jobs.filter(j => j.consecutiveErrors && j.consecutiveErrors > 0).length;
  const totalActive = jobs.filter(j => j.enabled !== false).length;

  const getAgentName = (agentId: string): string => {
    return agents.find(a => a.id === agentId)?.name || agentId;
  };

  const formatSchedule = (job: CronJob): string => {
    if (job.every) return `Every ${job.every}`;
    if (job.at) return `At ${job.at}`;
    if (job.cron) return job.cron;
    return job.schedule || 'Unknown';
  };

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
          <div className="flex items-center gap-3">
            {totalErrors > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                <AlertTriangle className="w-3 h-3" /> {totalErrors} error{totalErrors > 1 ? 's' : ''}
              </span>
            )}
            <span className="text-xs text-green-400">{totalActive} active</span>
            <button onClick={() => { setLoading(true); fetchData(); }} className="p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={filterAgent}
            onChange={e => setFilterAgent(e.target.value)}
            className="bg-mc-bg border border-mc-border rounded px-2 py-1 text-xs"
          >
            <option value="all">All Agents</option>
            {Array.from(grouped.keys()).map(id => (
              <option key={id} value={id}>{getAgentName(id)}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {(['all', 'active', 'error', 'disabled'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2 py-1 text-xs rounded ${filterStatus === s ? 'bg-mc-accent text-mc-bg' : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredGroups.length === 0 ? (
          <div className="text-center py-12 text-mc-text-secondary">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No cron jobs found</p>
          </div>
        ) : filteredGroups.map(([agentId, agentJobs]) => {
          const isExpanded = expandedAgents.has(agentId) || filterAgent !== 'all';
          const errorCount = agentJobs.filter(j => j.consecutiveErrors && j.consecutiveErrors > 0).length;

          return (
            <div key={agentId} className="bg-mc-bg-secondary border border-mc-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleAgent(agentId)}
                className="w-full flex items-center gap-3 p-3 hover:bg-mc-bg-tertiary transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-mc-text-secondary" /> : <ChevronRight className="w-4 h-4 text-mc-text-secondary" />}
                <span className="font-medium text-sm">{getAgentName(agentId)}</span>
                <span className="text-xs text-mc-text-secondary">{agentJobs.length} job{agentJobs.length > 1 ? 's' : ''}</span>
                {errorCount > 0 && (
                  <span className="text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">⚠️ {errorCount}</span>
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-mc-border">
                  {agentJobs.map(job => (
                    <div key={job.id} className={`flex items-center gap-3 px-4 py-2.5 border-b border-mc-border last:border-0 ${job.consecutiveErrors ? 'bg-red-500/5' : ''}`}>
                      <div className="flex-shrink-0">
                        {job.enabled === false ? (
                          <XCircle className="w-4 h-4 text-gray-500" />
                        ) : job.consecutiveErrors ? (
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{job.name || job.id}</div>
                        <div className="text-xs text-mc-text-secondary font-mono">{formatSchedule(job)}</div>
                        {job.prompt && (
                          <div className="text-[10px] text-mc-text-secondary mt-0.5 truncate max-w-[300px]">{job.prompt}</div>
                        )}
                      </div>
                      {job.model && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono bg-gray-500/20 text-gray-400 hidden md:inline">
                          {job.model.split('/').pop()}
                        </span>
                      )}
                      {job.channel && (
                        <span className="text-[10px] text-mc-text-secondary hidden md:inline">
                          {job.channel === 'telegram' ? '📱' : '💬'}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${job.enabled !== false ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {job.enabled !== false ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
