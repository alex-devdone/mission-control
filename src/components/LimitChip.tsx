'use client';

import { useModelLimits } from '@/hooks/useModelLimits';

function textColor(v: number) {
  return v >= 70 ? 'text-green-400' : v >= 30 ? 'text-amber-400' : v >= 1 ? 'text-red-400' : 'text-gray-500';
}

export function LimitChip({ model, fallback5h, fallbackWeek }: { model: string; fallback5h?: number; fallbackWeek?: number }) {
  const mLimit = useModelLimits(model);
  const limit5h = mLimit?.limit_5h ?? fallback5h;
  const limitWeek = mLimit?.limit_week ?? fallbackWeek;
  if (limit5h == null && limitWeek == null) return null;
  return (
    <span className="font-mono text-[11px]">
      <span className={textColor(limit5h ?? 100)}>{Math.round(limit5h ?? 100)}</span>
      <span className="text-mc-text-secondary/40">/</span>
      <span className={textColor(limitWeek ?? 100)}>{Math.round(limitWeek ?? 100)}</span>
    </span>
  );
}
