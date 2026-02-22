'use client';

import React from 'react';
import { DevChatExtension } from '@/components/extensions/dev-chat';

class DevChatWidgetErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('DevChatWidget crashed; hiding widget to protect page render', error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function DevChatWidget() {
  const isDev = process.env.NODE_ENV === 'development';
  // Master toggle: when 'false', widget is completely disabled
  const widgetEnabled = process.env.NEXT_PUBLIC_DEV_WIDGET_ENABLED !== 'false';
  // Prod visibility: when true, widget can show in production (if widgetEnabled)
  const showInProd = process.env.NEXT_PUBLIC_DEV_WIDGET_SHOW_IN_PROD === 'true';
  // Final gate: dev mode OR explicit prod permission
  const enableInDevOnly = isDev ? true : !showInProd;

  return (
    <DevChatWidgetErrorBoundary>
      <DevChatExtension
        config={{
          title: 'Dev Chat · mcCodexDev',
          emptyMessage: 'No messages yet. Send a request to mcCodexDev.',
          target: {
            name: 'mcCodexDev',
            openclawAgentId: 'mcCodexDev',
          },
          context: {
            app: 'mission-control',
            appPath: '/Users/betty/work/mission-control',
            cwd: '/Users/betty/work/mission-control',
            source: 'dev-widget',
          },
          enableInDevOnly,
          enabled: widgetEnabled,
        }}
      />
    </DevChatWidgetErrorBoundary>
  );
}
