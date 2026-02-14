import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { connectDb, Task, TaskDeliverable, TaskActivity } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import * as csstree from 'css-tree';
import type { Task as TaskType, TaskDeliverable as TaskDeliverableType } from '@/lib/types';

interface CssValidationError { message: string; line?: number; column?: number; }
interface ResourceError { type: 'image' | 'script' | 'stylesheet' | 'link' | 'other'; url: string; error: string; }
interface TestResult {
  passed: boolean;
  deliverable: { id: string; title: string; path: string; type: 'file' | 'url'; };
  httpStatus: number | null;
  consoleErrors: string[];
  consoleWarnings: string[];
  cssErrors: CssValidationError[];
  resourceErrors: ResourceError[];
  screenshotPath: string | null;
  duration: number;
  error?: string;
}

const SCREENSHOTS_DIR = ((process.env.PROJECTS_PATH || '~/projects').replace(/^~/, process.env.HOME || '')) + '/.screenshots';

function validateCss(css: string): CssValidationError[] {
  const errors: CssValidationError[] = [];
  try {
    csstree.parse(css, {
      parseAtrulePrelude: false, parseRulePrelude: false, parseValue: false,
      onParseError: (error) => { errors.push({ message: error.rawMessage || error.message }); }
    });
  } catch (error) {
    errors.push({ message: `CSS parse error: ${error instanceof Error ? error.message : String(error)}` });
  }
  return errors;
}

function extractAndValidateCss(htmlContent: string): CssValidationError[] {
  const errors: CssValidationError[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleRegex.exec(htmlContent)) !== null) {
    errors.push(...validateCss(match[1]));
  }
  return errors;
}

function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

