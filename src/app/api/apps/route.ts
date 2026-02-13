import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { App, CreateAppRequest } from '@/lib/types';
import { broadcast } from '@/lib/events';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';
    
    const apps = queryAll<App>(
      `SELECT a.*, ag.name as current_agent_name 
       FROM apps a 
       LEFT JOIN agents ag ON a.current_agent_id = ag.id 
       WHERE a.workspace_id = ?
       ORDER BY a.updated_at DESC`,
      [workspaceId]
    );
    
    return NextResponse.json(apps);
  } catch (error) {
    console.error('Error fetching apps:', error);
    return NextResponse.json({ error: 'Failed to fetch apps' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateAppRequest = await req.json();
    const id = uuidv4();
    const now = new Date().toISOString();
    
    run(
      `INSERT INTO apps (id, name, description, path, port, workspace_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, body.name, body.description || null, body.path, body.port || null, body.workspace_id || 'default', now, now]
    );
    
    const app = queryOne<App>('SELECT * FROM apps WHERE id = ?', [id]);
    
    if (app) {
      broadcast({ type: 'task_created', payload: app as unknown as import('@/lib/types').Task });
    }
    
    return NextResponse.json(app, { status: 201 });
  } catch (error) {
    console.error('Error creating app:', error);
    return NextResponse.json({ error: 'Failed to create app' }, { status: 500 });
  }
}
