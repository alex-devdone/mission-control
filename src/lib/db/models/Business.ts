import mongoose, { Schema } from 'mongoose';
import { randomUUID } from 'crypto';

const businessSchema = new Schema({
  _id: { type: String, default: () => randomUUID() },
  name: { type: String, required: true },
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

export const Business = mongoose.models.Business || mongoose.model('Business', businessSchema);
