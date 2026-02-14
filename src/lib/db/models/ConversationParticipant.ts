import mongoose, { Schema } from 'mongoose';

const conversationParticipantSchema = new Schema({
  conversation_id: { type: String, required: true },
  agent_id: { type: String, required: true },
  joined_at: { type: String, default: () => new Date().toISOString() },
}, {
  timestamps: false,
  toJSON: {
    transform: (_: any, ret: any) => { delete ret.__v; return ret; }
  },
  toObject: {
    transform: (_: any, ret: any) => { delete ret.__v; return ret; }
  }
});

conversationParticipantSchema.index({ conversation_id: 1, agent_id: 1 }, { unique: true });

export const ConversationParticipant = mongoose.models.ConversationParticipant || mongoose.model('ConversationParticipant', conversationParticipantSchema);
