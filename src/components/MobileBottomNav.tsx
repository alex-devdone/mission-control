'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Package, Zap, Users, Settings } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/', icon: LayoutGrid, label: 'Home' },
  { href: '/workspace/default', icon: Zap, label: 'Tasks' },
  { href: '/apps', icon: Package, label: 'Apps' },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-mc-border bg-mc-bg-secondary/95 backdrop-blur-sm sm:hidden">
      <div className="flex items-center justify-around py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {navItems.map(item => {
          const isActive = item.href === '/' 
            ? pathname === '/' 
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-colors ${
                isActive 
                  ? 'text-violet-400' 
                  : 'text-mc-text-secondary active:text-mc-text'
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
