'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { LimitChip } from '@/components/LimitChip';
import type { Agent } from '@/lib/types';
import { TEAM_DEFINITIONS } from '@/lib/teamDefinitions';

// --- Snapshot types ---
interface SnapshotAgent {
  agent_id: string;
  agent_name: string;
  status: string;
  avatar_emoji: string;
  model: string;
  limit_5h: number;
  limit_week: number;
  task_id: string | null;
  task_title: string | null;
}

interface Snapshot {
  time: string;
  agents: SnapshotAgent[];
}

// Convert snapshot agent to Agent-like object for rendering
function toDisplayAgent(sa: SnapshotAgent): Agent {
  return {
    id: sa.agent_id,
    name: sa.agent_name,
    role: '',
    avatar_emoji: sa.avatar_emoji || '🤖',
    status: sa.status as Agent['status'],
    is_master: false,
    workspace_id: '',
    model: sa.model,
    limit_5h: sa.limit_5h,
    limit_week: sa.limit_week,
    created_at: '',
    updated_at: '',
  };
}

// Pixel HP bar (game-style life bar)
function PixelHealthBar({ percentage, weekPercentage }: { percentage: number; weekPercentage?: number | null }) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const color = clamped >= 70 ? '#22c55e' : clamped >= 30 ? '#f59e0b' : clamped >= 1 ? '#ef4444' : '#4b5563';
  const hasWeek = weekPercentage != null;
  const weekClamped = hasWeek ? Math.max(0, Math.min(100, weekPercentage)) : 0;
  const weekColor = hasWeek ? (weekClamped >= 70 ? '#22c55e' : weekClamped >= 30 ? '#f59e0b' : weekClamped >= 1 ? '#ef4444' : '#4b5563') : '';
  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      <div className="flex items-center gap-1">
        <div className="w-6 h-1.5 bg-[#1a1a2e] border border-[#3a3a4a] rounded-sm overflow-hidden">
          <div className="h-full rounded-sm transition-all duration-700" style={{ width: `${clamped}%`, backgroundColor: color }} />
        </div>
        <span className="text-[7px] font-mono" style={{ color }}>{Math.round(clamped)}%</span>
      </div>
      {hasWeek && (
        <div className="flex items-center gap-1">
          <div className="w-6 h-1 bg-[#1a1a2e] border border-[#3a3a4a] rounded-sm overflow-hidden opacity-70">
            <div className="h-full rounded-sm transition-all duration-700" style={{ width: `${weekClamped}%`, backgroundColor: weekColor }} />
          </div>
          <span className="text-[7px] font-mono opacity-70" style={{ color: weekColor }}>{Math.round(weekClamped)}%</span>
        </div>
      )}
    </div>
  );
}

