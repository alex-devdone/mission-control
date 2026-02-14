import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Task, Agent } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';

const PLANNING_SESSION_PREFIX = 'agent:devops:planning:';

function extractJSON(text: string): object | null {
  try { return JSON.parse(text.trim()); } catch { /* continue */ }
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) { try { return JSON.parse(codeBlockMatch[1].trim()); } catch { /* continue */ } }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch { /* continue */ }
  }
  return null;
}

async function getMessagesFromOpenClaw(sessionKey: string): Promise<Array<{ role: string; content: string }>> {
  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) await client.connect();
    const result = await client.call<{ messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }> }>('chat.history', { sessionKey, limit: 20 });
    const messages: Array<{ role: string; content: string }> = [];
    for (const msg of result.messages || []) {
      if (msg.role === 'assistant') {
        const textContent = msg.content?.find((c) => c.type === 'text');
        if (textContent?.text) messages.push({ role: 'assistant', content: textContent.text });
      }
    }
    return messages;
  } catch (err) {
    console.error('[Planning] Failed to get messages from OpenClaw:', err);
    return [];
  }
}

// GET /api/tasks/[id]/planning
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  try {
    await connectDb();
    const task = await Task.findById(taskId).lean() as any;
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const messages = task.planning_messages ? JSON.parse(task.planning_messages) : [];
    let lastAssistantMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'assistant');
    let currentQuestion = null;

    if (!lastAssistantMessage && task.planning_session_key && messages.length > 0) {
      const openclawMessages = await getMessagesFromOpenClaw(task.planning_session_key);
      if (openclawMessages.length > 0) {
        const newAssistant = [...openclawMessages].reverse().find(m => m.role === 'assistant' && m.content.trim());
        if (newAssistant && extractJSON(newAssistant.content)) {
          messages.push({ role: 'assistant', content: newAssistant.content, timestamp: Date.now() });
          await Task.findByIdAndUpdate(taskId, { $set: { planning_messages: JSON.stringify(messages) } });
          lastAssistantMessage = { role: 'assistant', content: newAssistant.content };
        }
      }
    }

    if (lastAssistantMessage) {
      const parsed = extractJSON(lastAssistantMessage.content);
      if (parsed && 'question' in parsed) currentQuestion = parsed;
    }

    return NextResponse.json({
      taskId, sessionKey: task.planning_session_key, messages, currentQuestion,
      isComplete: !!task.planning_complete,
      spec: task.planning_spec ? JSON.parse(task.planning_spec) : null,
      agents: task.planning_agents ? JSON.parse(task.planning_agents) : null,
      isStarted: messages.length > 0,
    });
  } catch (error) {
    console.error('Failed to get planning state:', error);
    return NextResponse.json({ error: 'Failed to get planning state' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/planning
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  try {
    await connectDb();
    const task = await Task.findById(taskId).lean() as any;
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.planning_session_key) {
      return NextResponse.json({ error: 'Planning already started', sessionKey: task.planning_session_key }, { status: 400 });
    }

    const sessionKey = `${PLANNING_SESSION_PREFIX}${taskId}`;
    const planningPrompt = `PLANNING REQUEST\n\nTask Title: ${task.title}\nTask Description: ${task.description || 'No description provided'}\n\nYou are starting a planning session for this task. Read PLANNING.md for your protocol.\n\nGenerate your FIRST question to understand what the user needs. Remember:\n- Questions must be multiple choice\n- Include an "Other" option\n- Be specific to THIS task, not generic\n\nRespond with ONLY valid JSON in this format:\n{\n  "question": "Your question here?",\n  "options": [\n    {"id": "A", "label": "First option"},\n    {"id": "B", "label": "Second option"},\n    {"id": "C", "label": "Third option"},\n    {"id": "other", "label": "Other"}\n  ]\n}`;

    const client = getOpenClawClient();
    if (!client.isConnected()) await client.connect();

    await client.call('chat.send', {
      sessionKey, message: planningPrompt,
      idempotencyKey: `planning-start-${taskId}-${Date.now()}`,
    });

    const messages = [{ role: 'user', content: planningPrompt, timestamp: Date.now() }];
    await Task.findByIdAndUpdate(taskId, {
      $set: { planning_session_key: sessionKey, planning_messages: JSON.stringify(messages), status: 'planning' }
    });

    let response = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const transcriptMessages = await getMessagesFromOpenClaw(sessionKey);
      if (transcriptMessages.length > 0) {
        const lastAssistant = [...transcriptMessages].reverse().find(m => m.role === 'assistant' && m.content.trim());
        if (lastAssistant) {
          const testParsed = extractJSON(lastAssistant.content);
          if (testParsed && ('question' in testParsed || 'status' in testParsed)) {
            response = lastAssistant.content; break;
          }
        }
      }
    }

    if (response) {
      messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
      await Task.findByIdAndUpdate(taskId, { $set: { planning_messages: JSON.stringify(messages) } });
      const parsed = extractJSON(response);
      if (parsed && 'question' in parsed) {
        return NextResponse.json({ success: true, sessionKey, currentQuestion: parsed, messages });
      }
      return NextResponse.json({ success: true, sessionKey, rawResponse: response, messages });
    }

    return NextResponse.json({ success: true, sessionKey, messages, note: 'Planning started, waiting for response. Poll GET endpoint for updates.' });
  } catch (error) {
    console.error('Failed to start planning:', error);
    return NextResponse.json({ error: 'Failed to start planning: ' + (error as Error).message }, { status: 500 });
  }
}
