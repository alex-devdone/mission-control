'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';

const MODEL_COLORS: Record<string, string> = {
  'opus': '#a371f7',
  'sonnet': '#58a6ff',
  'haiku': '#39d353',
  'gpt': '#10b981',
  'gemini': '#d29922',
  'glm': '#f0883e',
  'codex': '#3fb950',
};

const FALLBACK_COLORS = [
  '#f85149', '#db61a2', '#79c0ff', '#d2a8ff', '#f0883e',
];

function getModelColor(model: string, index: number): string {
  const m = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (m.includes(key)) return color;
  }
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function shortModelName(model: string): string {
  if (!model) return 'unknown';
  return model.split('/').pop() || model;
}

export interface TokenDataPoint {
  agent_id: string;
  date: string;
  model: string;
  tokens: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export interface SessionRecord {
  session_id: string;
  agent_id: string;
  model: string;
  total_tokens: number;
  date: string;
  created_at: string;
}

interface TimeBucket {
  key: string;
  label: string;
  tokens: number;
  model: string;
}

function buildTimeBuckets(sessions: SessionRecord[], days: number): TimeBucket[] {
  const now = new Date();
  // For 1-2 days: hourly buckets. For 7 days: daily buckets.
  const hourly = days <= 2;
  const totalSlots = hourly ? days * 24 : days;

  // Generate all slot keys
  const slots: { key: string; label: string }[] = [];
  if (hourly) {
    for (let i = totalSlots - 1; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 3600_000);
      const key = t.toISOString().slice(0, 13); // "2026-02-15T08"
      const label = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:00`;
      slots.push({ key, label });
    }
  } else {
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      slots.push({ key, label: key.slice(5) });
    }
  }

  // Accumulate sessions into slots
  const slotData = new Map<string, { tokens: number; modelTokens: Map<string, number> }>();
  for (const slot of slots) {
    slotData.set(slot.key, { tokens: 0, modelTokens: new Map() });
  }

  for (const s of sessions) {
    const ts = s.created_at || s.date;
    const slotKey = hourly ? ts.slice(0, 13) : ts.slice(0, 10);
    const bucket = slotData.get(slotKey);
    if (!bucket) continue;
    bucket.tokens += s.total_tokens;
    const m = s.model || 'unknown';
    bucket.modelTokens.set(m, (bucket.modelTokens.get(m) || 0) + s.total_tokens);
  }

  return slots.map(slot => {
    const d = slotData.get(slot.key)!;
    let topModel = 'unknown';
    let topTokens = 0;
    d.modelTokens.forEach((t, m) => { if (t > topTokens) { topTokens = t; topModel = m; } });
    return { key: slot.key, label: slot.label, tokens: d.tokens, model: topModel };
  });
}

/** Mini bar chart per agent — time-distributed bars colored by dominant model */
export function MiniTokenChart({ sessions, days = 7 }: { sessions: SessionRecord[]; days?: number }) {
  if (sessions.length === 0) return null;

  const buckets = buildTimeBuckets(sessions, days);
  const max = Math.max(...buckets.map(b => b.tokens));
  const total = buckets.reduce((sum, b) => sum + b.tokens, 0);
  const models = Array.from(new Set(sessions.map(s => s.model || 'unknown')));

  return (
    <div className="mt-2 pt-2 border-t border-mc-border/50 overflow-hidden">
      <div className="flex items-end gap-px" style={{ height: '28px' }}>
        {buckets.map((b, i) => {
          const color = getModelColor(b.model, i);
          return (
            <div
              key={b.key}
              className="flex-1 rounded-t-[1px]"
              style={{
                backgroundColor: color,
                opacity: b.tokens > 0 ? 0.85 : 0.15,
                height: max > 0 ? `${Math.max((b.tokens / max) * 100, b.tokens > 0 ? 8 : 4)}%` : '4%',
              }}
              title={`${b.label}: ${formatTokens(b.tokens)}`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5 overflow-hidden">
          {models.map((m, i) => (
            <div key={m} className="flex items-center gap-0.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: getModelColor(m, i) }} />
              <span className="text-[8px] text-mc-text-secondary font-mono">{shortModelName(m)}</span>
            </div>
          ))}
        </div>
        <span className="text-[9px] text-mc-text-secondary font-mono shrink-0">{formatTokens(total)}</span>
      </div>
    </div>
  );
}

export function TokenUsageChart({ days = 7 }: { days?: number }) {
  const [data, setData] = useState<TokenDataPoint[]>([]);
  const [rawSessions, setRawSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const hourly = days <= 2;

  useEffect(() => {
    if (hourly) {
      // For hourly views, use raw sessions with created_at timestamps
      fetch(`/api/sessions/tokens?days=${days}&raw=1`)
        .then(r => r.json())
        .then(d => {
          if (Array.isArray(d)) setRawSessions(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      fetch(`/api/sessions/tokens?days=${days}`)
        .then(r => r.json())
        .then(d => {
          if (Array.isArray(d)) setData(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [days, hourly]);

  const { models, modelColorMap, maxTokens, stacks } = useMemo(() => {
    const now = new Date();
    const slots: { key: string; label: string }[] = [];

    if (hourly) {
      const totalSlots = days * 24;
      for (let i = totalSlots - 1; i >= 0; i--) {
        const t = new Date(now.getTime() - i * 3600_000);
        const key = t.toISOString().slice(0, 13);
        const label = `${String(t.getHours()).padStart(2, '0')}:00`;
        slots.push({ key, label });
      }
    } else {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        slots.push({ key, label: key.slice(5) });
      }
    }

    // Bucket data into slots by model
    const slotMap = new Map<string, Map<string, number>>();
    for (const slot of slots) slotMap.set(slot.key, new Map());

    const modelSet = new Set<string>();

    if (hourly) {
      // Use raw sessions with created_at for proper hourly bucketing
      for (const s of rawSessions) {
        const ts = s.created_at || s.date;
        const slotKey = ts.slice(0, 13); // "2026-02-17T08"
        const bucket = slotMap.get(slotKey);
        if (!bucket) continue;
        const model = s.model || 'unknown';
        modelSet.add(model);
        bucket.set(model, (bucket.get(model) || 0) + s.total_tokens);
      }
    } else {
      // Use aggregated data for daily view
      for (const d of data) {
        const slotKey = d.date;
        const bucket = slotMap.get(slotKey);
        if (!bucket) continue;
        const model = d.model || 'unknown';
        modelSet.add(model);
        bucket.set(model, (bucket.get(model) || 0) + d.tokens);
      }
    }

    const models = Array.from(modelSet).sort();
    const modelColorMap = new Map<string, string>();
    models.forEach((m, i) => modelColorMap.set(m, getModelColor(m, i)));

    let maxTokens = 0;
    const stacks = slots.map(slot => {
      const mMap = slotMap.get(slot.key)!;
      let total = 0;
      const segments = models.map(model => {
        const tokens = mMap.get(model) || 0;
        total += tokens;
        return { model, tokens };
      });
      if (total > maxTokens) maxTokens = total;
      return { key: slot.key, label: slot.label, segments, total };
    });

    return { models, modelColorMap, maxTokens, stacks };
  }, [data, rawSessions, days, hourly]);

  if (loading) {
    return (
      <div className="bg-mc-bg-secondary rounded-lg border border-mc-border p-4 mb-4">
        <div className="text-mc-text-secondary text-sm">Loading token usage...</div>
      </div>
    );
  }

  if (data.length === 0 && rawSessions.length === 0) {
    return (
      <div className="bg-mc-bg-secondary rounded-lg border border-mc-border p-4 mb-4">
        <div className="flex items-center gap-2 text-mc-text-secondary text-sm">
          <BarChart3 className="w-4 h-4" />
          No token usage data yet. Data will appear after the first polling cycle.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-mc-bg-secondary rounded-lg border border-mc-border p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-mc-accent" />
          <h3 className="text-sm font-medium text-mc-text">Token Usage ({days}d)</h3>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {models.map(model => (
            <div key={model} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: modelColorMap.get(model) }}
              />
              <span className="text-[10px] text-mc-text-secondary font-mono">{shortModelName(model)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className={`flex items-end gap-1 relative ${stacks.length > 7 ? 'mb-4' : ''}`} style={{ height: '120px' }}>
        {stacks.map(({ key, label, segments, total }, idx) => (
          <div
            key={key}
            className="flex-1 flex flex-col justify-end group relative"
            style={{ height: '100%' }}
          >
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
              <div className="bg-mc-bg border border-mc-border rounded px-2 py-1.5 text-[10px] whitespace-nowrap shadow-lg">
                <div className="font-medium text-mc-text mb-1">{label}</div>
                {segments.filter(s => s.tokens > 0).map(s => (
                  <div key={s.model} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: modelColorMap.get(s.model) }} />
                    <span className="text-mc-text-secondary">{shortModelName(s.model)}:</span>
                    <span className="text-mc-text">{formatTokens(s.tokens)}</span>
                  </div>
                ))}
                <div className="border-t border-mc-border mt-1 pt-1 text-mc-text font-medium">
                  Total: {formatTokens(total)}
                </div>
              </div>
            </div>

            {/* Stacked bar or empty placeholder */}
            {total > 0 ? (
              <div
                className="w-full rounded-t-sm overflow-hidden flex flex-col justify-end"
                style={{ height: `${(total / maxTokens) * 100}%` }}
              >
                {segments.filter(s => s.tokens > 0).map(s => (
                  <div
                    key={s.model}
                    style={{
                      backgroundColor: modelColorMap.get(s.model),
                      height: `${(s.tokens / total) * 100}%`,
                      minHeight: '2px',
                    }}
                  />
                ))}
              </div>
            ) : (
              <div
                className="w-full rounded-t-sm bg-mc-text/5"
                style={{ height: '3px' }}
              />
            )}

            {/* Time label — thin out for hourly views */}
            {stacks.length <= 7 ? (
              <div className="text-[9px] text-mc-text-secondary text-center mt-1 truncate">{label}</div>
            ) : idx % 6 === 0 ? (
              <div className="text-[8px] text-mc-text-secondary text-center mt-1 truncate absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap">{label}</div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Y-axis hint */}
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-mc-text-secondary">0</span>
        <span className="text-[9px] text-mc-text-secondary">{formatTokens(maxTokens)}</span>
      </div>
    </div>
  );
}
