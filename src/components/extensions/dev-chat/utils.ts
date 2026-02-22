import type { DevChatContextConfig, DevChatTargetSelector } from './types';

export function buildDevChatContextPrefix(context: DevChatContextConfig): string {
  return `[Dev Chat Context] app=${context.app}; appPath=${context.appPath}; cwd=${context.cwd}; source=${context.source}`;
}

export function matchAgent(target: DevChatTargetSelector, name?: string, openclawAgentId?: string): boolean {
  const normalizedName = (name || '').toLowerCase();
  const normalizedOcId = (openclawAgentId || '').toLowerCase();
  const targetName = (target.name || '').toLowerCase();
  const targetOcId = (target.openclawAgentId || '').toLowerCase();

  return (!!targetName && normalizedName === targetName) || (!!targetOcId && normalizedOcId === targetOcId);
}
