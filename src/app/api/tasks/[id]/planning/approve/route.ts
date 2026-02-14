import { NextRequest, NextResponse } from 'next/server';
import { connectDb, Task, PlanningQuestion, PlanningSpec, TaskActivity } from '@/lib/db';
import type { PlanningQuestion as PlanningQuestionType, PlanningCategory } from '@/lib/types';

function generateSpecMarkdown(task: { title: string; description?: string }, questions: PlanningQuestionType[]): string {
  const lines: string[] = [];
  lines.push(`# ${task.title}`, '', '**Status:** SPEC LOCKED ✅', '');
  if (task.description) { lines.push('## Original Request', task.description, ''); }

  const byCategory = questions.reduce((acc, q) => {
    if (!acc[q.category]) acc[q.category] = [];
    acc[q.category].push(q);
    return acc;
  }, {} as Record<string, PlanningQuestionType[]>);

  const categoryLabels: Record<PlanningCategory, string> = {
    goal: '🎯 Goal & Success Criteria', audience: '👥 Target Audience', scope: '📋 Scope',
    design: '🎨 Design & Visual', content: '📝 Content', technical: '⚙️ Technical Requirements',
    timeline: '📅 Timeline', constraints: '⚠️ Constraints'
  };
  const categoryOrder: PlanningCategory[] = ['goal', 'audience', 'scope', 'design', 'content', 'technical', 'timeline', 'constraints'];

  for (const category of categoryOrder) {
    const cq = byCategory[category];
    if (!cq || cq.length === 0) continue;
    lines.push(`## ${categoryLabels[category]}`, '');
    for (const q of cq) {
      if (q.answer) { lines.push(`**${q.question}**`, `> ${q.answer}`, ''); }
    }
  }

  lines.push('---', `*Spec locked at ${new Date().toISOString()}*`);
  return lines.join('\n');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  try {
    await connectDb();
    const task = await Task.findById(taskId).lean() as any;
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const existingSpec = await PlanningSpec.findOne({ task_id: taskId }).lean();
    if (existingSpec) return NextResponse.json({ error: 'Spec already locked' }, { status: 400 });

    const questions = await PlanningQuestion.find({ task_id: taskId }).sort({ sort_order: 1 }).lean() as any[];
    const unanswered = questions.filter((q: any) => !q.answer);
    if (unanswered.length > 0) {
      return NextResponse.json({ error: 'All questions must be answered before locking', unanswered: unanswered.length }, { status: 400 });
    }

    const parsedQuestions = questions.map((q: any) => ({
      ...q, id: q._id,
      options: q.options ? JSON.parse(q.options) : undefined,
    }));

    const specMarkdown = generateSpecMarkdown(task, parsedQuestions);
    const specId = crypto.randomUUID();

    await PlanningSpec.create({
      _id: specId, task_id: taskId, spec_markdown: specMarkdown,
      locked_at: new Date().toISOString(),
    });

    await Task.findByIdAndUpdate(taskId, {
      $set: { description: specMarkdown, status: 'inbox' }
    });

    await TaskActivity.create({
      _id: crypto.randomUUID(), task_id: taskId,
      activity_type: 'status_changed',
      message: 'Planning complete - spec locked and moved to inbox',
    });

    const spec = await PlanningSpec.findById(specId).lean() as any;
    return NextResponse.json({ success: true, spec: { ...spec, id: spec._id }, specMarkdown });
  } catch (error) {
    console.error('Failed to approve spec:', error);
    return NextResponse.json({ error: 'Failed to approve spec' }, { status: 500 });
  }
}
