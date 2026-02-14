import { v4 as uuidv4 } from 'uuid';
import { connectDb, closeDb, Agent, Task, Event, Conversation, ConversationParticipant, Message, Business, Workspace } from './index';

const CHARLIE_SOUL_MD = `# Charlie - Mission Control Orchestrator

You are Charlie, the master orchestrator of Mission Control. You are the leader of a team of AI agents working together as a family.

## Core Identity

- **Role**: Team Lead & Orchestrator
- **Personality**: Calm, strategic, supportive, decisive
- **Communication Style**: Clear, encouraging, direct when needed

## Responsibilities

1. **Task Coordination**: Receive tasks, analyze requirements, delegate to appropriate team members
2. **Team Support**: Check on agents, help when stuck, celebrate wins
3. **Quality Control**: Review work before marking complete
4. **Communication Hub**: Facilitate agent-to-agent collaboration

## Decision Framework

When a new task arrives:
1. Assess complexity and required skills
2. Check agent availability and expertise
3. Assign to best-fit agent(s)
4. Set clear expectations and deadlines
5. Monitor progress and offer support

## Team Philosophy

"We're a family. We succeed together, learn together, and support each other. Every agent brings unique value to our mission."
`;

const CHARLIE_USER_MD = `# User Context for Charlie

## The Human

The human running Mission Control is the ultimate authority.

## Communication with Human

- Be concise but thorough
- Proactively report significant events
- Ask for clarification when requirements are ambiguous
`;

const CHARLIE_AGENTS_MD = `# Team Roster

As the orchestrator, you manage and coordinate with all agents in Mission Control.

## How to Work with Agents

1. **Understand their strengths**: Each agent has a specialty
2. **Clear task assignments**: Specific, actionable, with context
3. **Regular check-ins**: "How's it going?" matters
4. **Collaborative problem-solving**: Two heads are better than one
5. **Celebrate successes**: Recognition motivates
`;

async function seed() {
  console.log('🌱 Seeding database...');
  await connectDb();
  const now = new Date().toISOString();

  // Create default workspace
  await Workspace.findOneAndUpdate(
    { _id: 'default' },
    { _id: 'default', name: 'Default Workspace', slug: 'default', description: 'Default workspace', icon: '🏠' },
    { upsert: true }
  );

  // Create default business
  await Business.findOneAndUpdate(
    { _id: 'default' },
    { _id: 'default', name: 'Mission Control HQ', description: 'Default workspace for all operations', created_at: now },
    { upsert: true }
  );

  const charlieId = uuidv4();
  await Agent.create({
    _id: charlieId, name: 'Charlie', role: 'Team Lead & Orchestrator',
    description: 'The master orchestrator who coordinates all agents',
    avatar_emoji: '🦞', status: 'standby', is_master: 1,
    soul_md: CHARLIE_SOUL_MD, user_md: CHARLIE_USER_MD, agents_md: CHARLIE_AGENTS_MD,
  });

  const agentDefs = [
    { name: 'Developer', role: 'Code & Automation', emoji: '💻', desc: 'Writes code, creates automations' },
    { name: 'Researcher', role: 'Research & Analysis', emoji: '🔍', desc: 'Gathers information, analyzes data' },
    { name: 'Writer', role: 'Content & Documentation', emoji: '✍️', desc: 'Creates content, writes documentation' },
    { name: 'Designer', role: 'Creative & Design', emoji: '🎨', desc: 'Handles visual design, UX decisions' },
  ];

  const agentIds: string[] = [charlieId];
  for (const a of agentDefs) {
    const id = uuidv4();
    agentIds.push(id);
    await Agent.create({ _id: id, name: a.name, role: a.role, description: a.desc, avatar_emoji: a.emoji, status: 'standby', is_master: 0 });
  }

  const teamConvoId = uuidv4();
  await Conversation.create({ _id: teamConvoId, title: 'Team Chat', type: 'group' });
  for (const agentId of agentIds) {
    await ConversationParticipant.create({ conversation_id: teamConvoId, agent_id: agentId, joined_at: now });
  }

  const tasks = [
    { title: 'Set up development environment', status: 'done', priority: 'high' },
    { title: 'Create project documentation', status: 'in_progress', priority: 'normal' },
    { title: 'Research competitor features', status: 'assigned', priority: 'normal' },
    { title: 'Design new dashboard layout', status: 'inbox', priority: 'low' },
  ];

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const assignedTo = t.status !== 'inbox' ? agentIds[i % agentIds.length] : null;
    await Task.create({
      _id: uuidv4(), title: t.title, status: t.status, priority: t.priority,
      assigned_agent_id: assignedTo, created_by_agent_id: charlieId, business_id: 'default',
    });
  }

  const events = [
    { type: 'system', message: 'Database seeded with initial data' },
    { type: 'agent_joined', agentId: charlieId, message: 'Charlie joined the team' },
    { type: 'system', message: 'Mission Control is online' },
  ];
  for (const e of events) {
    await Event.create({ _id: uuidv4(), type: e.type, agent_id: e.agentId || null, message: e.message, created_at: now });
  }

  await Message.create({
    _id: uuidv4(), conversation_id: teamConvoId, sender_agent_id: charlieId,
    content: "Welcome to Mission Control, team! 🦞 I'm Charlie, your orchestrator. We're going to do great things together!",
    message_type: 'text', created_at: now,
  });

  console.log('✅ Database seeded successfully!');
  console.log(`   - Created Charlie (master agent): ${charlieId}`);
  console.log(`   - Created ${agentDefs.length} additional agents`);
  console.log(`   - Created ${tasks.length} sample tasks`);

  await closeDb();
}

seed().catch(console.error);
