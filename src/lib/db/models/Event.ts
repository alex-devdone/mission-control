import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const eventSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  type: { type: String, required: true },
  agent_id: { type: String, default: null },
  task_id: { type: String, default: null },
  message: { type: String, required: true },
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

export const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);