async function testDeliverable(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  deliverable: any,
  taskId: string
): Promise<TestResult> {
  const startTime = Date.now();
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const resourceErrors: ResourceError[] = [];
  let cssErrors: CssValidationError[] = [];
  let httpStatus: number | null = null;
  let screenshotPath: string | null = null;

  const isUrlDeliverable = deliverable.deliverable_type === 'url';
  const testPath = deliverable.path || '';

  try {
    if (!isUrlDeliverable) {
      if (!testPath || !existsSync(testPath)) {
        return {
          passed: false, deliverable: { id: deliverable._id, title: deliverable.title, path: testPath || 'unknown', type: 'file' },
          httpStatus: null, consoleErrors: [`File does not exist: ${testPath}`], consoleWarnings: [],
          cssErrors: [], resourceErrors: [], screenshotPath: null, duration: Date.now() - startTime, error: 'File not found'
        };
      }
      if (!testPath.endsWith('.html') && !testPath.endsWith('.htm')) {
        return {
          passed: true, deliverable: { id: deliverable._id, title: deliverable.title, path: testPath, type: 'file' },
          httpStatus: null, consoleErrors: [], consoleWarnings: [], cssErrors: [], resourceErrors: [],
          screenshotPath: null, duration: Date.now() - startTime, error: 'Skipped - not an HTML file'
        };
      }
      cssErrors = extractAndValidateCss(readFileSync(testPath, 'utf-8'));
    }

    let testUrl: string;
    if (isUrlDeliverable) {
      testUrl = isHttpUrl(testPath) ? testPath : (existsSync(testPath) ? `file://${testPath}` : '');
      if (!testUrl) {
        return {
          passed: false, deliverable: { id: deliverable._id, title: deliverable.title, path: testPath, type: 'url' },
          httpStatus: null, consoleErrors: [`URL path does not exist: ${testPath}`], consoleWarnings: [],
          cssErrors: [], resourceErrors: [], screenshotPath: null, duration: Date.now() - startTime, error: 'Path not found'
        };
      }
    } else {
      testUrl = `file://${testPath}`;
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); else if (msg.type() === 'warning') consoleWarnings.push(msg.text()); });
    page.on('pageerror', error => { consoleErrors.push(`Page error: ${error.message}`); });
    page.on('requestfailed', request => {
      const url = request.url();
      const failure = request.failure();
      const rt = request.resourceType();
      let type: ResourceError['type'] = 'other';
      if (rt === 'image') type = 'image'; else if (rt === 'script') type = 'script';
      else if (rt === 'stylesheet') type = 'stylesheet'; else if (rt === 'document') type = 'link';
      resourceErrors.push({ type, url, error: failure?.errorText || 'Request failed' });
    });

    const response = await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 });
    httpStatus = response?.status() || null;
    if (isHttpUrl(testUrl) && httpStatus && (httpStatus < 200 || httpStatus >= 400)) {
      consoleErrors.push(`HTTP error: Server returned status ${httpStatus}`);
    }
    await page.waitForTimeout(1000);
    const screenshotFilename = `${taskId}-${deliverable._id}-${Date.now()}.png`;
    screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFilename);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await context.close();

    const passed = consoleErrors.length === 0 && cssErrors.length === 0 && resourceErrors.length === 0;
    return {
      passed, deliverable: { id: deliverable._id, title: deliverable.title, path: testPath, type: isUrlDeliverable ? 'url' : 'file' },
      httpStatus, consoleErrors, consoleWarnings, cssErrors, resourceErrors, screenshotPath, duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      passed: false, deliverable: { id: deliverable._id, title: deliverable.title, path: testPath || 'unknown', type: isUrlDeliverable ? 'url' : 'file' },
      httpStatus, consoleErrors: [...consoleErrors, `Test error: ${error}`], consoleWarnings,
      cssErrors, resourceErrors, screenshotPath, duration: Date.now() - startTime, error: String(error)
    };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDb();
    const { id: taskId } = await params;
    const task = await Task.findById(taskId).lean() as any;
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const deliverables = await TaskDeliverable.find({
      task_id: taskId, deliverable_type: { $in: ['file', 'url'] }
    }).lean() as any[];

    if (deliverables.length === 0) {
      return NextResponse.json({ error: 'No testable deliverables found (file or url types)' }, { status: 400 });
    }

    if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const results: TestResult[] = [];
    for (const deliverable of deliverables) {
      results.push(await testDeliverable(browser, deliverable, taskId));
    }
    await browser.close();

    const passed = results.every(r => r.passed);
    const failedCount = results.filter(r => !r.passed).length;
    let summary: string;
    if (passed) {
      summary = `All ${results.length} deliverable(s) passed automated testing.`;
    } else {
      const issues = results.filter(r => !r.passed).map(r => {
        const et: string[] = [];
        if (r.consoleErrors.length > 0) et.push(`${r.consoleErrors.length} JS errors`);
        if (r.cssErrors.length > 0) et.push(`${r.cssErrors.length} CSS errors`);
        if (r.resourceErrors.length > 0) et.push(`${r.resourceErrors.length} broken resources`);
        return `${r.deliverable.title}: ${et.join(', ')}`;
      });
      summary = `${failedCount}/${results.length} deliverable(s) failed. Issues: ${issues.join('; ')}`;
    }

    const now = new Date().toISOString();
    await TaskActivity.create({
      _id: uuidv4(), task_id: taskId,
      activity_type: passed ? 'test_passed' : 'test_failed',
      message: passed ? `Automated test passed - ${results.length} deliverable(s) verified` : `Automated test failed - ${summary}`,
      metadata: { results: results.map(r => ({ deliverable: r.deliverable.title, type: r.deliverable.type, passed: r.passed, consoleErrors: r.consoleErrors.length, cssErrors: r.cssErrors.length, resourceErrors: r.resourceErrors.length, screenshot: r.screenshotPath })) },
      created_at: now,
    });

    let newStatus: string | undefined;
    if (passed) {
      await Task.findByIdAndUpdate(taskId, { $set: { status: 'review' } });
      newStatus = 'review';
      await TaskActivity.create({ _id: uuidv4(), task_id: taskId, activity_type: 'status_changed', message: 'Task moved to REVIEW - automated tests passed', created_at: now });
    } else {
      await Task.findByIdAndUpdate(taskId, { $set: { status: 'assigned' } });
      newStatus = 'assigned';
      await TaskActivity.create({ _id: uuidv4(), task_id: taskId, activity_type: 'status_changed', message: 'Task moved back to ASSIGNED due to failed tests', created_at: now });
    }

    return NextResponse.json({ taskId, taskTitle: task.title, passed, results, summary, testedAt: now, newStatus });
  } catch (error) {
    console.error('Test execution error:', error);
    return NextResponse.json({ error: 'Test execution failed', details: String(error) }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDb();
  const { id: taskId } = await params;
  const task = await Task.findById(taskId).lean() as any;
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const deliverables = await TaskDeliverable.find({
    task_id: taskId, deliverable_type: { $in: ['file', 'url'] }
  }).lean() as any[];

  const fileDeliverables = deliverables.filter(d => d.deliverable_type === 'file');
  const urlDeliverables = deliverables.filter(d => d.deliverable_type === 'url');

  return NextResponse.json({
    taskId, taskTitle: task.title, taskStatus: task.status, deliverableCount: deliverables.length,
    testableFiles: fileDeliverables.filter(d => d.path?.endsWith('.html') || d.path?.endsWith('.htm')).map(d => ({ id: d._id, title: d.title, path: d.path })),
    testableUrls: urlDeliverables.map(d => ({ id: d._id, title: d.title, path: d.path })),
    validations: ['JavaScript console error detection', 'CSS syntax validation', 'Resource loading validation', 'HTTP status code validation'],
    workflow: { expectedStatus: 'testing', onPass: 'Moves to review', onFail: 'Moves to assigned' },
    usage: { method: 'POST', description: 'Run automated browser tests on all HTML/URL deliverables' }
  });
}
