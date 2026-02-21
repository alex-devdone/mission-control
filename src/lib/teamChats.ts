import { Agent, Conversation, ConversationParticipant } from '@/lib/db';
import { TEAM_DEFINITIONS } from '@/lib/teamDefinitions';
import type { TeamDefinition } from '@/lib/teamDefinitions';
export { TEAM_DEFINITIONS };
export type { TeamDefinition };

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
