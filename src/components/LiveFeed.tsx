'use client';

import { useState } from 'react';
import { ChevronRight, Clock, X, Radio } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import type { Event } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

type FeedFilter = 'all' | 'tasks' | 'agents' | 'limits';

interface LiveFeedProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function LiveFeed({ isMobileOpen, onMobileClose }: LiveFeedProps) {
  const { events } = useMissionControl();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [collapsed, setCollapsed] = useState(true);

  const filteredEvents = events.filter((event) => {
    if (filter === 'all') return true;
    if (filter === 'tasks')
      return ['task_created', 'task_assigned', 'task_status_changed', 'task_completed'].includes(
        event.type
      );
    if (filter === 'agents')
      return ['agent_joined', 'agent_status_changed', 'message_sent'].includes(event.type);
    if (filter === 'limits')
      return event.type === 'limit_change';
    return true;
  });

  // Collapsed strip for desktop
  const collapsedStrip = (
    <aside
      onClick={() => setCollapsed(false)}
      className="hidden md:flex bg-mc-bg-secondary border-l border-mc-border flex-col items-center py-3 px-1 h-full cursor-pointer hover:bg-mc-bg-tertiary transition-colors w-10"
    >
      <Radio className="w-4 h-4 text-mc-text-secondary mb-2" />
      <span className="text-[10px] text-mc-text-secondary uppercase tracking-widest" style={{ writingMode: 'vertical-rl' }}>
        Live Feed
      </span>
    </aside>
  );

  const feedContent = (
    <aside className={`bg-mc-bg-secondary border-l border-mc-border flex flex-col h-full ${
      isMobileOpen !== undefined ? 'w-full' : 'w-80 max-w-[25%] shrink-0'
    }`}>
      {/* Header */}
      <div className="p-3 border-b border-mc-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
            <span className="text-sm font-medium uppercase tracking-wider">Live Feed</span>
          </div>
          <div className="flex items-center gap-1">
            {onMobileClose && (
              <button onClick={onMobileClose} className="p-1 hover:bg-mc-bg-tertiary rounded md:hidden">
                <X className="w-5 h-5 text-mc-text-secondary" />
              </button>
            )}
            <button onClick={() => setCollapsed(true)} className="hidden md:block p-1 hover:bg-mc-bg-tertiary rounded" title="Collapse panel">
              <ChevronRight className="w-4 h-4 text-mc-text-secondary" />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1">
          {(['all', 'tasks', 'agents', 'limits'] as FeedFilter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 text-xs rounded uppercase ${
                filter === tab
                  ? 'bg-mc-accent text-mc-bg font-medium'
                  : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-8 text-mc-text-secondary text-sm">
            No events yet
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventItem key={event.id} event={event} />
          ))
        )}
      </div>
    </aside>
  );

  // Mobile: render as overlay drawer from right
  if (isMobileOpen !== undefined) {
    return (
      <>
        {isMobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onMobileClose}
          />
        )}
        <div
          className={`fixed inset-y-0 right-0 z-50 w-80 transform transition-transform duration-200 ease-in-out md:hidden ${
            isMobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {feedContent}
        </div>
        <div className="hidden md:flex shrink-0 max-w-[25%]">
          {collapsed ? collapsedStrip : feedContent}
        </div>
      </>
    );
  }

  return collapsed ? collapsedStrip : feedContent;
}

function EventItem({ event }: { event: Event }) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'task_created': return '📋';
      case 'task_assigned': return '👤';
      case 'task_status_changed': return '🔄';
      case 'task_completed': return '✅';
      case 'message_sent': return '💬';
      case 'agent_joined': return '🎉';
      case 'agent_status_changed': return '🔔';
      case 'system': return '⚙️';
      case 'limit_change': return '📊';
      default: return '📌';
    }
  };

  const isTaskEvent = ['task_created', 'task_assigned', 'task_completed'].includes(event.type);
  const isLimitEvent = event.type === 'limit_change';
  const limitDropping = isLimitEvent && event.metadata && (() => { try { const m = JSON.parse(event.metadata!); return m.new < m.old; } catch { return false; } })();
  const isHighlight = event.type === 'task_created' || event.type === 'task_completed';

  return (
    <div
      className={`p-2 rounded border-l-2 animate-slide-in ${
        isHighlight
          ? 'bg-mc-bg-tertiary border-mc-accent-pink'
          : 'bg-transparent border-transparent hover:bg-mc-bg-tertiary'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm">{getEventIcon(event.type)}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isTaskEvent ? 'text-mc-accent-pink' : isLimitEvent ? (limitDropping ? 'text-red-400' : 'text-green-400') : 'text-mc-text'}`}>
            {event.message}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs text-mc-text-secondary">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  );
}
