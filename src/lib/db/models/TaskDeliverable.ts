import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const taskDeliverableSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  task_id: { type: String, required: true },
  deliverable_type: { type: String, required: true },
  title: { type: String, required: true },
  path: { type: String, default: null },
  description: { type: String, default: null },
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

export const TaskDeliverable = mongoose.models.TaskDeliverable || mongoose.model('TaskDeliverable', taskDeliverableSchema);
