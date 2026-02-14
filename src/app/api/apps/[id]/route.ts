import { NextRequest, NextResponse } from 'next/server';
import { connectDb, App, Agent } from '@/lib/db';
import type { App as AppType, UpdateAppRequest } from '@/lib/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await connectDb();
    const app = await App.findById(id).lean() as any;
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 });
    const result: any = { ...app, id: app._id };
    if (app.current_agent_id) {
      const ag = await Agent.findById(app.current_agent_id).lean() as any;
      if (ag) result.current_agent_name = ag.name;
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch app' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await connectDb();
    const body: UpdateAppRequest = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.path !== undefined) updates.path = body.path;
    if (body.port !== undefined) updates.port = body.port;
    if (body.build_status !== undefined) updates.build_status = body.build_status;
    if (body.progress_completed !== undefined) updates.progress_completed = body.progress_completed;
    if (body.progress_total !== undefined) updates.progress_total = body.progress_total;
    if (body.current_agent_id !== undefined) updates.current_agent_id = body.current_agent_id;

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    await App.findByIdAndUpdate(id, { $set: updates });
    const app = await App.findById(id).lean() as any;
    return NextResponse.json({ ...app, id: app._id });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update app' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await connectDb();
    await App.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete app' }, { status: 500 });
  }
}
