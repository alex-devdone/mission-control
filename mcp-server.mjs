#!/usr/bin/env node
/**
 * Mission Control MCP Server (stdio transport)
 * 
 * Exposes MC task management as MCP tools for AI agents.
 * Connects to MC REST API at MC_URL (default: http://127.0.0.1:17789).
 * 
 * Usage:
 *   node mcp-server.mjs                         # stdio mode
 *   MC_URL=http://host:port node mcp-server.mjs  # custom MC URL
 */

import { createInterface } from 'readline';

const MC_URL = process.env.MC_URL || 'http://127.0.0.1:17789';

// ─── MCP Protocol ───

let initialized = false;

const TOOLS = [
  {
    name: 'mc_create_task',
    description: 'Create a new task in Mission Control. Use before starting significant work (config changes, multi-step requests, coding, system updates). Returns the task ID for tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short task title' },
        description: { type: 'string', description: 'Detailed description of what needs to be done' },
        agent_id: { type: 'string', description: 'Your MC agent UUID' },
        model: { type: 'string', description: 'AI model being used (e.g. anthropic/claude-opus-4-6)' },
        app_id: { type: 'string', description: 'App name or UUID — auto-creates if not found' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Task priority (default: normal)' },
        status: { type: 'string', enum: ['inbox', 'assigned', 'in_progress'], description: 'Initial status (default: in_progress)' }
      },
      required: ['title', 'agent_id']
    }
  },
  {
    name: 'mc_complete_task',
    description: 'Mark a task as completed with a summary and token usage stats. Logs completion activity and moves task to review.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID to complete' },
        summary: { type: 'string', description: 'Summary of what was accomplished' },
        tokens_in: { type: 'number', description: 'Input tokens consumed' },
        tokens_out: { type: 'number', description: 'Output tokens consumed' },
        model: { type: 'string', description: 'AI model used (e.g. anthropic/claude-opus-4-6)' },
        agent_id: { type: 'string', description: 'Your MC agent UUID' }
      },
      required: ['task_id', 'summary', 'agent_id']
    }
  },
  {
    name: 'mc_log_activity',
    description: 'Log progress or notes on a task. Use during long-running work to record milestones.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID' },
        activity_type: { type: 'string', enum: ['progress', 'status_change', 'note', 'error', 'blocked'], description: 'Type of activity' },
        message: { type: 'string', description: 'Activity description' },
        agent_id: { type: 'string', description: 'Your MC agent UUID' },
        metadata: { type: 'object', description: 'Optional metadata (JSON object)' }
      },
      required: ['task_id', 'activity_type', 'message', 'agent_id']
    }
  },
  {
    name: 'mc_get_pending_tasks',
    description: 'Get all in-progress or assigned tasks for an agent. Use on session start to check for unfinished work, or during heartbeats to detect stale tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'MC agent UUID to check tasks for' },
        include_assigned: { type: 'boolean', description: 'Also include assigned (not yet started) tasks (default: true)' }
      },
      required: ['agent_id']
    }
  },
  {
    name: 'mc_get_task',
    description: 'Get full details of a specific task including activities and token usage.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID' }
      },
      required: ['task_id']
    }
  },
  {
    name: 'mc_update_task',
    description: 'Update a task status or fields.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task UUID' },
        status: { type: 'string', enum: ['inbox', 'assigned', 'in_progress', 'testing', 'review', 'done'], description: 'New status' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'New priority' },
        title: { type: 'string', description: 'Updated title' },
        description: { type: 'string', description: 'Updated description' }
      },
      required: ['task_id']
    }
  },
  {
    name: 'mc_list_agents',
    description: 'List all agents registered in Mission Control with their IDs and OpenClaw mappings.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// ─── MC API Client ───

async function mcFetch(path, options = {}) {
  const url = `${MC_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MC API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── App Resolution ───

async function resolveApp(nameOrId) {
  if (!nameOrId) return null;
  const apps = await mcFetch('/api/apps');
  const byId = apps.find(a => (a._id || a.id) === nameOrId);
  if (byId) return byId._id || byId.id;
  const byName = apps.find(a => a.name.toLowerCase() === nameOrId.toLowerCase());
  if (byName) return byName._id || byName.id;
  // Not found — create it
  const slug = nameOrId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const newApp = await mcFetch('/api/apps', {
    method: 'POST',
    body: JSON.stringify({ name: nameOrId, description: 'Auto-created by agent', path: `/apps/${slug}`, workspace_id: 'default' })
  });
  return newApp._id || newApp.id;
}

// ─── Tool Handlers ───

async function handleTool(name, args) {
  switch (name) {
    case 'mc_create_task': {
      const appId = await resolveApp(args.app_id);
      const task = await mcFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: args.title,
          description: args.description || '',
          status: args.status || 'in_progress',
          priority: args.priority || 'normal',
          assigned_agent_id: args.agent_id,
          created_by_agent_id: args.agent_id,
          workspace_id: 'default',
          app_id: appId
        })
      });
      const id = task._id || task.id;
      // Log creation activity with model info
      if (args.model) {
        await mcFetch(`/api/tasks/${id}/activities`, {
          method: 'POST',
          body: JSON.stringify({
            activity_type: 'status_change',
            message: `Task started (model: ${args.model})`,
            agent_id: args.agent_id,
            metadata: { model: args.model }
          })
        });
      }
      return `Task created: ${id}\nTitle: ${args.title}\nModel: ${args.model || 'not specified'}\nStatus: ${args.status || 'in_progress'}`;
    }

    case 'mc_complete_task': {
      const tokensIn = args.tokens_in || 0;
      const tokensOut = args.tokens_out || 0;
      const meta = { tokens_in: tokensIn, tokens_out: tokensOut, total_tokens: tokensIn + tokensOut };
      if (args.model) meta.model = args.model;
      const msg = args.model
        ? `${args.summary} (model: ${args.model}, tokens: ${tokensIn + tokensOut})`
        : args.summary;
      // Log completion activity
      await mcFetch(`/api/tasks/${args.task_id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          activity_type: 'completed', message: msg, agent_id: args.agent_id, metadata: meta
        })
      });
      // Move to review
      await mcFetch(`/api/tasks/${args.task_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'review' })
      });
      return `Task ${args.task_id} completed.\nSummary: ${args.summary}\nModel: ${args.model || 'not specified'}\nTokens: ${tokensIn} in / ${tokensOut} out (${tokensIn + tokensOut} total)`;
    }

    case 'mc_log_activity': {
      await mcFetch(`/api/tasks/${args.task_id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          activity_type: args.activity_type,
          message: args.message,
          agent_id: args.agent_id,
          metadata: args.metadata || null
        })
      });
      return `Activity logged: [${args.activity_type}] ${args.message}`;
    }

    case 'mc_get_pending_tasks': {
      const includeAssigned = args.include_assigned !== false;
      const statuses = includeAssigned ? 'in_progress,assigned' : 'in_progress';
      const tasks = await mcFetch(`/api/tasks?status=${statuses}&assigned_agent_id=${args.agent_id}`);
      if (!tasks.length) return 'No pending tasks.';
      return tasks.map(t => {
        const id = t._id || t.id;
        return `• [${t.status}] ${t.title} (${id})\n  ${t.description || 'No description'}`;
      }).join('\n\n');
    }

    case 'mc_get_task': {
      const task = await mcFetch(`/api/tasks/${args.task_id}`);
      const activities = await mcFetch(`/api/tasks/${args.task_id}/activities`);
      const id = task._id || task.id;
      let result = `Task: ${task.title} (${id})\nStatus: ${task.status} | Priority: ${task.priority}\nDescription: ${task.description || 'None'}`;
      if (activities.length) {
        result += '\n\nActivities:';
        for (const a of activities) {
          result += `\n  [${a.activity_type}] ${a.message}`;
          if (a.metadata?.total_tokens) result += ` (tokens: ${a.metadata.total_tokens})`;
        }
      }
      return result;
    }

    case 'mc_update_task': {
      const body = {};
      if (args.status) body.status = args.status;
      if (args.priority) body.priority = args.priority;
      if (args.title) body.title = args.title;
      if (args.description) body.description = args.description;
      const task = await mcFetch(`/api/tasks/${args.task_id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      return `Task ${args.task_id} updated. Status: ${task.status}`;
    }

    case 'mc_list_agents': {
      const agents = await mcFetch('/api/agents');
      return agents.map(a => {
        const id = a._id || a.id;
        return `• ${a.name} (${id})${a.openclaw_agent_id ? ` → openclaw:${a.openclaw_agent_id}` : ''} [${a.status}]`;
      }).join('\n');
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── JSON-RPC over stdio ───

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      initialized = true;
      respond(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mission-control', version: '1.0.0' }
      });
      break;

    case 'notifications/initialized':
      // no response needed
      break;

    case 'tools/list':
      respond(id, { tools: TOOLS });
      break;

    case 'tools/call': {
      const { name, arguments: args } = params;
      try {
        const result = await handleTool(name, args || {});
        respond(id, { content: [{ type: 'text', text: result }] });
      } catch (err) {
        respond(id, { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
      }
      break;
    }

    case 'ping':
      respond(id, {});
      break;

    default:
      if (id) respondError(id, -32601, `Method not found: ${method}`);
  }
}

// ─── Main ───

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line.trim());
    await handleMessage(msg);
  } catch (err) {
    process.stderr.write(`Parse error: ${err.message}\n`);
  }
});

process.stderr.write(`[mission-control-mcp] ready (MC_URL=${MC_URL})\n`);
