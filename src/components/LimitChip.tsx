'use client';

import { useModelLimits } from '@/hooks/useModelLimits';

function textColor(v: number) {
  return v >= 70 ? 'text-green-400' : v >= 30 ? 'text-amber-400' : v >= 1 ? 'text-red-400' : 'text-gray-500';
}

export function LimitChip({ model }: { model: string }) {
  const mLimit = useModelLimits(model);
  if (!mLimit) return null;
  return (
    <span className="font-mono text-[11px]">
      <span className={textColor(mLimit.limit_5h)}>{Math.round(mLimit.limit_5h)}</span>
      <span className="text-mc-text-secondary/40">/</span>
      <span className={textColor(mLimit.limit_week)}>{Math.round(mLimit.limit_week)}</span>
    </span>
  );
}
