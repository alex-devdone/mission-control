import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const agentSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  name: { type: String, required: true },
  role: { type: String, required: true },
  description: { type: String, default: null },
  avatar_emoji: { type: String, default: '🤖' },
  status: { type: String, enum: ['standby', 'working', 'offline'], default: 'standby' },
  is_master: { type: Number, default: 0 },
  workspace_id: { type: String, default: 'default' },
  soul_md: { type: String, default: null },
  user_md: { type: String, default: null },
  agents_md: { type: String, default: null },
  openclaw_agent_id: { type: String, default: null },
  model: { type: String, default: 'unknown' },
  provider_account_id: { type: String, default: null },
  limit_5h: { type: Number, default: 100 },
  limit_week: { type: Number, default: 100 },
  last_poll_at: { type: String, default: null },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: {
    virtuals: true,
    transform: (_: any, ret: any) => { ret.id = ret._id; delete ret.__v; return ret; }
  },
  toObject: {
    virtuals: true,
    transform: (_: any, ret: any) => { ret.id = ret._id; delete ret.__v; return ret; }
  }
});

export const Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
