import { readFileSync, existsSync } from 'fs';
import mongoose from 'mongoose';
import { connectDb, closeDb, Agent, Task, App, Event, OpenclawSession, AgentSnapshot, TaskActivity, TaskDeliverable, Workspace } from '../lib/db';

interface JsonRow {
  id?: string;
  _id?: string;
  metadata?: string;
  [key: string]: unknown;
}

function loadJson(path: string): JsonRow[] {
  if (!existsSync(path)) {
    console.log(`  ⏭  ${path} not found, skipping`);
    return [];
  }
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  return Array.isArray(data) ? data : [];
}

function mapRow(row: JsonRow): Record<string, unknown> {
  const mapped: Record<string, unknown> = { ...row };
  if (row.id) {
    mapped._id = row.id;
    delete mapped.id;
  }
  // Parse metadata if it's a JSON string
  if (typeof row.metadata === 'string' && row.metadata) {
    try { mapped.metadata = JSON.parse(row.metadata); } catch { /* keep as string */ }
  }
  return mapped;
}

async function migrate() {
  console.log('🚀 Starting SQLite → MongoDB migration...\n');
  await connectDb();

  const collections = [
    { file: '/tmp/mc-workspaces.json', model: Workspace, name: 'workspaces' },
    { file: '/tmp/mc-agents.json', model: Agent, name: 'agents' },
    { file: '/tmp/mc-tasks.json', model: Task, name: 'tasks' },
    { file: '/tmp/mc-apps.json', model: App, name: 'apps' },
    { file: '/tmp/mc-events.json', model: Event, name: 'events' },
    { file: '/tmp/mc-sessions.json', model: OpenclawSession, name: 'openclaw_sessions' },
    { file: '/tmp/mc-snapshots.json', model: AgentSnapshot, name: 'agent_snapshots' },
    { file: '/tmp/mc-activities.json', model: TaskActivity, name: 'task_activities' },
    { file: '/tmp/mc-deliverables.json', model: TaskDeliverable, name: 'task_deliverables' },
  ];

  for (const { file, model, name } of collections) {
    const rows = loadJson(file);
    if (rows.length === 0) continue;

    console.log(`📦 ${name}: ${rows.length} rows`);
    const mapped = rows.map(mapRow);

    try {
      // Use insertMany with ordered:false to skip duplicates
      await (model as any).insertMany(mapped, { ordered: false });
      console.log(`  ✅ Inserted ${mapped.length} documents`);
    } catch (err: any) {
      if (err.code === 11000) {
        const inserted = err.result?.nInserted || err.insertedDocs?.length || 'some';
        console.log(`  ⚠️  Inserted ${inserted} (skipped duplicates)`);
      } else {
        console.error(`  ❌ Error:`, err.message);
      }
    }
  }

  console.log('\n✅ Migration complete!');
  await closeDb();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
