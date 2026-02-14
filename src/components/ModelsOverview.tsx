'use client';

import { useState, useEffect } from 'react';
import { Cpu } from 'lucide-react';
import { LimitChip } from './LimitChip';

interface AgentModel {
  agentId: string;
  name: string;
  primary: string;
}

function ModelBadge({ model, size = 'sm' }: { model: string; size?: 'sm' | 'md' }) {
  const m = model.toLowerCase();
  const colorMap: Record<string, string> = {
    opus: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    sonnet: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    haiku: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    glm: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    codex: 'bg-green-500/20 text-green-400 border-green-500/30',
    gemini: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    gpt: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  };
  const color = Object.entries(colorMap).find(([k]) => m.includes(k))?.[1] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  const short = model.split('/').pop() || model;
  const textSize = size === 'md' ? 'text-xs' : 'text-[10px]';
  return <span className={`${textSize} px-2 py-0.5 rounded-full font-mono border ${color}`}>{short}</span>;
}

export function ModelsOverview() {
  const [data, setData] = useState<{
    agentModels: AgentModel[];
    defaultModel: string;
    defaultFallbacks: string[];
    availableModels: { id: string; alias?: string }[];
  } | null>(null);

  useEffect(() => {
    fetch('/api/openclaw/models')
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return <div className="text-mc-text-secondary py-12 text-center">Loading models...</div>;
  }

  const byModel: Record<string, string[]> = {};
  for (const am of data.agentModels) {
    if (!byModel[am.primary]) byModel[am.primary] = [];
    byModel[am.primary].push(am.name);
  }

  return (
    <div className="space-y-6">
      {/* Default Model */}
      <div className="bg-mc-bg-secondary rounded-lg p-4 border border-mc-border">
        <h3 className="text-sm font-medium text-mc-text mb-2 flex items-center gap-2">
          <Cpu className="w-4 h-4" /> Default Model
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <ModelBadge model={data.defaultModel} size="md" />
          {data.defaultFallbacks.length > 0 && (
            <>
              <span className="text-mc-text-secondary text-xs">&rarr;</span>
              {data.defaultFallbacks.map(f => <ModelBadge key={f} model={f} size="md" />)}
            </>
          )}
        </div>
      </div>

      {/* Model Distribution */}
      <div className="bg-mc-bg-secondary rounded-lg p-4 border border-mc-border">
        <h3 className="text-sm font-medium text-mc-text mb-3">Model Distribution</h3>
        <div className="space-y-4">
          {Object.entries(byModel)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([model, agentNames]) => (
              <div key={model}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ModelBadge model={model} size="md" />
                    <LimitChip model={model} />
                  </div>
                  <span className="text-xs text-mc-text-secondary">
                    {agentNames.length} agent{agentNames.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {agentNames.map(n => (
                    <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-mc-bg-tertiary text-mc-text-secondary">
                      {n}
                    </span>
                  ))}
                </div>
                <div className="mt-1.5 h-1 bg-mc-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-mc-accent/40 rounded-full"
                    style={{ width: `${(agentNames.length / data.agentModels.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Available Models */}
      <div className="bg-mc-bg-secondary rounded-lg p-4 border border-mc-border">
        <h3 className="text-sm font-medium text-mc-text mb-3">Available Models</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.availableModels.map(m => (
            <div key={m.id} className="flex items-center justify-between bg-mc-bg rounded p-2 text-xs">
              <span className="font-mono text-mc-text">{m.id}</span>
              {m.alias && <span className="text-mc-text-secondary">({m.alias})</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
