'use client';

import { useState } from 'react';
import { Eye, Users, Calendar, Cpu } from 'lucide-react';
import { ObservatoryAgents } from '@/components/ObservatoryAgents';
import { SchedulerView } from '@/components/SchedulerView';
import { ModelsOverview } from '@/components/ModelsOverview';
import { MobileBottomNav } from '@/components/MobileBottomNav';

type Tab = 'agents' | 'schedulers' | 'models';

export default function ObservatoryPage() {
  const [tab, setTab] = useState<Tab>('agents');

  const tabs = [
    { id: 'agents' as const, label: 'Agents', icon: Users },
    { id: 'schedulers' as const, label: 'Schedulers', icon: Calendar },
    { id: 'models' as const, label: 'Models', icon: Cpu },
  ];

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-mc-accent" />
          <h1 className="text-lg font-semibold">Observatory</h1>
          <span className="text-xs text-mc-text-secondary">OpenClaw Agent Dashboard</span>
        </div>
      </header>

      <div className="border-b border-mc-border bg-mc-bg-secondary px-4">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                tab === t.id
                  ? 'text-mc-accent border-mc-accent'
                  : 'text-mc-text-secondary border-transparent hover:text-mc-text'
              }`}
            >
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="p-4 pb-20 sm:pb-4 max-w-7xl mx-auto">
        {tab === 'agents' && <ObservatoryAgents />}
        {tab === 'schedulers' && <SchedulerView />}
        {tab === 'models' && <ModelsOverview />}
      </main>

      <MobileBottomNav />
    </div>
  );
}
