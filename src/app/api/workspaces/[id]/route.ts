import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Workspace, Task, Agent } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await connectDb();
    let workspace = await Workspace.findById(id).lean() as any;
    if (!workspace) workspace = await Workspace.findOne({ slug: id }).lean() as any;
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    return NextResponse.json({ ...workspace, id: workspace._id });
  } catch (error) {
    console.error('Failed to fetch workspace:', error);
    return NextResponse.json({ error: 'Failed to fetch workspace' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await connectDb();
    const body = await request.json();
    const { name, description, icon } = body;

    const existing = await Workspace.findById(id).lean();
    if (!existing) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (icon !== undefined) updates.icon = icon;

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    await Workspace.findByIdAndUpdate(id, { $set: updates });
    const workspace = await Workspace.findById(id).lean() as any;
    return NextResponse.json({ ...workspace, id: workspace._id });
  } catch (error) {
    console.error('Failed to update workspace:', error);
    return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await connectDb();
    if (id === 'default') return NextResponse.json({ error: 'Cannot delete the default workspace' }, { status: 400 });

    const existing = await Workspace.findById(id).lean();
    if (!existing) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const taskCount = await Task.countDocuments({ workspace_id: id });
    const agentCount = await Agent.countDocuments({ workspace_id: id });
    if (taskCount > 0 || agentCount > 0) {
      return NextResponse.json({ error: 'Cannot delete workspace with existing tasks or agents', taskCount, agentCount }, { status: 400 });
    }

    await Workspace.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete workspace:', error);
    return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 });
  }
}
