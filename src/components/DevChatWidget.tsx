'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, X, Send, Loader2, RefreshCw } from 'lucide-react';
import type { Agent } from '@/lib/types';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

const DEV_CONTEXT = '[Dev Chat Context] app=mission-control; appPath=/Users/betty/work/mission-control; cwd=/Users/betty/work/mission-control; source=dev-widget';

export function DevChatWidget() {
  const isDev = process.env.NODE_ENV === 'development';
  // Feature flag: allow disabling widget in dev via NEXT_PUBLIC_DEV_WIDGET_ENABLED=false
  const widgetEnabled = process.env.NEXT_PUBLIC_DEV_WIDGET_ENABLED !== 'false';
  const shouldRender = isDev && widgetEnabled;

  // All hooks must be called unconditionally
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const title = useMemo(() => agent ? `Dev Chat · ${agent.name}` : 'Dev Chat · mcCodexDev', [agent]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const resolveAgent = async () => {
    if (agent) return agent;
    setLoadingAgent(true);
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      const agents: Agent[] = await res.json();
      const found = agents.find((a) => {
        const n = (a.name || '').toLowerCase();
        const oc = (a.openclaw_agent_id || '').toLowerCase();
        return n === 'mccodexdev' || oc === 'mccodexdev';
      });
      if (!found) throw new Error('mcCodexDev not found in /api/agents');
      setAgent(found);
      return found;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve mcCodexDev');
      return null;
    } finally {
      setLoadingAgent(false);
    }
  };

  const loadHistory = async () => {
    const a = await resolveAgent();
    if (!a) return;

    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/agents/${a.id}/chat`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load history');
      }
      const data = await res.json();
      setSessionKey(data.sessionKey || null);
      const history: ChatMessage[] = (data.history || [])
        .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg: any) => ({
          role: msg.role,
          content: typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.map((c: any) => c.text || '').join('')
              : JSON.stringify(msg.content),
          timestamp: msg.timestamp,
        }));
      setMessages(history);
      setError(data.sessionKey ? null : 'Agent has no active OpenClaw session');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    // Only load history when widget is enabled and opened
    if (!shouldRender) return;
    if (open) void loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shouldRender]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;

    const a = await resolveAgent();
    if (!a) return;

    const payload = `${DEV_CONTEXT}\n${content}`;
    setInput('');
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content }]);

    try {
      const res = await fetch(`/api/agents/${a.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send message');
      }
      setError(null);
      setTimeout(() => { void loadHistory(); }, 2500);
      setTimeout(() => { void loadHistory(); }, 7000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  // Early return after all hooks - prevents rendering when disabled
  if (!shouldRender) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 sm:bottom-6 right-4 z-50 rounded-full border border-mc-border bg-mc-bg-secondary text-mc-text shadow-lg p-3 hover:bg-mc-bg-tertiary"
          title="Open Dev Chat"
          aria-label="Open Dev Chat"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[70vh] rounded-xl border border-mc-border bg-mc-bg-secondary shadow-2xl flex flex-col">
          <div className="p-3 border-b border-mc-border flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-mc-text">{title}</div>
              <div className="text-[11px] text-mc-text-secondary">dev-only widget</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => void loadHistory()} className="p-1 rounded hover:bg-mc-bg-tertiary" title="Refresh">
                <RefreshCw className="w-4 h-4 text-mc-text-secondary" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-mc-bg-tertiary" title="Close">
                <X className="w-4 h-4 text-mc-text-secondary" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {(loadingAgent || loadingHistory) && (
              <div className="flex items-center justify-center h-full text-mc-text-secondary">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}

            {!loadingAgent && !loadingHistory && messages.length === 0 && (
              <div className="text-xs text-mc-text-secondary">No messages yet. Send a request to mcCodexDev.</div>
            )}

            {!loadingAgent && !loadingHistory && messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-xs whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-mc-accent text-mc-bg' : 'bg-mc-bg border border-mc-border text-mc-text'}`}>
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-lg bg-mc-bg border border-mc-border">
                  <Loader2 className="w-4 h-4 animate-spin text-mc-text-secondary" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="p-3 border-t border-mc-border">
            {error && <div className="mb-2 text-xs text-red-400">{error}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={sessionKey ? 'Message mcCodexDev...' : 'No active session'}
                className="flex-1 bg-mc-bg border border-mc-border rounded px-3 py-2 text-xs focus:outline-none focus:border-mc-accent"
                disabled={sending || !sessionKey}
              />
              <button
                type="submit"
                disabled={!input.trim() || sending || !sessionKey}
                className="px-3 py-2 bg-mc-accent text-mc-bg rounded hover:bg-mc-accent/90 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
