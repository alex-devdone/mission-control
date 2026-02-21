'use client';

/**
 * Badge component for showing count next to nav tabs
 * Shows circular badge with count, hides if count is 0
 */
export function TabBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-red-500 rounded-full">
      {count > 99 ? '99+' : count}
    </span>
  );
}
