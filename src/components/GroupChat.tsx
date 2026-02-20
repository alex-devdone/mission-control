'use client';

import { useEffect, useMemo, useState } from 'react';
import { Send, Users, BellRing } from 'lucide-react';
import type { Conversation, Message } from '@/lib/types';

export function GroupChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  const loadConversations = async () => {
    const res = await fetch('/api/conversations?type=group');
    if (!res.ok) return;
    const data: Conversation[] = await res.json();
    setConversations(data);
    if (!activeId && data.length > 0) setActiveId(data[0].id);
  };

  const loadMessages = async (conversationId: string) => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`);
    if (!res.ok) return;
    const data: Message[] = await res.json();
    setMessages(data);
  };

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    const t = setInterval(() => loadMessages(activeId), 5000);
    return () => clearInterval(t);
  }, [activeId]);

  const sendMessage = async () => {
    if (!activeId || !input.trim() || sending) return;
    setSending(true);
    const content = input.trim();
    setInput('');

    const res = await fetch(`/api/conversations/${activeId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, message_type: 'text' }),
    });

    if (res.ok) {
      await loadMessages(activeId);
      await loadConversations();
    }
    setSending(false);
  };

  const pingAgent = async (agentId: string) => {
    if (!activeId) return;
    const res = await fetch(`/api/agents/${agentId}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: activeId, context: activeConversation?.title || 'team chat' }),
    });

    if (res.ok) {
      setNotice('Ping sent.');
      loadMessages(activeId);
      setTimeout(() => setNotice(null), 2500);
    } else {
      const data = await res.json().catch(() => ({}));
      setNotice(data.error || 'Failed to ping agent');
      setTimeout(() => setNotice(null), 3000);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-mc-bg-secondary">
      <aside className="w-64 border-r border-mc-border p-3 overflow-y-auto">
        <div className="text-xs uppercase text-mc-text-secondary mb-2">Team Channels</div>
        <div className="space-y-1">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`w-full text-left px-2 py-2 rounded text-sm transition-colors ${
                activeId === c.id ? 'bg-mc-accent/20 text-mc-accent' : 'hover:bg-mc-bg-tertiary text-mc-text'
              }`}
            >
              # {c.title || 'Untitled'}
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-mc-border px-4 py-2 flex items-center justify-between">
          <div className="font-medium">{activeConversation?.title || 'Select a team channel'}</div>
          {notice && <div className="text-xs text-mc-accent-yellow">{notice}</div>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="bg-mc-bg rounded border border-mc-border p-2">
              <div className="text-xs text-mc-text-secondary mb-1 flex items-center justify-between">
                <span>
                  {m.sender ? `${m.sender.avatar_emoji} ${m.sender.name}` : 'System'} · {new Date(m.created_at).toLocaleTimeString()}
                </span>
                {m.sender && (
                  <button
                    onClick={() => pingAgent(m.sender!.id)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-mc-accent-cyan/20 text-mc-accent-cyan hover:bg-mc-accent-cyan/30"
                  >
                    <BellRing className="w-3 h-3" /> Ping
                  </button>
                )}
              </div>
              <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-mc-text-secondary text-sm">
              <div className="text-center">
                <Users className="w-8 h-8 mx-auto mb-2" />
                No messages yet.
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-mc-border p-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Message team channel..."
            className="flex-1 bg-mc-bg border border-mc-border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending || !activeId}
            className="px-3 py-2 rounded bg-mc-accent text-mc-bg disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <aside className="w-72 border-l border-mc-border p-3 overflow-y-auto hidden lg:block">
        <div className="text-xs uppercase text-mc-text-secondary mb-2">Participants</div>
        <div className="space-y-2">
          {(activeConversation?.participants || []).map((agent) => (
            <div key={agent.id} className="flex items-center justify-between bg-mc-bg rounded border border-mc-border px-2 py-1.5">
              <div className="text-sm truncate">{agent.avatar_emoji} {agent.name}</div>
              <button
                onClick={() => pingAgent(agent.id)}
                className="text-xs px-2 py-0.5 rounded bg-mc-accent-cyan/20 text-mc-accent-cyan hover:bg-mc-accent-cyan/30"
              >
                Ping
              </button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
