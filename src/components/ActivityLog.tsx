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

  const parseMetadata = (metadataStr: string | undefined) => {
    if (!metadataStr) return null;
    try {
      return JSON.parse(metadataStr);
    } catch {
      return null;
    }
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
          className="flex gap-3 p-3 bg-mc-bg rounded-lg border border-mc-border"
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
            {activity.metadata && (
              <div className="mt-2 space-y-1">
                {(() => {
                  const metadata = parseMetadata(typeof activity.metadata === 'string' ? activity.metadata : JSON.stringify(activity.metadata));
                  const model = metadata?.model;
                  const tokens = metadata?.tokens_estimate;
                  
                  return (
                    <>
                      {model && (
                        <div className="flex items-center gap-2">
                          <span className={getModelBadgeStyles(model)}>
                            {model}
                          </span>
                          {tokens && (
                            <span className="text-xs text-mc-text-secondary">
                              {tokens} tokens
                            </span>
                          )}
                        </div>
                      )}
                      <div className="p-2 bg-mc-bg-tertiary rounded text-xs text-mc-text-secondary font-mono">
                        {typeof activity.metadata === 'string' 
                          ? (() => { try { return JSON.stringify(JSON.parse(activity.metadata), null, 2); } catch { return activity.metadata; } })()
                          : JSON.stringify(activity.metadata, null, 2)}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

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
