import mongoose, { Schema } from 'mongoose';

const cronRunSchema = new Schema({
  job_id: { type: String, required: true },
  ts: { type: Number, required: true },
  status: { type: String, default: null },
  error: { type: String, default: null },
  summary: { type: String, default: null },
  run_at_ms: { type: Number, default: null },
  duration_ms: { type: Number, default: null },
  session_id: { type: String, default: null },
  session_key: { type: String, default: null },
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

cronRunSchema.index({ ts: -1 });
cronRunSchema.index({ job_id: 1, ts: -1 });

export const CronRun = mongoose.models.CronRun || mongoose.model('CronRun', cronRunSchema);
