import { NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { App } from '@/lib/types';

/**
 * POST /api/apps/[id]/progress — Recalculate progress from PRD checkmarks
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const app = queryOne<App>('SELECT * FROM apps WHERE id = ?', [id]);
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Try to find PRD file
    const prdPaths = [
      join(app.path, '.ralphy', 'PRD.md'),
      join(app.path, 'PRD.md'),
      join(app.path, 'docs', 'PRD.md'),
    ];

    let prdContent: string | null = null;
    for (const p of prdPaths) {
      if (existsSync(p)) {
        prdContent = readFileSync(p, 'utf-8');
        break;
      }
    }

    if (!prdContent) {
      return NextResponse.json({ 
        app_id: id, 
        progress_completed: app.progress_completed, 
        progress_total: app.progress_total,
        source: 'no_prd' 
      });
    }

    // Count checkmarks
    const checkedPattern = /- \[x\]/gi;
    const uncheckedPattern = /- \[ \]/g;
    
    const completed = (prdContent.match(checkedPattern) || []).length;
    const unchecked = (prdContent.match(uncheckedPattern) || []).length;
    const total = completed + unchecked;

    // Update app
    const now = new Date().toISOString();
    run(
      'UPDATE apps SET progress_completed = ?, progress_total = ?, updated_at = ? WHERE id = ?',
      [completed, total, now, id]
    );

    return NextResponse.json({
      app_id: id,
      progress_completed: completed,
      progress_total: total,
      source: 'prd',
    });
  } catch (error) {
    console.error('Failed to calculate progress:', error);
    return NextResponse.json({ error: 'Failed to calculate progress' }, { status: 500 });
  }
}
