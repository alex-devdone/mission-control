import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const openclawSessionSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  agent_id: { type: String, default: null },
  openclaw_session_id: { type: String, required: true },
  channel: { type: String, default: null },
  status: { type: String, default: 'active' },
  session_type: { type: String, default: 'persistent' },
  task_id: { type: String, default: null },
  ended_at: { type: String, default: null },
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

export const OpenclawSession = mongoose.models.OpenclawSession || mongoose.model('OpenclawSession', openclawSessionSchema);