// Pixel art desk + monitor using CSS
function PixelDesk() {
  return (
    <div className="relative w-20 h-14">
      {/* Monitor */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-10 bg-[#2a2a3a] border-2 border-[#4a4a5a] rounded-sm">
        <div className="m-1 h-6 bg-[#1a3a2a] rounded-sm flex items-center justify-center">
          <div className="text-[6px] text-green-400 font-mono animate-pulse">{'>'}_</div>
        </div>
      </div>
      {/* Monitor stand */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#4a4a5a]" />
      {/* Desk surface */}
      <div className="absolute bottom-0 left-0 w-full h-4 bg-[#8B6914] border-t-2 border-[#A07818] rounded-sm" />
    </div>
  );
}

// Pixel art bench
function PixelBench({ width }: { width: number }) {
  return (
    <div className="relative h-8" style={{ width: `${width}px` }}>
      {/* Seat */}
      <div className="absolute top-0 left-0 w-full h-3 bg-[#8B6914] border-t-2 border-[#A07818] rounded-sm" />
      {/* Legs */}
      <div className="absolute bottom-0 left-2 w-2 h-5 bg-[#6B4F12]" />
      <div className="absolute bottom-0 right-2 w-2 h-5 bg-[#6B4F12]" />
    </div>
  );
}

// Pixel character sprite using CSS
function PixelCharacter({ agent, isWorking }: { agent: Agent; isWorking: boolean }) {
  // Deterministic color from agent name
  const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
  const colorIndex = agent.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  const shirtColor = colors[colorIndex];

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Character body */}
      <div className="relative w-10 h-14">
        {/* Head */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-6 bg-[#FDBF60] rounded-sm">
          {/* Eyes */}
          <div className="absolute top-2 left-1 w-1 h-1 bg-[#1a1a2e]" />
          <div className="absolute top-2 right-1 w-1 h-1 bg-[#1a1a2e]" />
          {/* Hair */}
          <div className="absolute -top-1 left-0 w-6 h-2 bg-[#5a3a1a] rounded-t-sm" />
        </div>
        {/* Body/Shirt */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-8 h-5 rounded-sm" style={{ backgroundColor: shirtColor }} />
        {/* Legs */}
        <div className="absolute top-11 left-2 w-2 h-3 bg-[#2a2a3a]" />
        <div className="absolute top-11 right-2 w-2 h-3 bg-[#2a2a3a]" />
      </div>
      {/* Emoji avatar */}
      <span className="text-lg leading-none">{agent.avatar_emoji}</span>
      {/* Name */}
      <span className="text-[10px] text-amber-300 font-mono font-bold tracking-wider uppercase">
        {agent.name}
      </span>
      {/* Model + Limits */}
      {agent.model && agent.model !== 'unknown' && (
        <LimitChip model={agent.model} fallback5h={agent.limit_5h} fallbackWeek={agent.limit_week} />
      )}
    </div>
  );
}

function WorkingAgent({ agent, taskInfo, onTaskClick }: { agent: Agent; taskInfo?: { id: string; title: string; appName?: string }; onTaskClick?: (taskId: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <PixelCharacter agent={agent} isWorking={true} />
      <PixelDesk />
      {taskInfo?.appName && (
        <div className="px-1.5 py-0.5 bg-[#1a2a3a]/80 border border-[#2a4a6a] rounded text-[7px] text-mc-accent font-mono">
          📦 {taskInfo.appName}
        </div>
      )}
      {taskInfo && (
        <button
          onClick={() => onTaskClick?.(taskInfo.id)}
          className="max-w-[120px] mt-1 px-2 py-1 bg-[#1a1a2e]/80 border border-[#3a3a4a] rounded text-[8px] text-mc-text-secondary text-center truncate hover:border-mc-accent hover:text-mc-text transition-colors cursor-pointer"
        >
          {taskInfo.title}
        </button>
      )}
    </div>
  );
}

function IdleAgent({ agent }: { agent: Agent }) {
  return (
    <div className="flex flex-col items-center">
      <PixelCharacter agent={agent} isWorking={false} />
    </div>
  );
}

// Team grouping helper
function getTeam(agent: Agent): string {
  // First: match by name in TEAM_DEFINITIONS.members
  for (const def of TEAM_DEFINITIONS) {
    if (def.members.some(m => m.toLowerCase() === agent.name.toLowerCase())) {
      return def.title;
    }
  }
  // Fallback: match by role
  const role = agent.role.toLowerCase();
  if (role.includes('developer') || role.includes('dev')) return 'Dev Team';
  if (role.includes('qa') || role.includes('design')) return 'QA & Design';
  if (role.includes('lead') || role.includes('research')) return 'Leadership';
  if (role.includes('devops')) return 'Ops';
  return 'Personal Assistants';
}

function getTeamKey(agent: Agent): string {
  // First: match by name in TEAM_DEFINITIONS.members
  for (const def of TEAM_DEFINITIONS) {
    if (def.members.some(m => m.toLowerCase() === agent.name.toLowerCase())) {
      return def.key;
    }
  }
  // Fallback: match by role
  const teamTitle = getTeam(agent);
  const team = TEAM_DEFINITIONS.find((def) => def.title === teamTitle);
  return team?.key ?? 'personal-assistants';
}

function TeamTabs({
  activeTeam,
  onTeamChange,
  agentCounts,
}: {
  activeTeam: string;
  onTeamChange: (team: string) => void;
  agentCounts: Record<string, number>;
}) {
  return (
    <div className="flex overflow-x-auto gap-2 px-4 py-3 touch-pan-x border-b border-mc-border/50">
      <button
        onClick={() => onTeamChange('all')}
        className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
          activeTeam === 'all'
            ? 'bg-mc-accent text-mc-bg'
            : 'bg-mc-bg-secondary text-mc-text-secondary hover:bg-mc-bg-tertiary'
        }`}
      >
        All ({Object.values(agentCounts).reduce((sum, count) => sum + count, 0)})
      </button>
      {TEAM_DEFINITIONS.map((team) => (
        <button
          key={team.key}
          onClick={() => onTeamChange(team.key)}
          className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
            activeTeam === team.key
              ? 'bg-mc-accent text-mc-bg'
              : 'bg-mc-bg-secondary text-mc-text-secondary hover:bg-mc-bg-tertiary'
          }`}
        >
          {team.title} ({agentCounts[team.title] ?? 0})
        </button>
      ))}
    </div>
  );
}

