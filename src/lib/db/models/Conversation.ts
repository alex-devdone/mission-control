import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const conversationSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  title: { type: String, default: null },
  type: { type: String, enum: ['direct', 'group', 'task'], default: 'direct' },
  task_id: { type: String, default: null },
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

export const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
