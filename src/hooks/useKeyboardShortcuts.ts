'use client';

import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: string;
}

export const SHORTCUTS: KeyboardShortcut[] = [
  { key: 'n', description: 'New task', action: 'new-task' },
  { key: '/', description: 'Focus search', action: 'focus-search' },
  { key: 'Escape', description: 'Close modal', action: 'close-modal' },
  { key: '1', description: 'Kanban view', action: 'view-kanban' },
  { key: '2', description: 'Pixel Office view', action: 'view-office' },
  { key: '3', description: 'Settings', action: 'view-settings' },
];

interface KeyboardShortcutsOptions {
  onNewTask?: () => void;
  onFocusSearch?: () => void;
  onCloseModal?: () => void;
  onSwitchView?: (viewIndex: number) => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger if typing in an input or textarea
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Check if any contenteditable element is focused
      if (target.contentEditable === 'true') {
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'n':
          event.preventDefault();
          options.onNewTask?.();
          break;
        case '/':
          event.preventDefault();
          options.onFocusSearch?.();
          break;
        case 'escape':
          event.preventDefault();
          options.onCloseModal?.();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          event.preventDefault();
          const viewIndex = parseInt(event.key) - 1;
          options.onSwitchView?.(viewIndex);
          break;
        default:
          break;
      }
    },
    [options]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
