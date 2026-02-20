import { Agent, Conversation, ConversationParticipant } from '@/lib/db';

export interface TeamDefinition {
  key: string;
  title: string;
  members: string[];
}

export const TEAM_DEFINITIONS: TeamDefinition[] = [
  {
    key: 'dev-team',
    title: 'Dev Team',
    members: ['Developer', 'Middle Developer', 'Codex Developer', 'Junior Developer', 'BettyDev', 'betty99dev', 'Mobile Dev'],
  },
  {
    key: 'qa-design',
    title: 'QA & Design',
    members: ['QA', 'betty99qa', 'Designer'],
  },
  {
    key: 'leadership',
    title: 'Leadership',
    members: ['Team Lead Betty', 'Researcher'],
  },
  {
    key: 'personal-assistants',
    title: 'Personal Assistants',
    members: ['Betty99bot', 'Betty99Shopping', 'betty99coach', 'betty99budget', 'betty99events', 'betty99doctor'],
  },
  {
    key: 'ops',
    title: 'Ops',
    members: ['bettydevops', 'devops'],
  },
];

export async function ensureTeamConversations(): Promise<void> {
  const titleToConversation = new Map<string, any>();
  const existing = await Conversation.find({ type: 'group' }).lean() as any[];
  existing.forEach((conv) => titleToConversation.set(conv.title, conv));

  for (const team of TEAM_DEFINITIONS) {
    let conversation = titleToConversation.get(team.title);
    if (!conversation) {
      conversation = await Conversation.create({ title: team.title, type: 'group' });
      titleToConversation.set(team.title, conversation);
    }

    const matchedAgents = await Agent.find({
      name: { $in: team.members },
    }).lean() as any[];

    for (const ag of matchedAgents) {
      await ConversationParticipant.updateOne(
        { conversation_id: conversation._id || conversation.id, agent_id: ag._id },
        { $setOnInsert: { joined_at: new Date().toISOString() } },
        { upsert: true }
      );
    }
  }
}
