import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDb, Task, Agent, App, OpenclawSession, Event } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { broadcast } from '@/lib/events';
import { getProjectsPath, getMissionControlUrl } from '@/lib/config';
import type { Task as TaskType, Agent as AgentType, App as AppType, OpenClawSession } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDb();
    const { id } = await params;

    const taskDoc = await Task.findById(id).lean() as any;
    if (!taskDoc) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (!taskDoc.assigned_agent_id) return NextResponse.json({ error: 'Task has no assigned agent' }, { status: 400 });

    const agent = await Agent.findById(taskDoc.assigned_agent_id).lean() as any;
    if (!agent) return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });

    const client = getOpenClawClient();
    if (!client.isConnected()) {
      try { await client.connect(); } catch (err) {
        console.error('Failed to connect to OpenClaw Gateway:', err);
        return NextResponse.json({ error: 'Failed to connect to OpenClaw Gateway' }, { status: 503 });
      }
    }

    let session = await OpenclawSession.findOne({ agent_id: agent._id, status: 'active' }).lean() as any;
    const now = new Date().toISOString();

    if (!session) {
      const sessionId = uuidv4();
      const openclawSessionId = `mission-control-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;
      await OpenclawSession.create({
        _id: sessionId, task_id: id, agent_id: agent._id,
        openclaw_session_id: openclawSessionId, channel: 'mission-control', status: 'active',
      });
      session = await OpenclawSession.findById(sessionId).lean() as any;
      await Event.create({
        _id: uuidv4(), type: 'agent_status_changed', agent_id: agent._id,
        message: `${agent.name} session created`, created_at: now,
      });
    }

    if (!session) return NextResponse.json({ error: 'Failed to create agent session' }, { status: 500 });

    const priorityEmoji = ({ low: '🔵', normal: '⚪', high: '🟡', urgent: '🔴' } as Record<string, string>)[taskDoc.priority] || '⚪';
    const projectsPath = getProjectsPath();
    const projectDir = taskDoc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const missionControlUrl = getMissionControlUrl();

    const app = taskDoc.app_id ? await App.findById(taskDoc.app_id).lean() as any : null;
    let appContext = '';
    if (app) {
      appContext = `\n## APP CONTEXT\n- **App**: ${app.name}\n- **Path**: \`${app.path}\`\n${app.port ? `- **Port**: ${app.port} (access at http://localhost:${app.port})\n` : ''}- **PRD**: Check \`${app.path}/.ralphy/PRD.md\` if it exists for feature specs\n`;
    }

    const taskMessage = `${priorityEmoji} **NEW TASK ASSIGNED**

**Title:** ${taskDoc.title}
${taskDoc.description ? `**Description:** ${taskDoc.description}\n` : ''}
**Priority:** ${taskDoc.priority.toUpperCase()}
${taskDoc.due_date ? `**Due:** ${taskDoc.due_date}\n` : ''}
**Task ID:** ${taskDoc._id}
${appContext}
## SOURCE CODE — Edit Here Directly
The Mission Control app source code is at: \`/Users/betty/work/mission-control/\`
- **Frontend**: \`src/app/\` (Next.js 14 App Router pages and components)
- **Components**: \`src/components/\` (React components)
- **API routes**: \`src/app/api/\` (Next.js API routes)
- **Lib/utils**: \`src/lib/\` (shared utilities, DB, OpenClaw client)
- **Styles**: Tailwind CSS, mobile-first

**YOU MUST edit the actual source files above.** Do NOT create standalone files in separate directories.
Read existing code first to understand patterns, then make targeted changes.
After editing, the dev server auto-reloads (no restart needed).

## After Completing Work
1. Log activity: POST ${missionControlUrl}/api/tasks/${taskDoc._id}/activities
   Body: {"activity_type": "completed", "message": "Description of what was done"}
2. Register deliverable (list each changed file): POST ${missionControlUrl}/api/tasks/${taskDoc._id}/deliverables
   Body: {"deliverable_type": "file", "title": "filename", "path": "/Users/betty/work/mission-control/src/..."}
3. Update status: PATCH ${missionControlUrl}/api/tasks/${taskDoc._id}
   Body: {"status": "review"}

When complete, reply with:
\`TASK_COMPLETE: [brief summary of what you did]\`

If you need help or clarification, ask me (Charlie).`;

    try {
      const openclawAgentId = agent.openclaw_agent_id || 'devops';
      const sessionKey = `agent:${openclawAgentId}:${session.openclaw_session_id}`;
      await client.call('chat.send', {
        sessionKey, message: taskMessage,
        idempotencyKey: `dispatch-${taskDoc._id}-${Date.now()}`
      });

      await Task.findByIdAndUpdate(id, { $set: { status: 'in_progress' } });
      const updatedTask = await Task.findById(id).lean() as any;
      if (updatedTask) broadcast({ type: 'task_updated', payload: { ...updatedTask, id: updatedTask._id } as unknown as TaskType });

      await Agent.findByIdAndUpdate(agent._id, { $set: { status: 'working' } });
      await Event.create({
        _id: uuidv4(), type: 'task_dispatched', agent_id: agent._id, task_id: taskDoc._id,
        message: `Task "${taskDoc.title}" dispatched to ${agent.name}`, created_at: now,
      });

      return NextResponse.json({
        success: true, task_id: taskDoc._id, agent_id: agent._id,
        session_id: session.openclaw_session_id, message: 'Task dispatched to agent'
      });
    } catch (err) {
      console.error('Failed to send message to agent:', err);
      return NextResponse.json(
        { error: `Failed to send task to agent: ${err instanceof Error ? err.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to dispatch task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to dispatch task' },
      { status: 500 }
    );
  }
}
