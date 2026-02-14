import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const workspaceSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, default: null },
  icon: { type: String, default: '📁' },
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

export const Workspace = mongoose.models.Workspace || mongoose.model('Workspace', workspaceSchema);
