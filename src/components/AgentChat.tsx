'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import type { Agent } from '@/lib/types';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

interface AgentChatProps {
  agent: Agent;
  onClose: () => void;
}

export function AgentChat({ agent, onClose }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agent.id}/chat`);
      if (res.ok) {
        const data = await res.json();
        setSessionKey(data.sessionKey);
        const history: ChatMessage[] = (data.history || [])
          .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
          .map((msg: any) => ({
            role: msg.role || 'system',
            content: typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content.map((c: any) => c.text || '').join('')
                : JSON.stringify(msg.content),
            timestamp: msg.timestamp,
          }));
        setMessages(history);
        if (!data.sessionKey) {
          setError('Agent has no active OpenClaw session');
        } else {
          setError(null);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to load chat');
      }
    } catch {
      setError('Failed to connect');
    } finally {
      setLoading(false);
    }
  }, [agent.id]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [loadHistory]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const content = input.trim();
    setInput('');
    setSending(true);

    // Optimistic add
    setMessages((prev) => [...prev, { role: 'user', content }]);

    try {
      const res = await fetch(`/api/agents/${agent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to send message');
      } else {
        setError(null);
        // Poll for response — agent needs time to think
        const pollTimes = [3000, 6000, 10000, 15000, 25000];
        pollTimes.forEach((delay) => {
          const t = setTimeout(loadHistory, delay);
          pollRef.current = t;
        });
      }
    } catch {
      setError('Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-mc-bg-secondary border border-mc-border rounded-xl w-full max-w-lg h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-3 border-b border-mc-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{agent.avatar_emoji}</span>
            <div>
              <span className="font-medium text-sm">{agent.name}</span>
              <span className="text-xs text-mc-text-secondary ml-2">{agent.role}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={loadHistory} className="p-1 hover:bg-mc-bg-tertiary rounded" title="Refresh">
              <RefreshCw className="w-4 h-4 text-mc-text-secondary" />
            </button>
            <button onClick={onClose} className="p-1 hover:bg-mc-bg-tertiary rounded">
              <X className="w-5 h-5 text-mc-text-secondary" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-mc-text-secondary" />
            </div>
          ) : error && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-8 h-8 text-mc-text-secondary mb-2" />
              <p className="text-sm text-mc-text-secondary">{error}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-8 h-8 text-mc-text-secondary mb-2" />
              <p className="text-sm text-mc-text-secondary">No messages yet. Say hello to {agent.name}!</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words ${
                    msg.role === 'user'
                      ? 'bg-mc-accent text-mc-bg'
                      : 'bg-mc-bg border border-mc-border text-mc-text'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-lg bg-mc-bg border border-mc-border">
                <Loader2 className="w-4 h-4 animate-spin text-mc-text-secondary" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-mc-border shrink-0">
          {error && messages.length > 0 && (
            <div className="mb-2 text-xs text-red-400">{error}</div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={sessionKey ? `Message ${agent.name}...` : 'No active session'}
              className="flex-1 bg-mc-bg border border-mc-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mc-accent"
              disabled={sending || !sessionKey}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending || !sessionKey}
              className="px-3 py-2 bg-mc-accent text-mc-bg rounded-lg hover:bg-mc-accent/90 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
