'use client';

import { DevChatExtension } from '@/components/extensions/dev-chat';

export function DevChatWidget() {
  const widgetEnabled = process.env.NEXT_PUBLIC_DEV_WIDGET_ENABLED !== 'false';

  return (
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
        enableInDevOnly: true,
        enabled: widgetEnabled,
      }}
    />
  );
}
