import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Task, Agent } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';

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
    const result = await client.call<{ messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }> }>('chat.history', { sessionKey, limit: 50 });
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  try {
    await connectDb();
    const body = await request.json();
    const { answer, otherText } = body;
    if (!answer) return NextResponse.json({ error: 'Answer is required' }, { status: 400 });

    const task = await Task.findById(taskId).lean() as any;
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (!task.planning_session_key) return NextResponse.json({ error: 'Planning not started' }, { status: 400 });

    const answerText = answer === 'other' && otherText ? `Other: ${otherText}` : answer;
    const answerPrompt = `User's answer: ${answerText}\n\nBased on this answer and the conversation so far, either:\n1. Ask your next question (if you need more information)\n2. Complete the planning (if you have enough information)\n\nFor another question, respond with JSON:\n{\n  "question": "Your next question?",\n  "options": [\n    {"id": "A", "label": "Option A"},\n    {"id": "B", "label": "Option B"},\n    {"id": "other", "label": "Other"}\n  ]\n}\n\nIf planning is complete, respond with JSON:\n{\n  "status": "complete",\n  "spec": {\n    "title": "Task title",\n    "summary": "Summary of what needs to be done",\n    "deliverables": ["List of deliverables"],\n    "success_criteria": ["How we know it's done"],\n    "constraints": {}\n  },\n  "agents": [\n    {\n      "name": "Agent Name",\n      "role": "Agent role",\n      "avatar_emoji": "🎯",\n      "soul_md": "Agent personality...",\n      "instructions": "Specific instructions..."\n    }\n  ],\n  "execution_plan": {\n    "approach": "How to execute",\n    "steps": ["Step 1", "Step 2"]\n  }\n}`;

    const messages = task.planning_messages ? JSON.parse(task.planning_messages) : [];
    messages.push({ role: 'user', content: answerText, timestamp: Date.now() });

    const client = getOpenClawClient();
    if (!client.isConnected()) await client.connect();
    await client.call('chat.send', {
      sessionKey: task.planning_session_key,
      message: answerPrompt,
      idempotencyKey: `planning-answer-${taskId}-${Date.now()}`,
    });

    await Task.findByIdAndUpdate(taskId, { $set: { planning_messages: JSON.stringify(messages) } });

    let response = null;
    const initialMessages = await getMessagesFromOpenClaw(task.planning_session_key!);
    const initialMsgCount = initialMessages.length;

    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const transcriptMessages = await getMessagesFromOpenClaw(task.planning_session_key!);
      if (transcriptMessages.length > initialMsgCount) {
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
      const parsed = extractJSON(response) as any;

      if (parsed) {
        if (parsed.status === 'complete') {
          await Task.findByIdAndUpdate(taskId, {
            $set: {
              planning_messages: JSON.stringify(messages),
              planning_complete: 1,
              planning_spec: JSON.stringify(parsed.spec),
              planning_agents: JSON.stringify(parsed.agents),
              status: 'inbox',
            }
          });

          let firstAgentId: string | null = null;
          if (parsed.agents && parsed.agents.length > 0) {
            for (const agentData of parsed.agents) {
              const agentId = crypto.randomUUID();
              if (!firstAgentId) firstAgentId = agentId;
              await Agent.create({
                _id: agentId,
                workspace_id: task.workspace_id || 'default',
                name: agentData.name, role: agentData.role,
                description: agentData.instructions || '',
                avatar_emoji: agentData.avatar_emoji || '🤖',
                status: 'standby', soul_md: agentData.soul_md || '',
              });
            }
          }

          if (firstAgentId) {
            await Task.findByIdAndUpdate(taskId, { $set: { assigned_agent_id: firstAgentId } });
            const dispatchUrl = `http://localhost:${process.env.PORT || 3000}/api/tasks/${taskId}/dispatch`;
            try {
              const dispatchRes = await fetch(dispatchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
              if (!dispatchRes.ok) console.error(`[Planning] Dispatch failed (${dispatchRes.status}):`, await dispatchRes.text());
            } catch (err) { console.error('[Planning] Auto-dispatch error:', err); }
          }

          return NextResponse.json({
            complete: true, spec: parsed.spec, agents: parsed.agents,
            executionPlan: parsed.execution_plan, messages, autoDispatched: !!firstAgentId,
          });
        }

        if (parsed.question) {
          await Task.findByIdAndUpdate(taskId, { $set: { planning_messages: JSON.stringify(messages) } });
          return NextResponse.json({ complete: false, currentQuestion: parsed, messages });
        }
      }

      await Task.findByIdAndUpdate(taskId, { $set: { planning_messages: JSON.stringify(messages) } });
      return NextResponse.json({ complete: false, rawResponse: response, messages });
    }

    return NextResponse.json({ complete: false, messages, note: 'Answer submitted, waiting for response.' });
  } catch (error) {
    console.error('Failed to submit answer:', error);
    return NextResponse.json({ error: 'Failed to submit answer: ' + (error as Error).message }, { status: 500 });
  }
}
