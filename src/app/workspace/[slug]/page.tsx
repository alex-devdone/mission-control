'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, LayoutGrid, Monitor, Users, Radio } from 'lucide-react';
import { Header } from '@/components/Header';
import { AgentsSidebar } from '@/components/AgentsSidebar';
import { MissionQueue } from '@/components/MissionQueue';
import { LiveFeed } from '@/components/LiveFeed';
import { SSEDebugPanel } from '@/components/SSEDebugPanel';
import { PixelOffice } from '@/components/PixelOffice';
import { useMissionControl } from '@/lib/store';
import { useSSE } from '@/hooks/useSSE';
import { debug } from '@/lib/debug';
import type { Task, Workspace } from '@/lib/types';

export default function WorkspacePage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const {
    setAgents,
    setTasks,
    setEvents,
    setIsOnline,
    setIsLoading,
    isLoading,
  } = useMissionControl();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState<'kanban' | 'pixel'>('kanban');
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);

  // Connect to SSE for real-time updates
  useSSE();

  // Load workspace data
  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch(`/api/workspaces/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setWorkspace(data);
        } else if (res.status === 404) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error('Failed to load workspace:', error);
        setNotFound(true);
        setIsLoading(false);
        return;
      }
    }

    loadWorkspace();
  }, [slug, setIsLoading]);

  // Load workspace-specific data
  useEffect(() => {
    if (!workspace) return;
    
    const workspaceId = workspace.id;

    async function loadData() {
      try {
        debug.api('Loading workspace data...', { workspaceId });
        
        const [agentsRes, tasksRes, eventsRes] = await Promise.all([
          fetch(`/api/agents?workspace_id=${workspaceId}`),
          fetch(`/api/tasks?workspace_id=${workspaceId}`),
          fetch('/api/events'),
        ]);

        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          debug.api('Loaded tasks', { count: tasksData.length });
          setTasks(tasksData);
        }
        if (eventsRes.ok) setEvents(await eventsRes.json());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    async function checkOpenClaw() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const openclawRes = await fetch('/api/openclaw/status', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (openclawRes.ok) {
          const status = await openclawRes.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }

    loadData();
    checkOpenClaw();

    const eventPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/events?limit=20');
        if (res.ok) {
          setEvents(await res.json());
        }
      } catch (error) {
        console.error('Failed to poll events:', error);
      }
    }, 5000);

    const taskPoll = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks?workspace_id=${workspaceId}`);
        if (res.ok) {
          const newTasks: Task[] = await res.json();
          const currentTasks = useMissionControl.getState().tasks;

          const hasChanges = newTasks.length !== currentTasks.length ||
            newTasks.some((t) => {
              const current = currentTasks.find(ct => ct.id === t.id);
              return !current || current.status !== t.status;
            });

          if (hasChanges) {
            debug.api('[FALLBACK] Task changes detected, updating store');
            setTasks(newTasks);
          }
        }
      } catch (error) {
        console.error('Failed to poll tasks:', error);
      }
    }, 10000);

    // Poll agent limits every 5 minutes + once on load
    const pollLimits = async () => {
      try {
        await fetch('/api/agents/limits', { method: 'POST' });
        // Re-fetch agents to get updated limits
        const res = await fetch(`/api/agents?workspace_id=${workspaceId}`);
        if (res.ok) setAgents(await res.json());
      } catch (error) {
        console.error('Failed to poll limits:', error);
      }
    };
    pollLimits();
    const limitsPoll = setInterval(pollLimits, 5 * 60 * 1000);

    const connectionCheck = setInterval(async () => {
      try {
        const res = await fetch('/api/openclaw/status');
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }, 30000);

    return () => {
      clearInterval(eventPoll);
      clearInterval(connectionCheck);
      clearInterval(taskPoll);
      clearInterval(limitsPoll);
    };
  }, [workspace, setAgents, setTasks, setEvents, setIsOnline, setIsLoading]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2">Workspace Not Found</h1>
          <p className="text-mc-text-secondary mb-6">
            The workspace &ldquo;{slug}&rdquo; doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading {slug}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header workspace={workspace} />

      {/* View Switcher + Mobile Toggle Buttons */}
      <div className="h-10 bg-mc-bg-secondary border-b border-mc-border flex items-center justify-between px-2 md:px-4">
        <div className="flex items-center gap-1">
          {/* Mobile: Agents toggle */}
          <button
            onClick={() => setAgentsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary md:hidden"
          >
            <Users className="w-3.5 h-3.5" />
            Agents
          </button>

          <button
            onClick={() => setView('kanban')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              view === 'kanban'
                ? 'bg-mc-accent-cyan/20 text-mc-accent-cyan border border-mc-accent-cyan/40'
                : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Kanban
          </button>
          <button
            onClick={() => setView('pixel')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              view === 'pixel'
                ? 'bg-mc-accent-purple/20 text-mc-accent-purple border border-mc-accent-purple/40'
                : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pixel Office</span>
            <span className="sm:hidden">Pixel</span>
          </button>
        </div>

        {/* Mobile: Feed toggle */}
        <button
          onClick={() => setFeedOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary md:hidden"
        >
          <Radio className="w-3.5 h-3.5" />
          Feed
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <AgentsSidebar
          workspaceId={workspace.id}
          isMobileOpen={agentsOpen}
          onMobileClose={() => setAgentsOpen(false)}
        />
        {view === 'kanban' ? (
          <MissionQueue workspaceId={workspace.id} />
        ) : (
          <PixelOffice workspaceId={workspace.id} />
        )}
        <LiveFeed
          isMobileOpen={feedOpen}
          onMobileClose={() => setFeedOpen(false)}
        />
      </div>

      <SSEDebugPanel />
    </div>
  );
}
