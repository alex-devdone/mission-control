import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { connectDb, Task, Agent, Event, OpenclawSession, Conversation, TaskActivity } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { getMissionControlUrl } from '@/lib/config';
import type { Task as TaskType, UpdateTaskRequest, Agent as AgentType } from '@/lib/types';

async function getTaskWithAgents(id: string) {
  const task = await Task.findById(id).lean() as any;
  if (!task) return null;
  const result: any = { ...task, id: task._id };
  if (task.assigned_agent_id) {
    const aa = await Agent.findById(task.assigned_agent_id).lean() as any;
    if (aa) { result.assigned_agent_name = aa.name; result.assigned_agent_emoji = aa.avatar_emoji; }
  }
  if (task.created_by_agent_id) {
    const ca = await Agent.findById(task.created_by_agent_id).lean() as any;
    if (ca) { result.created_by_agent_name = ca.name; result.created_by_agent_emoji = ca.avatar_emoji; }
  }
  return result;
}

// GET /api/tasks/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await params;
    const task = await getTaskWithAgents(id);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to fetch task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await params;
    const body: UpdateTaskRequest & { updated_by_agent_id?: string } = await request.json();

    const existing = await Task.findById(id).lean() as any;
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    const now = new Date().toISOString();

    if (body.status === 'done' && existing.status === 'review' && body.updated_by_agent_id) {
      const updatingAgent = await Agent.findById(body.updated_by_agent_id).lean() as any;
      if (!updatingAgent || !updatingAgent.is_master) {
        return NextResponse.json({ error: 'Forbidden: only master agent (Charlie) can approve tasks' }, { status: 403 });
      }
    }

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.app_id !== undefined) updates.app_id = body.app_id;

    let shouldDispatch = false;

    if (body.status !== undefined && body.status !== existing.status) {
      updates.status = body.status;
      if (body.status === 'assigned' && existing.assigned_agent_id) shouldDispatch = true;

      if ((body.status === 'review' || body.status === 'done') && existing.assigned_agent_id) {
        const otherActive = await Task.countDocuments({
          assigned_agent_id: existing.assigned_agent_id, _id: { $ne: id },
          status: { $nin: ['done', 'review', 'backlog'] }
        });
        if (otherActive === 0) {
          await Agent.findByIdAndUpdate(existing.assigned_agent_id, { $set: { status: 'standby' } });
          const updatedAgent = await Agent.findById(existing.assigned_agent_id).lean() as any;
          if (updatedAgent) broadcast({ type: 'agent_updated', payload: { ...updatedAgent, id: updatedAgent._id } as unknown as AgentType });
        }
      }

      const eventType = body.status === 'done' ? 'task_completed' : 'task_status_changed';
      await Event.create({
        _id: uuidv4(), type: eventType, task_id: id,
        message: `Task "${existing.title}" moved to ${body.status}`, created_at: now,
      });

      if ((body.status === 'done' || body.status === 'review') && existing.app_id) {
        const missionControlUrl = getMissionControlUrl();
        fetch(`${missionControlUrl}/api/apps/${existing.app_id}/progress`, { method: 'POST' })
          .catch(err => console.error('Failed to update app progress:', err));
      }
    }

    if (body.assigned_agent_id !== undefined && body.assigned_agent_id !== existing.assigned_agent_id) {
      updates.assigned_agent_id = body.assigned_agent_id;
      if (body.assigned_agent_id) {
        const agent = await Agent.findById(body.assigned_agent_id).lean() as any;
        if (agent) {
          await Event.create({
            _id: uuidv4(), type: 'task_assigned', agent_id: body.assigned_agent_id, task_id: id,
            message: `"${existing.title}" assigned to ${agent.name}`, created_at: now,
          });
          if (existing.status === 'assigned' || body.status === 'assigned') shouldDispatch = true;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    await Task.findByIdAndUpdate(id, { $set: updates });
    const task = await getTaskWithAgents(id);

    if (task) broadcast({ type: 'task_updated', payload: task as TaskType });

    if (shouldDispatch) {
      const missionControlUrl = getMissionControlUrl();
      fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      }).catch(err => console.error('Auto-dispatch failed:', err));
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id } = await params;
    const existing = await Task.findById(id).lean();
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    await OpenclawSession.deleteMany({ task_id: id });
    await Event.deleteMany({ task_id: id });
    await Conversation.updateMany({ task_id: id }, { $set: { task_id: null } });
    // task_activities and task_deliverables - delete manually since no cascade in mongo
    await TaskActivity.deleteMany({ task_id: id });
    const { TaskDeliverable } = await import('@/lib/db');
    await TaskDeliverable.deleteMany({ task_id: id });
    await Task.findByIdAndDelete(id);

    broadcast({ type: 'task_deleted', payload: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
