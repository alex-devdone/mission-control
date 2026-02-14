'use client';

import { useState, useEffect } from 'react';
import { Plus, ChevronRight, Zap, ZapOff, Loader2, X, Users, MessageSquare } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Agent, AgentStatus, OpenClawSession } from '@/lib/types';
import { AgentModal } from './AgentModal';
import { AgentChat } from './AgentChat';
import { HealthBar } from './HealthBar';
// OpenClawAgentsSidebar removed — using inline OpenClawAgentsSection instead

function OpenClawAgentsSection() {
  const { agents: mcAgents } = useMissionControl();
  const [agents, setAgents] = useState<{ id: string; name: string; model: { primary: string }; channels: { channel: string }[] }[]>([]);
  const [activeSessions, setActiveSessions] = useState<{ key: string }[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetch('/api/openclaw/agents-full')
      .then(r => r.json())
      .then(data => setAgents(data.agents || []))
      .catch(() => {});
    fetch('/api/openclaw/sessions-live')
      .then(r => r.json())
      .then(data => setActiveSessions(data.sessions || []))
      .catch(() => {});
  }, []);

  if (agents.length === 0) return null;

  const activeIds = new Set(activeSessions.map(s => s.key.split(':')[1]));

  // Match OpenClaw agents to MC agents for health bar data
  const mcAgentByOcId = new Map(mcAgents.filter(a => a.openclaw_agent_id).map(a => [a.openclaw_agent_id, a]));

  return (
    <div className="border-b border-mc-border mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-1 py-2 text-xs text-mc-text-secondary hover:text-mc-text"
      >
        <span className="uppercase tracking-wider font-medium">OpenClaw Agents</span>
        <span className="bg-mc-bg-tertiary px-1.5 py-0.5 rounded text-[10px]">{agents.length}</span>
      </button>
      {expanded && (
        <div className="pb-2 space-y-0.5">
          {agents.map(agent => {
            const mcAgent = mcAgentByOcId.get(agent.id);
            return (
              <a
                key={agent.id}
                href="/observatory"
                className="flex items-center gap-2 p-1.5 rounded hover:bg-mc-bg-tertiary transition-colors text-xs"
              >
                <div className="relative">
                  <span className="text-sm">🤖</span>
                  {activeIds.has(agent.id) && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 border border-mc-bg-secondary animate-pulse" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-mc-text">{agent.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <ModelBadge model={agent.model.primary} />
                    {agent.channels.some(c => c.channel === 'telegram') && <span className="text-[9px]">📱</span>}
                    {agent.channels.some(c => c.channel === 'discord') && <span className="text-[9px]">💬</span>}
                    {mcAgent && (
                      <HealthBar percentage={mcAgent.limit_5h ?? 100} weekPercentage={mcAgent.limit_week !== 100 ? mcAgent.limit_week : null} size="sm" />
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModelBadge({ model }: { model: string }) {
  const m = model.toLowerCase();
  const colorMap: Record<string, string> = {
    opus: 'bg-indigo-500/20 text-indigo-400',
    sonnet: 'bg-blue-500/20 text-blue-400',
    haiku: 'bg-cyan-500/20 text-cyan-400',
    'glm': 'bg-amber-500/20 text-amber-400',
    codex: 'bg-green-500/20 text-green-400',
  };
  const color = Object.entries(colorMap).find(([k]) => m.includes(k))?.[1] || 'bg-gray-500/20 text-gray-400';
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${color}`}>
      {model}
    </span>
  );
}

type FilterTab = 'all' | 'working' | 'standby';

interface AgentsSidebarProps {
  workspaceId?: string;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AgentsSidebar({ workspaceId, isMobileOpen, onMobileClose }: AgentsSidebarProps) {
  const { agents, selectedAgent, setSelectedAgent, agentOpenClawSessions, setAgentOpenClawSession } = useMissionControl();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [connectingAgentId, setConnectingAgentId] = useState<string | null>(null);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [activeSubAgents, setActiveSubAgents] = useState(0);

  // Load OpenClaw session status for all agents on mount
  useEffect(() => {
    const loadOpenClawSessions = async () => {
      for (const agent of agents) {
        try {
          const res = await fetch(`/api/agents/${agent.id}/openclaw`);
          if (res.ok) {
            const data = await res.json();
            if (data.linked && data.session) {
              setAgentOpenClawSession(agent.id, data.session as OpenClawSession);
            }
          }
        } catch (error) {
          console.error(`Failed to load OpenClaw session for ${agent.name}:`, error);
        }
      }
    };
    if (agents.length > 0) {
      loadOpenClawSessions();
    }
  }, [agents.length]);

  // Load active sub-agent count
  useEffect(() => {
    const loadSubAgentCount = async () => {
      try {
        const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
        if (res.ok) {
          const sessions = await res.json();
          setActiveSubAgents(sessions.length);
        }
      } catch (error) {
        console.error('Failed to load sub-agent count:', error);
      }
    };

    loadSubAgentCount();
    const interval = setInterval(loadSubAgentCount, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleConnectToOpenClaw = async (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation();
    setConnectingAgentId(agent.id);

    try {
      const existingSession = agentOpenClawSessions[agent.id];

      if (existingSession) {
        const res = await fetch(`/api/agents/${agent.id}/openclaw`, { method: 'DELETE' });
        if (res.ok) {
          setAgentOpenClawSession(agent.id, null);
        }
      } else {
        const res = await fetch(`/api/agents/${agent.id}/openclaw`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setAgentOpenClawSession(agent.id, data.session as OpenClawSession);
        } else {
          const error = await res.json();
          console.error('Failed to connect to OpenClaw:', error);
          alert(`Failed to connect: ${error.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('OpenClaw connection error:', error);
    } finally {
      setConnectingAgentId(null);
    }
  };

  const [collapsed, setCollapsed] = useState(true);

  const filteredAgents = agents.filter((agent) => {
    if (filter === 'all') return true;
    return agent.status === filter;
  });

  const getStatusBadge = (status: AgentStatus) => {
    const styles = {
      standby: 'status-standby',
      working: 'status-working',
      offline: 'status-offline',
    };
    return styles[status] || styles.standby;
  };

  const statusDot: Record<string, string> = {
    working: 'bg-green-400',
    standby: 'bg-yellow-400',
    offline: 'bg-gray-500',
  };

  // Collapsed compact sidebar for desktop
  const collapsedStrip = (
    <aside className="hidden md:flex bg-mc-bg-secondary border-r border-mc-border flex-col h-full w-14 shrink-0">
      {/* Header */}
      <button
        onClick={() => setCollapsed(false)}
        className="p-2 border-b border-mc-border flex items-center justify-center hover:bg-mc-bg-tertiary transition-colors"
        title="Expand sidebar"
      >
        <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
      </button>
      {/* Compact agent list */}
      <div className="flex-1 overflow-y-auto py-1 space-y-0.5">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => { setCollapsed(false); setSelectedAgent(agent); setEditingAgent(agent); }}
            className="w-full flex flex-col items-center py-1.5 px-0.5 hover:bg-mc-bg-tertiary rounded transition-colors group relative"
            title={`${agent.name} — ${agent.status}`}
          >
            <div className="relative text-lg">
              {agent.avatar_emoji}
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-mc-bg-secondary ${statusDot[agent.status] || statusDot.standby}`} />
            </div>
            <span className="text-[9px] text-mc-text-secondary truncate w-full text-center leading-tight mt-0.5">
              {agent.name.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );

  const sidebarContent = (
    <aside className={`bg-mc-bg-secondary border-r border-mc-border flex flex-col h-full ${
      isMobileOpen !== undefined ? 'w-full' : 'w-64 max-w-[25%] shrink-0'
    }`}>
      {/* Header */}
      <div className="p-3 border-b border-mc-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
            <span className="text-sm font-medium uppercase tracking-wider">Agents</span>
            <span className="bg-mc-bg-tertiary text-mc-text-secondary text-xs px-2 py-0.5 rounded">
              {agents.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {onMobileClose && (
              <button onClick={onMobileClose} className="p-1 hover:bg-mc-bg-tertiary rounded md:hidden">
                <X className="w-5 h-5 text-mc-text-secondary" />
              </button>
            )}
            <button onClick={() => setCollapsed(true)} className="hidden md:block p-1 hover:bg-mc-bg-tertiary rounded" title="Collapse sidebar">
              <ChevronRight className="w-4 h-4 text-mc-text-secondary rotate-180" />
            </button>
          </div>
        </div>

        {/* Active Sub-Agents Counter */}
        {activeSubAgents > 0 && (
          <div className="mb-3 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-400">●</span>
              <span className="text-mc-text">Active Sub-Agents:</span>
              <span className="font-bold text-green-400">{activeSubAgents}</span>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-1">
          {(['all', 'working', 'standby'] as FilterTab[]).map((tab) => (
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

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* OpenClaw Agents Section (scrollable) */}
        <OpenClawAgentsSection />

        {filteredAgents.map((agent) => {
          const openclawSession = agentOpenClawSessions[agent.id];
          const isConnecting = connectingAgentId === agent.id;

          return (
            <div
              key={agent.id}
              className={`w-full rounded hover:bg-mc-bg-tertiary transition-colors ${
                selectedAgent?.id === agent.id ? 'bg-mc-bg-tertiary' : ''
              }`}
            >
              <button
                onClick={() => {
                  setSelectedAgent(agent);
                  setEditingAgent(agent);
                }}
                className="w-full flex items-center gap-3 p-2 text-left"
              >
                <div className="text-2xl relative">
                  {agent.avatar_emoji}
                  {openclawSession && (
                    <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-mc-bg-secondary" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{agent.name}</span>
                    {!!agent.is_master && (
                      <span className="text-xs text-mc-accent-yellow">★</span>
                    )}
                  </div>
                  <div className="text-xs text-mc-text-secondary truncate">
                    {agent.role}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {agent.model && agent.model !== 'unknown' && (
                      <ModelBadge model={agent.model} />
                    )}
                    <HealthBar percentage={agent.limit_5h ?? 100} weekPercentage={agent.limit_week !== 100 ? agent.limit_week : null} size="sm" />
                  </div>
                </div>

                <span
                  className={`text-xs px-2 py-0.5 rounded uppercase ${getStatusBadge(agent.status)}`}
                >
                  {agent.status}
                </span>
              </button>

              {!!agent.is_master && (
                <div className="px-2 pb-1">
                  <button
                    onClick={(e) => handleConnectToOpenClaw(agent, e)}
                    disabled={isConnecting}
                    className={`w-full flex items-center justify-center gap-2 px-2 py-1 rounded text-xs transition-colors ${
                      openclawSession
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-mc-bg text-mc-text-secondary hover:bg-mc-bg-tertiary hover:text-mc-text'
                    }`}
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : openclawSession ? (
                      <>
                        <Zap className="w-3 h-3" />
                        <span>OpenClaw Connected</span>
                      </>
                    ) : (
                      <>
                        <ZapOff className="w-3 h-3" />
                        <span>Connect to OpenClaw</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Chat button — any agent with an openclaw_agent_id can chat */}
              <div className="px-2 pb-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setChatAgent(agent); }}
                  className="w-full flex items-center justify-center gap-2 px-2 py-1 rounded text-xs bg-mc-accent-cyan/20 text-mc-accent-cyan hover:bg-mc-accent-cyan/30 transition-colors"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>Chat</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Agent Button */}
      <div className="p-3 border-t border-mc-border">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-mc-bg-tertiary hover:bg-mc-border rounded text-sm text-mc-text-secondary hover:text-mc-text transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Agent
        </button>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <AgentModal onClose={() => setShowCreateModal(false)} workspaceId={workspaceId} />
      )}
      {editingAgent && (
        <AgentModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          workspaceId={workspaceId}
        />
      )}
      {chatAgent && (
        <AgentChat agent={chatAgent} onClose={() => setChatAgent(null)} />
      )}
    </aside>
  );

  // Mobile: render as overlay drawer
  if (isMobileOpen !== undefined) {
    return (
      <>
        {/* Backdrop */}
        {isMobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onMobileClose}
          />
        )}
        {/* Drawer */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 ease-in-out md:hidden ${
            isMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </div>
        {/* Desktop: collapsible sidebar */}
        <div className="hidden md:flex shrink-0 max-w-[25%]">
          {collapsed ? collapsedStrip : sidebarContent}
        </div>
      </>
    );
  }

  return collapsed ? collapsedStrip : sidebarContent;
}
