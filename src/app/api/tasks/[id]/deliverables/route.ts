import { NextRequest, NextResponse } from 'next/server';
import { connectDb, TaskDeliverable } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { existsSync } from 'fs';
import type { TaskDeliverable as TaskDeliverableType } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDb();
    const taskId = params.id;
    const deliverables = await TaskDeliverable.find({ task_id: taskId }).sort({ created_at: -1 }).lean() as any[];
    const result = deliverables.map((d: any) => ({ ...d, id: d._id }));
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching deliverables:', error);
    return NextResponse.json({ error: 'Failed to fetch deliverables' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDb();
    const taskId = params.id;
    const body = await request.json();
    const { deliverable_type, title, path, description } = body;

    if (!deliverable_type || !title) {
      return NextResponse.json({ error: 'deliverable_type and title are required' }, { status: 400 });
    }

    let fileExists = true;
    let normalizedPath = path;
    if (deliverable_type === 'file' && path) {
      normalizedPath = path.replace(/^~/, process.env.HOME || '');
      fileExists = existsSync(normalizedPath);
      if (!fileExists) console.warn(`[DELIVERABLE] Warning: File does not exist: ${normalizedPath}`);
    }

    const id = crypto.randomUUID();
    await TaskDeliverable.create({
      _id: id, task_id: taskId, deliverable_type, title, path: path || null, description: description || null,
    });

    const deliverable = await TaskDeliverable.findById(id).lean() as any;
    const result = { ...deliverable, id: deliverable._id };

    broadcast({ type: 'deliverable_added', payload: result as TaskDeliverableType });

    if (deliverable_type === 'file' && !fileExists) {
      return NextResponse.json(
        { ...result, warning: `File does not exist at path: ${normalizedPath}. Please create the file.` },
        { status: 201 }
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating deliverable:', error);
    return NextResponse.json({ error: 'Failed to create deliverable' }, { status: 500 });
  }
}
