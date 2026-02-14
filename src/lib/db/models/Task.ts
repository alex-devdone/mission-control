import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const taskSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  title: { type: String, required: true },
  description: { type: String, default: null },
  status: { type: String, enum: ['planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'done'], default: 'inbox' },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  assigned_agent_id: { type: String, default: null },
  created_by_agent_id: { type: String, default: null },
  workspace_id: { type: String, default: 'default' },
  business_id: { type: String, default: 'default' },
  due_date: { type: String, default: null },
  planning_session_key: { type: String, default: null },
  planning_messages: { type: String, default: null },
  planning_complete: { type: Number, default: 0 },
  planning_spec: { type: String, default: null },
  planning_agents: { type: String, default: null },
  app_id: { type: String, default: null },
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

export const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);
