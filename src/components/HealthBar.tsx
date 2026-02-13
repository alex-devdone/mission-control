'use client';

interface HealthBarProps {
  percentage: number;
  weekPercentage?: number | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

function barColor(v: number) {
  return v >= 70 ? 'bg-green-500' : v >= 30 ? 'bg-amber-500' : v >= 1 ? 'bg-red-500' : 'bg-gray-600';
}

function textColor(v: number) {
  return v >= 70 ? 'text-green-400' : v >= 30 ? 'text-amber-400' : v >= 1 ? 'text-red-400' : 'text-gray-500';
}

export function HealthBar({ percentage, weekPercentage, size = 'md', showLabel = true }: HealthBarProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const hasWeek = weekPercentage != null;
  const weekClamped = hasWeek ? Math.max(0, Math.min(100, weekPercentage)) : 0;

  const sizes = {
    sm: { h: 'h-1', w: 'w-8', text: 'text-[9px]' },
    md: { h: 'h-1.5', w: 'w-12', text: 'text-[10px]' },
    lg: { h: 'h-2', w: 'w-16', text: 'text-xs' },
  };
  const s = sizes[size];

  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-col gap-0.5">
        <div className={`${s.h} ${s.w} rounded-full bg-white/10 overflow-hidden`}>
          <div className={`h-full rounded-full ${barColor(clamped)} transition-all duration-700`} style={{ width: `${clamped}%` }} />
        </div>
        {hasWeek && (
          <div className={`${s.h} ${s.w} rounded-full bg-white/10 overflow-hidden`}>
            <div className={`h-full rounded-full ${barColor(weekClamped)} transition-all duration-700 opacity-70`} style={{ width: `${weekClamped}%` }} />
          </div>
        )}
      </div>
      {showLabel && (
        <div className="flex flex-col leading-none">
          <span className={`${s.text} ${textColor(clamped)} font-mono`}>{Math.round(clamped)}%</span>
          {hasWeek && (
            <span className={`${s.text} ${textColor(weekClamped)} font-mono opacity-70`}>{Math.round(weekClamped)}%</span>
          )}
        </div>
      )}
    </div>
  );
}
