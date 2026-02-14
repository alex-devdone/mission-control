import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const messageSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  conversation_id: { type: String, required: true },
  sender_agent_id: { type: String, default: null },
  content: { type: String, required: true },
  message_type: { type: String, enum: ['text', 'system', 'task_update', 'file'], default: 'text' },
  metadata: { type: Schema.Types.Mixed, default: null },
  created_at: { type: String, default: () => new Date().toISOString() },
}, {
  timestamps: false,
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => { ret.id = ret._id; delete ret.__v; return ret; }
  },
  toObject: {
    virtuals: true,
    transform: (_: any, ret: any) => { ret.id = ret._id; delete ret.__v; return ret; }
  }
});

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
