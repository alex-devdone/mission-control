import type { Agent } from '@/lib/types';

export interface DevChatContextConfig {
  app: string;
  appPath: string;
  cwd: string;
  source: string;
}

export interface DevChatTargetSelector {
  name?: string;
  openclawAgentId?: string;
}

export interface DevChatExtensionConfig {
  title?: string;
  emptyMessage?: string;
  target: DevChatTargetSelector;
  context: DevChatContextConfig;
  enableInDevOnly?: boolean;
  enabled?: boolean;
}

export interface DevChatExtensionProps {
  config: DevChatExtensionConfig;
  resolveAgent?: (agents: Agent[], target: DevChatTargetSelector) => Agent | undefined;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}
