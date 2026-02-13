'use client';

import { useMissionControl } from '@/lib/store';
import type { Agent, Task } from '@/lib/types';

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
    </div>
  );
}

function WorkingAgent({ agent, task }: { agent: Agent; task?: Task }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <PixelCharacter agent={agent} isWorking={true} />
      <PixelDesk />
      {task && (
        <div className="max-w-[120px] mt-1 px-2 py-1 bg-[#1a1a2e]/80 border border-[#3a3a4a] rounded text-[8px] text-mc-text-secondary text-center truncate">
          {task.title}
        </div>
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

interface PixelOfficeProps {
  workspaceId: string;
}

export function PixelOffice({ workspaceId }: PixelOfficeProps) {
  const { agents, tasks } = useMissionControl();

  const workingAgents = agents.filter((a) => a.status === 'working');
  const idleAgents = agents.filter((a) => a.status !== 'working');

  const getAgentTask = (agentId: string): Task | undefined => {
    return tasks.find(
      (t) => t.assigned_agent_id === agentId && t.status !== 'done' && t.status !== 'review'
    );
  };

  const benchWidth = Math.max(160, idleAgents.length * 70);

  return (
    <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
      <div
        className="w-full max-w-4xl rounded-xl border border-[#2a2a3a] p-8"
        style={{
          backgroundColor: '#1a1a2e',
          backgroundImage:
            'linear-gradient(45deg, #1e1e32 25%, transparent 25%), linear-gradient(-45deg, #1e1e32 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e1e32 75%), linear-gradient(-45deg, transparent 75%, #1e1e32 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
        }}
      >
        {/* Working Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-amber-400 font-mono font-bold text-sm uppercase tracking-widest">
              Working
            </span>
            <span className="text-[#4a4a5a] font-mono text-xs ml-2">
              ({workingAgents.length})
            </span>
          </div>

          {workingAgents.length === 0 ? (
            <div className="text-center py-8 text-[#4a4a5a] font-mono text-xs">
              No agents currently working
            </div>
          ) : (
            <div className="flex flex-wrap gap-10 justify-center">
              {workingAgents.map((agent) => (
                <WorkingAgent key={agent.id} agent={agent} task={getAgentTask(agent.id)} />
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-[#2a2a3a] my-6" />

        {/* On Break Section */}
        <div>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-amber-400 font-mono font-bold text-sm uppercase tracking-widest">
              On Break
            </span>
            <span className="text-[#4a4a5a] font-mono text-xs ml-2">
              ({idleAgents.length})
            </span>
          </div>

          {idleAgents.length === 0 ? (
            <div className="text-center py-8 text-[#4a4a5a] font-mono text-xs">
              Everyone&apos;s working!
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-wrap gap-8 justify-center">
                {idleAgents.map((agent) => (
                  <IdleAgent key={agent.id} agent={agent} />
                ))}
              </div>
              <PixelBench width={benchWidth} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
