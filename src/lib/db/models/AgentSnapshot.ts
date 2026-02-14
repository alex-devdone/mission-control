import mongoose, { Schema } from 'mongoose';

const agentSnapshotSchema = new Schema({
  snapshot_time: { type: String, required: true },
  agent_id: { type: String, required: true },
  agent_name: { type: String, required: true },
  status: { type: String, required: true },
  avatar_emoji: { type: String, default: null },
  model: { type: String, default: null },
  limit_5h: { type: Number, default: null },
  limit_week: { type: Number, default: null },
  task_id: { type: String, default: null },
  task_title: { type: String, default: null },
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

agentSnapshotSchema.index({ snapshot_time: 1 });
agentSnapshotSchema.index({ agent_id: 1, snapshot_time: 1 });

export const AgentSnapshot = mongoose.models.AgentSnapshot || mongoose.model('AgentSnapshot', agentSnapshotSchema);
