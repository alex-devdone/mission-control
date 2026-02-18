import mongoose, { Schema } from 'mongoose';

const sessionTokenSchema = new Schema({
  session_id: { type: String, required: true },
  agent_id: { type: String, required: true },
  channel: { type: String, default: '' },
  model: { type: String, default: '' },
  total_tokens: { type: Number, default: 0 },
  date: { type: String, required: true },
  last_seen_at: { type: String, default: '' },
  created_at: { type: String, default: '' },
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

sessionTokenSchema.index({ session_id: 1 }, { unique: true });
sessionTokenSchema.index({ agent_id: 1, date: 1 });
sessionTokenSchema.index({ date: 1 });

export const SessionToken = mongoose.models.SessionToken || mongoose.model('SessionToken', sessionTokenSchema);
