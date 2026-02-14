import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const planningSpecSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  task_id: { type: String, required: true, unique: true },
  spec_markdown: { type: String, required: true },
  locked_at: { type: String, default: null },
  locked_by: { type: String, default: null },
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

export const PlanningSpec = mongoose.models.PlanningSpec || mongoose.model('PlanningSpec', planningSpecSchema);
