import { NextResponse } from 'next/server';
import { connectDb, App } from '@/lib/db';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { App as AppType } from '@/lib/types';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await connectDb();
    const app = await App.findById(id).lean() as any;
    if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 });

    const prdPaths = [
      join(app.path, '.ralphy', 'PRD.md'),
      join(app.path, 'PRD.md'),
      join(app.path, 'docs', 'PRD.md'),
    ];

    let prdContent: string | null = null;
    for (const p of prdPaths) {
      if (existsSync(p)) { prdContent = readFileSync(p, 'utf-8'); break; }
    }

    if (!prdContent) {
      return NextResponse.json({
        app_id: id, progress_completed: app.progress_completed,
        progress_total: app.progress_total, source: 'no_prd'
      });
    }

    const completed = (prdContent.match(/- \[x\]/gi) || []).length;
    const unchecked = (prdContent.match(/- \[ \]/g) || []).length;
    const total = completed + unchecked;

    await App.findByIdAndUpdate(id, { $set: { progress_completed: completed, progress_total: total } });

    return NextResponse.json({ app_id: id, progress_completed: completed, progress_total: total, source: 'prd' });
  } catch (error) {
    console.error('Failed to calculate progress:', error);
    return NextResponse.json({ error: 'Failed to calculate progress' }, { status: 500 });
  }
}