const TEAM_EMOJI: Record<string, string> = {
  'Mission Control': '🎯',
  'Dev Team': '🏗️',
  'QA & Design': '🧪',
  'Leadership': '👑',
  'Ops': '⚙️',
  'Personal Assistants': '💼',
};

// --- Time Travel Timeline ---
function parseSnapshotTime(raw: string): Date {
  // Handle both ISO strings (2026-02-14T12:30:00.123Z) and SQLite datetime (2026-02-14 12:30:00)
  if (raw.includes('T')) return new Date(raw);
  return new Date(raw.replace(' ', 'T') + 'Z');
}

function formatTime(raw: string): string {
  return parseSnapshotTime(raw).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(raw: string): string {
  const d = parseSnapshotTime(raw);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function TimeTravelBar({
  snapshots,
  currentIndex,
  onIndexChange,
  isPlaying,
  onTogglePlay,
}: {
  snapshots: Snapshot[];
  currentIndex: number;
  onIndexChange: (i: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
}) {
  const current = snapshots[currentIndex];
  const isLive = currentIndex === snapshots.length; // past-end = live

  return (
    <div className="bg-[#0d1117] border-t border-[#2a2a3a] px-4 py-3">
      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Controls row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
              disabled={currentIndex <= 0}
              className="p-1 rounded hover:bg-[#2a2a3a] text-mc-text-secondary hover:text-mc-text disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onTogglePlay}
              disabled={snapshots.length === 0}
              className="p-1.5 rounded hover:bg-[#2a2a3a] text-mc-accent-purple hover:text-purple-300 disabled:opacity-30"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onIndexChange(Math.min(snapshots.length, currentIndex + 1))}
              disabled={isLive}
              className="p-1 rounded hover:bg-[#2a2a3a] text-mc-text-secondary hover:text-mc-text disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Slider */}
          <div className="flex-1 relative">
            <input
              type="range"
              min={0}
              max={snapshots.length}
              value={isLive ? snapshots.length : currentIndex}
              onChange={(e) => onIndexChange(parseInt(e.target.value, 10))}
              className="w-full h-1.5 appearance-none bg-[#2a2a3a] rounded-full cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-mc-accent-purple
                [&::-webkit-slider-thumb]:hover:bg-purple-300 [&::-webkit-slider-thumb]:transition-colors"
            />
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-2 min-w-[140px] justify-end">
            {isLive ? (
              <span className="text-xs font-mono text-green-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </span>
            ) : current?.time ? (
              <span className="text-xs font-mono text-mc-accent-purple">
                {formatDate(current.time)} {formatTime(current.time)}
              </span>
            ) : (
              <span className="text-xs font-mono text-mc-text-secondary">No history</span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// --- Office Scene (shared between live and time travel) ---
function OfficeScene({
  workingAgents,
  idleAgents,
  getTaskInfo,
  onTaskClick,
  dimmed,
}: {
  workingAgents: Agent[];
  idleAgents: Agent[];
  getTaskInfo: (agentId: string) => { id: string; title: string; appName?: string } | undefined;
  onTaskClick?: (taskId: string) => void;
  dimmed?: boolean;
}) {
  // Group all agents by team
  const allAgents = [...workingAgents, ...idleAgents];
  const teamMap = new Map<string, { working: Agent[]; idle: Agent[] }>();
  
  allAgents.forEach((agent) => {
    const team = getTeam(agent);
    if (!teamMap.has(team)) {
      teamMap.set(team, { working: [], idle: [] });
    }
    
    const isWorking = workingAgents.some(a => a.id === agent.id);
    if (isWorking) {
      teamMap.get(team)!.working.push(agent);
    } else {
      teamMap.get(team)!.idle.push(agent);
    }
  });

  // Teams in order — derive from TEAM_DEFINITIONS to stay in sync
  const TEAM_ORDER = TEAM_DEFINITIONS.map(d => d.title);
  const teams = TEAM_ORDER.filter(t => teamMap.has(t));

  return (
    <div
      className={`w-full max-w-4xl rounded-xl border border-[#2a2a3a] p-8 transition-opacity duration-300 ${dimmed ? 'opacity-70' : ''}`}
      style={{
        backgroundColor: '#1a1a2e',
        backgroundImage:
          'linear-gradient(45deg, #1e1e32 25%, transparent 25%), linear-gradient(-45deg, #1e1e32 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e1e32 75%), linear-gradient(-45deg, transparent 75%, #1e1e32 75%)',
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
      }}
    >
      {teams.length === 0 ? (
        <div className="text-center py-16 text-[#4a4a5a] font-mono text-xs">
          No agents available
        </div>
      ) : (
        <div>
          {teams.map((teamName, idx) => {
            const teamData = teamMap.get(teamName)!;
            const teamCount = teamData.working.length + teamData.idle.length;
            const benchWidth = Math.max(160, teamData.idle.length * 70);

            return (
              <div key={teamName}>
                {/* Team Header */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-mono text-amber-400/70 uppercase tracking-widest">
                    {TEAM_EMOJI[teamName]} {teamName}
                  </span>
                  <span className="text-[#4a4a5a] font-mono text-xs ml-2">
                    ({teamCount})
                  </span>
                </div>

                {/* Team Content */}
                <div className="mb-6 pl-4">
                  {/* Working agents */}
                  {teamData.working.length > 0 && (
                    <div className="mb-4">
                      <span className="text-[10px] text-amber-300 font-mono opacity-70 uppercase tracking-wider block mb-3">
                        Working
                      </span>
                      <div className="flex flex-wrap gap-8 justify-start">
                        {teamData.working.map((agent) => (
                          <WorkingAgent 
                            key={agent.id} 
                            agent={agent} 
                            taskInfo={getTaskInfo(agent.id)} 
                            onTaskClick={onTaskClick} 
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Idle agents */}
                  {teamData.idle.length > 0 && (
                    <div>
                      <span className="text-[10px] text-amber-300 font-mono opacity-70 uppercase tracking-wider block mb-3">
                        On Break
                      </span>
                      <div className="flex flex-col items-start gap-2">
                        <div className="flex flex-wrap gap-6 justify-start">
                          {teamData.idle.map((agent) => (
                            <IdleAgent key={agent.id} agent={agent} />
                          ))}
                        </div>
                        <PixelBench width={benchWidth} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Divider between teams */}
                {idx < teams.length - 1 && (
                  <div className="border-t border-[#2a2a3a]/50 my-4" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---
interface PixelOfficeProps {
  workspaceId: string;
}

export function PixelOffice({ workspaceId }: PixelOfficeProps) {
  const { agents, tasks, setSelectedTask } = useMissionControl();
  const searchParams = useSearchParams();
  const router = useRouter();
  const teamParam = searchParams.get('team') || 'all';
  const [activeTeam, setActiveTeam] = useState<string>(teamParam);

  // Sync team selection to URL
  const handleTeamChange = useCallback((team: string) => {
    setActiveTeam(team);
    const params = new URLSearchParams(searchParams.toString());
    if (team === 'all') {
      params.delete('team');
    } else {
      params.set('team', team);
    }
    const qs = params.toString();
    router.replace(`${window.location.pathname}${qs ? '?' + qs : ''}`, { scroll: false });
  }, [searchParams, router]);

  // OpenClaw agents (all 16)
  const [openclawAgents, setOpenclawAgents] = useState<{ id: string; name: string; model: { primary: string }; channels: { channel: string }[] }[]>([]);
  const [liveSessions, setLiveSessions] = useState<{ key: string; updatedAt: number }[]>([]);

  // Time travel state
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLive = snapshotIndex >= snapshots.length;

  // Load OpenClaw agents + live sessions
  useEffect(() => {
    const fetchOC = async () => {
      try {
        const [aRes, sRes] = await Promise.all([
          fetch('/api/openclaw/agents-full'),
          fetch('/api/openclaw/sessions-live'),
        ]);
        if (aRes.ok) { const d = await aRes.json(); setOpenclawAgents(d.agents || []); }
        if (sRes.ok) { const d = await sRes.json(); setLiveSessions(d.sessions || []); }
      } catch { /* ignore */ }
    };
    fetchOC();
    const interval = setInterval(fetchOC, 15000);
    return () => clearInterval(interval);
  }, []);

  // Load snapshots on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/agents/snapshots?hours=24');
        if (res.ok && !cancelled) {
          const data: Snapshot[] = await res.json();
          setSnapshots(data);
          setSnapshotIndex(data.length);
        }
      } catch (err) {
        console.error('Failed to load snapshots:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Autoplay
  useEffect(() => {
    if (isPlaying && snapshots.length > 0) {
      playRef.current = setInterval(() => {
        setSnapshotIndex((prev) => {
          if (prev >= snapshots.length) {
            setIsPlaying(false);
            return snapshots.length;
          }
          return prev + 1;
        });
      }, 1500);
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [isPlaying, snapshots.length]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      // If at end, restart from beginning
      if (snapshotIndex >= snapshots.length) {
        setSnapshotIndex(0);
      }
      setIsPlaying(true);
    }
  }, [isPlaying, snapshotIndex, snapshots.length]);

  // Determine what to render
  let displayWorking: Agent[];
  let displayIdle: Agent[];
  let getTaskInfo: (agentId: string) => { id: string; title: string; appName?: string } | undefined;

  if (isLive) {
    // Live mode — merge MC agents with OpenClaw agents
    const mcAgentIds = new Set(agents.map(a => a.id));
    const activeSessions = liveSessions.filter(s => Date.now() - s.updatedAt < 300000);
    const activeAgentIds = new Set(activeSessions.map(s => s.key.split(':')[1]));

    // Create Agent-like objects for OpenClaw agents not already in MC
    const ocOnlyAgents: Agent[] = openclawAgents
      .filter(oa => {
        const id = oa.id || '';
        const legacyAlias = id === id.toLowerCase() && (id.startsWith('mc') || id === 'devops' || id === 'betty99qa');
        return !legacyAlias;
      })
      .filter(oa => !agents.some(a => {
        const ocId = (a as Agent & { openclaw_agent_id?: string }).openclaw_agent_id;
        if (ocId === oa.id) return true;
        const aName = a.name.toLowerCase();
        const oaName = oa.name.toLowerCase();
        const oaId = oa.id.toLowerCase();
        return aName === oaName || aName === oaId || aName.includes(oaId) || oaId.includes(aName);
      }))
      .map(oa => ({
        id: oa.id,
        name: oa.name,
        role: '',
        avatar_emoji: '🤖',
        status: (activeAgentIds.has(oa.id) ? 'working' : 'standby') as Agent['status'],
        is_master: false,
        workspace_id: workspaceId || 'default',
        model: oa.model.primary.split('/').pop() || oa.model.primary,
        limit_5h: 100,
        limit_week: 100,
        created_at: '',
        updated_at: '',
      }));

    // Agents with in_progress tasks should count as working
    const agentsWithInProgressTasks = new Set(
      tasks
        .filter(t => t.status === 'in_progress' && t.assigned_agent_id)
        .map(t => t.assigned_agent_id!)
    );

    // Update MC agents status based on live sessions OR in_progress tasks
    const allAgents = [
      ...agents.map(a => {
        const ocId = (a as Agent & { openclaw_agent_id?: string }).openclaw_agent_id;
        if ((ocId && activeAgentIds.has(ocId)) || agentsWithInProgressTasks.has(a.id)) {
          return { ...a, status: 'working' as Agent['status'] };
        }
        return a;
      }),
      ...ocOnlyAgents,
    ];

    displayWorking = allAgents.filter((a) => a.status === 'working');
    displayIdle = allAgents.filter((a) => a.status !== 'working');
    getTaskInfo = (agentId: string) => {
      // Prioritize in_progress tasks, then fall back to any active task
      const inProgress = tasks.find(
        (t) => t.assigned_agent_id === agentId && t.status === 'in_progress'
      );
      if (inProgress) return { id: inProgress.id, title: inProgress.title, appName: (inProgress as any).app?.name };
      const t = tasks.find(
        (t) => t.assigned_agent_id === agentId && t.status !== 'done' && t.status !== 'review'
      );
      return t ? { id: t.id, title: t.title, appName: (t as any).app?.name } : undefined;
    };
  } else {
    // Time travel mode - use snapshot data
    const snapshot = snapshots[snapshotIndex];
    if (snapshot) {
      const snapshotAgents = snapshot.agents.map(toDisplayAgent);
      displayWorking = snapshotAgents.filter((a) => a.status === 'working');
      displayIdle = snapshotAgents.filter((a) => a.status !== 'working');
      // Build task info lookup from snapshot
      const taskMap = new Map<string, { id: string; title: string }>();
      for (const sa of snapshot.agents) {
        if (sa.task_title && sa.task_id) taskMap.set(sa.agent_id, { id: sa.task_id, title: sa.task_title });
      }
      getTaskInfo = (agentId: string) => taskMap.get(agentId);
    } else {
      displayWorking = [];
      displayIdle = [];
      getTaskInfo = () => undefined;
    }
  }

  // Compute agent counts per team (before filtering)
  const allDisplayAgents = [...displayWorking, ...displayIdle];
  const agentCounts: Record<string, number> = {};
  for (const def of TEAM_DEFINITIONS) {
    agentCounts[def.title] = allDisplayAgents.filter(a => getTeamKey(a) === def.key).length;
  }

  // Filter by active team
  const filterByTeam = (agents: Agent[]) => {
    if (activeTeam === 'all') return agents;
    return agents.filter(a => getTeamKey(a) === activeTeam);
  };
  const filteredWorking = filterByTeam(displayWorking);
  const filteredIdle = filterByTeam(displayIdle);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Team filter tabs */}
      <TeamTabs activeTeam={activeTeam} onTeamChange={handleTeamChange} agentCounts={agentCounts} />

      {/* Office area */}
      <div className="flex-1 flex items-center justify-center p-8 pt-12 overflow-auto relative">
        <OfficeScene
          workingAgents={filteredWorking}
          idleAgents={filteredIdle}
          getTaskInfo={getTaskInfo}
          onTaskClick={(taskId) => {
            const task = tasks.find(t => t.id === taskId);
            if (task) setSelectedTask(task);
          }}
          dimmed={!isLive}
        />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-[#0d1117]/50 flex items-center justify-center">
            <span className="text-mc-accent-purple font-mono text-sm animate-pulse">Loading history...</span>
          </div>
        )}
      </div>

      {/* Time travel bar */}
      <TimeTravelBar
        snapshots={snapshots}
        currentIndex={snapshotIndex}
        onIndexChange={(i) => {
          setSnapshotIndex(i);
          setIsPlaying(false);
        }}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
      />
    </div>
  );
}
