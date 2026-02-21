/**
 * ActivityLog Component
 * Displays chronological activity log for a task
 */

'use client';

import { useEffect, useState } from 'react';
import type { TaskActivity } from '@/lib/types';

interface ActivityLogProps {
  taskId: string;
}

export function ActivityLog({ taskId }: ActivityLogProps) {
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, [taskId]);

  const loadActivities = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/activities`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      }
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'spawned':
        return '🚀';
      case 'updated':
        return '✏️';
      case 'completed':
        return '✅';
      case 'file_created':
        return '📄';
      case 'status_changed':
        return '🔄';
      default:
        return '📝';
    }
  };

  const getActivityBorderColor = (type: string) => {
    switch (type) {
      case 'spawned':
      case 'updated':
        return 'border-l-2 border-blue-500';
      case 'completed':
        return 'border-l-2 border-green-500';
      case 'file_created':
        return 'border-l-2 border-cyan-500';
      case 'status_changed':
        return 'border-l-2 border-yellow-500';
      default:
        return 'border-l-2 border-gray-500';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // Less than 1 minute
    if (diff < 60000) {
      return 'just now';
    }
    
    // Less than 1 hour
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins} min${mins > 1 ? 's' : ''} ago`;
    }
    
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    
    // More than 24 hours
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getModelBadgeStyles = (model: string) => {
    const baseClasses = 'text-xs px-2 py-0.5 rounded-full font-mono inline-block';
    
    switch (model) {
      case 'sonnet':
      case 'claude-sonnet':
        return `${baseClasses} bg-blue-500/20 text-blue-400`;
      case 'haiku':
      case 'claude-haiku':
        return `${baseClasses} bg-green-500/20 text-green-400`;
      case 'glm-5':
      case 'glm-max':
        return `${baseClasses} bg-purple-500/20 text-purple-400`;
      case 'codex':
        return `${baseClasses} bg-orange-500/20 text-orange-400`;
      case 'opus':
      case 'claude-opus':
        return `${baseClasses} bg-pink-500/20 text-pink-400`;
      default:
        return `${baseClasses} bg-gray-500/20 text-gray-400`;
    }
  };

  const parseMetadata = (metadataValue: TaskActivity['metadata']) => {
    if (!metadataValue) return null;
    if (typeof metadataValue === 'object') return metadataValue as Record<string, unknown>;
    try {
      return JSON.parse(metadataValue);
    } catch {
      return null;
    }
  };

  const formatTokenCount = (value: unknown) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return `${value}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-mc-text-secondary">Loading activities...</div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary">
        <div className="text-4xl mb-2">📝</div>
        <p>No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 overflow-y-auto">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className={`flex gap-3 p-3 bg-mc-bg rounded-lg border border-mc-border ${getActivityBorderColor(activity.activity_type)}`}
        >
          {/* Icon */}
          <div className="text-2xl flex-shrink-0">
            {getActivityIcon(activity.activity_type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Agent info */}
            {activity.agent && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">{activity.agent.avatar_emoji}</span>
                <span className="text-sm font-medium text-mc-text">
                  {activity.agent.name}
                </span>
              </div>
            )}

            {/* Message */}
            <p className="text-sm text-mc-text break-words">
              {activity.message}
            </p>

            {/* Metadata */}
            {activity.metadata && (() => {
              const metadata = parseMetadata(activity.metadata);
              if (!metadata) return null;

              const model = typeof metadata.model === 'string' ? metadata.model : undefined;
              const tokensIn = formatTokenCount(metadata.tokens_in ?? metadata.tokensIn);
              const tokensOut = formatTokenCount(metadata.tokens_out ?? metadata.tokensOut);

              if (!model && !tokensIn && !tokensOut) return null;

              return (
                <div className="mt-1 text-xs text-mc-text-secondary font-mono">
                  {model && <span className={getModelBadgeStyles(model)}>{model}</span>}
                  {(tokensIn || tokensOut) && (
                    <span className="ml-2">{tokensIn ?? '0'}→{tokensOut ?? '0'} tokens</span>
                  )}
                </div>
              );
            })()}

            {/* Timestamp */}
            <div className="text-xs text-mc-text-secondary mt-2">
              {formatTimestamp(activity.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
