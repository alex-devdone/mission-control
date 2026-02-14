import { useQuery } from '@tanstack/react-query';

interface AgentLimitData {
  _id: string;
  name: string;
  model?: string;
  limit_5h?: number;
  limit_week?: number;
}

type ModelLimits = Record<string, { limit_5h: number; limit_week: number }>;

async function fetchModelLimits(): Promise<ModelLimits> {
  const res = await fetch('/api/agents/limits');
  const data: AgentLimitData[] = await res.json();
  if (!Array.isArray(data)) return {};
  const byModel: ModelLimits = {};
  for (const agent of data) {
    const m = agent.model || 'unknown';
    const l5h = agent.limit_5h ?? 100;
    const lWeek = agent.limit_week ?? 100;
    if (!byModel[m]) {
      byModel[m] = { limit_5h: l5h, limit_week: lWeek };
    } else {
      byModel[m].limit_5h = Math.min(byModel[m].limit_5h, l5h);
      byModel[m].limit_week = Math.min(byModel[m].limit_week, lWeek);
    }
  }
  return byModel;
}

/** Match full model ID (e.g. "anthropic/claude-opus-4-6") to short name (e.g. "opus 4.6") */
function matchModelLimit(fullId: string, byModel: ModelLimits) {
  const lower = fullId.toLowerCase().replace(/[/.]/g, '-');
  return Object.entries(byModel).find(([short]) => {
    const key = short.toLowerCase().replace(/[\s.]/g, '-');
    return lower.includes(key);
  })?.[1] || null;
}

export function useModelLimits(model: string) {
  const { data: limits } = useQuery({
    queryKey: ['model-limits'],
    queryFn: fetchModelLimits,
  });
  if (!limits) return null;
  return matchModelLimit(model, limits);
}
