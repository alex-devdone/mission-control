import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Agent, OpenclawSession } from '@/lib/db';
import { broadcast } from '@/lib/events';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDb();
    const taskId = params.id;
    const body = await request.json();
    const { openclaw_session_id, agent_name } = body;

    if (!openclaw_session_id) {
      return NextResponse.json({ error: 'openclaw_session_id is required' }, { status: 400 });
    }

    let agentId = null;
    if (agent_name) {
      const existingAgent = await Agent.findOne({ name: agent_name }).lean() as any;
      if (existingAgent) {
        agentId = existingAgent._id;
      } else {
        agentId = crypto.randomUUID();
        await Agent.create({
          _id: agentId, name: agent_name, role: 'Sub-Agent',
          description: 'Automatically created sub-agent', status: 'working',
        });
      }
    }

    const sessionId = crypto.randomUUID();
    await OpenclawSession.create({
      _id: sessionId, agent_id: agentId, openclaw_session_id,
      session_type: 'subagent', task_id: taskId, status: 'active',
    });

    const session = await OpenclawSession.findById(sessionId).lean() as any;
    broadcast({
      type: 'agent_spawned',
      payload: { taskId, sessionId: openclaw_session_id, agentName: agent_name },
    });

    return NextResponse.json({ ...session, id: session._id }, { status: 201 });
  } catch (error) {
    console.error('Error registering sub-agent:', error);
    return NextResponse.json({ error: 'Failed to register sub-agent' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDb();
    const taskId = params.id;

    const sessions = await OpenclawSession.find({ task_id: taskId, session_type: 'subagent' })
      .sort({ created_at: -1 }).lean() as any[];

    const agentIds = Array.from(new Set(sessions.map(s => s.agent_id).filter(Boolean)));
    const agents = agentIds.length > 0 ? await Agent.find({ _id: { $in: agentIds } }).lean() as any[] : [];
    const agentMap = new Map(agents.map(a => [a._id, a]));

    const result = sessions.map(s => ({
      ...s, id: s._id,
      agent_name: s.agent_id && agentMap.has(s.agent_id) ? agentMap.get(s.agent_id)!.name : undefined,
      agent_avatar_emoji: s.agent_id && agentMap.has(s.agent_id) ? agentMap.get(s.agent_id)!.avatar_emoji : undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching sub-agents:', error);
    return NextResponse.json({ error: 'Failed to fetch sub-agents' }, { status: 500 });
  }
}
