#!/usr/bin/env node
/**
 * Mission Control CLI — quick task management from the command line.
 * 
 * Usage:
 *   mc-cli.mjs create <agent_id> "Title" ["Description"]
 *   mc-cli.mjs complete <agent_id> <task_id> "Summary" [tokens_in] [tokens_out]
 *   mc-cli.mjs activity <agent_id> <task_id> <type> "Message"
 *   mc-cli.mjs pending <agent_id>
 *   mc-cli.mjs get <task_id>
 *   mc-cli.mjs agents
 *
 * Env: MC_URL (default: http://127.0.0.1:17789)
 */

const MC_URL = process.env.MC_URL || 'http://127.0.0.1:17789';

async function mc(path, opts = {}) {
  const res = await fetch(`${MC_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers }
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// Resolve app by name or ID — creates if not found
async function resolveApp(nameOrId) {
  if (!nameOrId) return null;
  const apps = await mc('/api/apps');
  // Try match by ID first
  const byId = apps.find(a => (a._id || a.id) === nameOrId);
  if (byId) return byId._id || byId.id;
  // Try match by name (case-insensitive)
  const byName = apps.find(a => a.name.toLowerCase() === nameOrId.toLowerCase());
  if (byName) return byName._id || byName.id;
  // Not found — create it
  const slug = nameOrId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const newApp = await mc('/api/apps', { method: 'POST', body: JSON.stringify({
    name: nameOrId, description: 'Auto-created by agent', path: `/apps/${slug}`, workspace_id: 'default'
  })});
  const id = newApp._id || newApp.id;
  process.stderr.write(`Created app "${nameOrId}" (${id})\n`);
  return id;
}

const [,, cmd, ...args] = process.argv;

try {
  switch (cmd) {
    case 'create': {
      const [agentId, title, desc, model, appName] = args;
      if (!agentId || !title) { console.error('Usage: create <agent_id> "Title" ["Description"] ["model"] ["app_name_or_id"]'); process.exit(1); }
      const appId = await resolveApp(appName);
      const t = await mc('/api/tasks', { method: 'POST', body: JSON.stringify({
        title, description: desc || '', status: 'in_progress', priority: 'normal',
        assigned_agent_id: agentId, created_by_agent_id: agentId, workspace_id: 'default',
        app_id: appId
      })});
      const taskId = t._id || t.id;
      // Log creation activity with model info
      if (model) {
        await mc(`/api/tasks/${taskId}/activities`, { method: 'POST', body: JSON.stringify({
          activity_type: 'status_change', message: `Task started (model: ${model})`,
          agent_id: agentId, metadata: { model }
        })});
      }
      console.log(taskId);
      break;
    }
    case 'complete': {
      const [agentId, taskId, summary, tokIn, tokOut, model] = args;
      if (!taskId || !summary) { console.error('Usage: complete <agent_id> <task_id> "Summary" [tokens_in] [tokens_out] ["model"]'); process.exit(1); }
      const ti = parseInt(tokIn) || 0, to = parseInt(tokOut) || 0;
      const meta = { tokens_in: ti, tokens_out: to, total_tokens: ti + to };
      if (model) meta.model = model;
      const msg = model ? `${summary} (model: ${model}, tokens: ${ti + to})` : summary;
      await mc(`/api/tasks/${taskId}/activities`, { method: 'POST', body: JSON.stringify({
        activity_type: 'completed', message: msg, agent_id: agentId, metadata: meta
      })});
      await mc(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status: 'review' }) });
      console.log('OK');
      break;
    }
    case 'activity': {
      const [agentId, taskId, type, msg] = args;
      if (!taskId || !type || !msg) { console.error('Usage: activity <agent_id> <task_id> <type> "Message"'); process.exit(1); }
      await mc(`/api/tasks/${taskId}/activities`, { method: 'POST', body: JSON.stringify({
        activity_type: type, message: msg, agent_id: agentId
      })});
      console.log('OK');
      break;
    }
    case 'pending': {
      const [agentId] = args;
      if (!agentId) { console.error('Usage: pending <agent_id>'); process.exit(1); }
      const tasks = await mc(`/api/tasks?status=in_progress,assigned&assigned_agent_id=${agentId}`);
      if (!tasks.length) { console.log('No pending tasks.'); break; }
      for (const t of tasks) console.log(`${t._id || t.id} | ${t.status} | ${t.title}`);
      break;
    }
    case 'get': {
      const [taskId] = args;
      if (!taskId) { console.error('Usage: get <task_id>'); process.exit(1); }
      const task = await mc(`/api/tasks/${taskId}`);
      const acts = await mc(`/api/tasks/${taskId}/activities`);
      console.log(JSON.stringify({ ...task, activities: acts }, null, 2));
      break;
    }
    case 'agents': {
      const agents = await mc('/api/agents');
      for (const a of agents) {
        const id = a._id || a.id;
        console.log(`${id} | ${a.name}${a.openclaw_agent_id ? ` (${a.openclaw_agent_id})` : ''} | ${a.status}`);
      }
      break;
    }
    default:
      console.error('Commands: create, complete, activity, pending, get, agents');
      process.exit(1);
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
