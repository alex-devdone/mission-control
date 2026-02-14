import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const appSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  name: { type: String, required: true },
  description: { type: String, default: null },
  path: { type: String, required: true },
  port: { type: Number, default: null },
  build_status: { type: String, enum: ['ready', 'building', 'done', 'error', 'paused'], default: 'ready' },
  progress_completed: { type: Number, default: 0 },
  progress_total: { type: Number, default: 0 },
  current_agent_id: { type: String, default: null },
  workspace_id: { type: String, default: 'default' },
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

export const App = mongoose.models.App || mongoose.model('App', appSchema);
