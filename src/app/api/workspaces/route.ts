import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Workspace, Task, Agent } from '@/lib/db';
import type { Workspace as WorkspaceType, WorkspaceStats, TaskStatus } from '@/lib/types';

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(request: NextRequest) {
  const includeStats = request.nextUrl.searchParams.get('stats') === 'true';

  try {
    await connectDb();

    if (includeStats) {
      const workspaces = await Workspace.find({}).sort({ name: 1 }).lean() as any[];
      const stats: WorkspaceStats[] = [];

      for (const workspace of workspaces) {
        const tasks = await Task.find({ workspace_id: workspace._id }).lean() as any[];
        const counts: WorkspaceStats['taskCounts'] = {
          planning: 0, inbox: 0, assigned: 0, in_progress: 0,
          testing: 0, review: 0, done: 0, total: 0
        };
        for (const t of tasks) {
          if (t.status in counts) (counts as any)[t.status]++;
          counts.total++;
        }

        const agentCount = await Agent.countDocuments({ workspace_id: workspace._id });
        stats.push({
          id: workspace._id, name: workspace.name, slug: workspace.slug,
          icon: workspace.icon, taskCounts: counts, agentCount,
        });
      }
      return NextResponse.json(stats);
    }

    const workspaces = await Workspace.find({}).sort({ name: 1 }).lean() as any[];
    return NextResponse.json(workspaces.map(w => ({ ...w, id: w._id })));
  } catch (error) {
    console.error('Failed to fetch workspaces:', error);
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDb();
    const body = await request.json();
    const { name, description, icon } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const slug = generateSlug(name);

    const existing = await Workspace.findOne({ slug }).lean();
    if (existing) return NextResponse.json({ error: 'A workspace with this name already exists' }, { status: 400 });

    await Workspace.create({ _id: id, name: name.trim(), slug, description: description || null, icon: icon || '📁' });
    const workspace = await Workspace.findById(id).lean() as any;
    return NextResponse.json({ ...workspace, id: workspace._id }, { status: 201 });
  } catch (error) {
    console.error('Failed to create workspace:', error);
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 });
  }
}
