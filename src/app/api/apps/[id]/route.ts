import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import type { App, UpdateAppRequest } from '@/lib/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const app = queryOne<App>(
      `SELECT a.*, ag.name as current_agent_name 
       FROM apps a 
       LEFT JOIN agents ag ON a.current_agent_id = ag.id 
       WHERE a.id = ?`,
      [id]
    );
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 });
    return NextResponse.json(app);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch app' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body: UpdateAppRequest = await req.json();
    const now = new Date().toISOString();
    
    const fields: string[] = [];
    const values: unknown[] = [];
    
    if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
    if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description); }
    if (body.path !== undefined) { fields.push('path = ?'); values.push(body.path); }
    if (body.port !== undefined) { fields.push('port = ?'); values.push(body.port); }
    if (body.build_status !== undefined) { fields.push('build_status = ?'); values.push(body.build_status); }
    if (body.progress_completed !== undefined) { fields.push('progress_completed = ?'); values.push(body.progress_completed); }
    if (body.progress_total !== undefined) { fields.push('progress_total = ?'); values.push(body.progress_total); }
    if (body.current_agent_id !== undefined) { fields.push('current_agent_id = ?'); values.push(body.current_agent_id); }
    
    if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);
    
    run(`UPDATE apps SET ${fields.join(', ')} WHERE id = ?`, values);
    
    const app = queryOne<App>('SELECT * FROM apps WHERE id = ?', [id]);
    return NextResponse.json(app);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update app' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    run('DELETE FROM apps WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete app' }, { status: 500 });
  }
}
