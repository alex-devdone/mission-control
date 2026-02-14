import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const planningQuestionSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  task_id: { type: String, required: true },
  category: { type: String, required: true },
  question: { type: String, required: true },
  question_type: { type: String, enum: ['multiple_choice', 'text', 'yes_no'], default: 'multiple_choice' },
  options: { type: String, default: null },
  answer: { type: String, default: null },
  answered_at: { type: String, default: null },
  sort_order: { type: Number, default: 0 },
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

export const PlanningQuestion = mongoose.models.PlanningQuestion || mongoose.model('PlanningQuestion', planningQuestionSchema);
