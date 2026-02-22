import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/mission-control';

let connected = false;

export async function connectDb(): Promise<typeof mongoose> {
  if (connected && mongoose.connection.readyState === 1) {
    return mongoose;
  }
  
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGODB_URI);
  }
  
  connected = true;
  return mongoose;
}

export async function closeDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    connected = false;
  }
}

// Re-export all models
export { Agent, Task, App, Event, OpenclawSession, AgentSnapshot, TaskActivity, TaskDeliverable, Workspace, PlanningQuestion, PlanningSpec, Conversation, ConversationParticipant, Message, Business, HeartbeatRun, CronRun } from './models';
