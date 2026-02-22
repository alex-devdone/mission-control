import mongoose, { Schema } from 'mongoose';

const heartbeatRunSchema = new Schema({
  agent_id: { type: String, required: true },
  timestamp: { type: String, required: true },
  model: { type: String, default: '' },
  provider: { type: String, default: '' },
  summary: { type: String, default: '' },
  status: { type: String, default: 'ok' },
  duration_ms: { type: Number, default: null },
  input_tokens: { type: Number, default: 0 },
  output_tokens: { type: Number, default: 0 },
  cache_read_tokens: { type: Number, default: 0 },
  total_tokens: { type: Number, default: 0 },
  cost: { type: Number, default: null },
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

heartbeatRunSchema.index({ timestamp: -1 });
heartbeatRunSchema.index({ agent_id: 1, timestamp: -1 });

export const HeartbeatRun = mongoose.models.HeartbeatRun || mongoose.model('HeartbeatRun', heartbeatRunSchema);
