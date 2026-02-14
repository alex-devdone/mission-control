import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDb, Task, Agent, Event, OpenclawSession } from '@/lib/db';
import type { Task as TaskType, Agent as AgentType, OpenClawSession } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    await connectDb();
    const body = await request.json();
    const now = new Date().toISOString();

    if (body.task_id) {
      const task = await Task.findById(body.task_id).lean() as any;
      if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

      let agentName = 'Agent';
      if (task.assigned_agent_id) {
        const a = await Agent.findById(task.assigned_agent_id).lean() as any;
        if (a) agentName = a.name;
      }

      if (task.status !== 'testing' && task.status !== 'review' && task.status !== 'done') {
        await Task.findByIdAndUpdate(task._id, { $set: { status: 'testing' } });
      }

      await Event.create({
        _id: uuidv4(), type: 'task_completed', agent_id: task.assigned_agent_id,
        task_id: task._id, message: `${agentName} completed: ${body.summary || 'Task finished'}`, created_at: now,
      });

      if (task.assigned_agent_id) {
        await Agent.findByIdAndUpdate(task.assigned_agent_id, { $set: { status: 'standby' } });
      }

      return NextResponse.json({ success: true, task_id: task._id, new_status: 'testing', message: 'Task moved to testing' });
    }

    if (body.session_id && body.message) {
      const completionMatch = body.message.match(/TASK_COMPLETE:\s*(.+)/i);
      if (!completionMatch) {
        return NextResponse.json({ error: 'Invalid completion message format' }, { status: 400 });
      }
      const summary = completionMatch[1].trim();

      const session = await OpenclawSession.findOne({ openclaw_session_id: body.session_id, status: 'active' }).lean() as any;
      if (!session) return NextResponse.json({ error: 'Session not found or inactive' }, { status: 404 });

      const task = await Task.findOne({
        assigned_agent_id: session.agent_id,
        status: { $in: ['assigned', 'in_progress'] }
      }).sort({ updated_at: -1 }).lean() as any;

      if (!task) return NextResponse.json({ error: 'No active task found for this agent' }, { status: 404 });

      let agentName = 'Agent';
      if (session.agent_id) {
        const a = await Agent.findById(session.agent_id).lean() as any;
        if (a) agentName = a.name;
      }

      if (task.status !== 'testing' && task.status !== 'review' && task.status !== 'done') {
        await Task.findByIdAndUpdate(task._id, { $set: { status: 'testing' } });
      }

      await Event.create({
        _id: uuidv4(), type: 'task_completed', agent_id: session.agent_id,
        task_id: task._id, message: `${agentName} completed: ${summary}`, created_at: now,
      });

      await Agent.findByIdAndUpdate(session.agent_id, { $set: { status: 'standby' } });

      return NextResponse.json({
        success: true, task_id: task._id, agent_id: session.agent_id,
        summary, new_status: 'testing', message: 'Task moved to testing',
      });
    }

    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  } catch (error) {
    console.error('Agent completion webhook error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to process completion' }, { status: 500 });
  }
}

export async function GET() {
  try {
    await connectDb();
    const recentCompletions = await Event.find({ type: 'task_completed' })
      .sort({ created_at: -1 }).limit(10).lean() as any[];

    const agentIds = Array.from(new Set(recentCompletions.map(e => e.agent_id).filter(Boolean)));
    const taskIds = Array.from(new Set(recentCompletions.map(e => e.task_id).filter(Boolean)));
    const agents = agentIds.length > 0 ? await Agent.find({ _id: { $in: agentIds } }).lean() as any[] : [];
    const tasks = taskIds.length > 0 ? await Task.find({ _id: { $in: taskIds } }).lean() as any[] : [];
    const agentMap = new Map(agents.map(a => [a._id, a]));
    const taskMap = new Map(tasks.map(t => [t._id, t]));

    const result = recentCompletions.map(e => ({
      ...e, id: e._id,
      agent_name: e.agent_id && agentMap.has(e.agent_id) ? agentMap.get(e.agent_id)!.name : undefined,
      task_title: e.task_id && taskMap.has(e.task_id) ? taskMap.get(e.task_id)!.title : undefined,
    }));

    return NextResponse.json({ status: 'active', recent_completions: result, endpoint: '/api/webhooks/agent-completion' });
  } catch (error) {
    console.error('Failed to fetch completion status:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
