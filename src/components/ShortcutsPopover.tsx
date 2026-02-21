'use client';

import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { SHORTCUTS } from '@/hooks/useKeyboardShortcuts';

export function ShortcutsPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-[#2a2a3a] text-mc-text-secondary hover:text-mc-text transition-colors"
        title="Keyboard shortcuts (?)"
        aria-label="Show keyboard shortcuts"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 mt-2 w-64 bg-[#1a1a2e] border border-[#2a2a3a] rounded-lg shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a3a]">
            <h3 className="text-sm font-semibold text-mc-text">Keyboard Shortcuts</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-[#2a2a3a] rounded transition-colors text-mc-text-secondary hover:text-mc-text"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Shortcuts list */}
          <div className="max-h-80 overflow-y-auto">
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.action}
                className="px-4 py-2.5 border-b border-[#2a2a3a] last:border-b-0 hover:bg-[#2a2a3a]/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-mc-text-secondary">{shortcut.description}</span>
                  <kbd className="px-2 py-1 text-xs font-mono bg-[#0d1117] border border-[#3a3a4a] rounded text-mc-accent">
                    {shortcut.key.toUpperCase()}
                  </kbd>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
