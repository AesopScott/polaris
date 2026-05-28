#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const POLARIS_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.claude', 'polaris');
const CONFIG_PATH = process.env.POLARIS_CONFIG_PATH || path.join(POLARIS_DIR, 'config.json');
const DONE_STATUSES = new Set(['production', 'complete', 'cancelled', 'failed', 'stalled']);
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json']);
const MAX_RESULTS = 50;

function readJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function safeRead(filePath, maxChars = 12000) {
  try {
    return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').slice(0, maxChars);
  } catch {
    return '';
  }
}

function readConfig() {
  return readJSON(CONFIG_PATH, {}) || {};
}

function configuredProjects() {
  const cfg = readConfig();
  return (cfg.projects || [])
    .filter(project => project && project.name && project.workDir)
    .map(project => ({
      name: project.name,
      workDir: project.workDir,
      repo: project.repo || null,
      obsidianDir: project.obsidianDir || null,
      obsidianSessionsDir: project.obsidianSessionsDir || null,
      mcpServers: Array.isArray(project.mcpServers) ? project.mcpServers : null,
    }));
}

function resolveKnowledgeDir(project, cfg = readConfig()) {
  if (!project.obsidianDir) return null;
  const dir = path.normalize(project.obsidianDir);
  if (path.isAbsolute(dir)) return dir;
  return cfg.obsidianVaultPath ? path.join(cfg.obsidianVaultPath, project.obsidianDir) : null;
}

function readProjectBacklog(project) {
  const backlogPath = path.join(project.workDir, 'docs', 'backlog.json');
  const data = readJSON(backlogPath, null);
  const tasks = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : [];
  return { path: backlogPath, tasks };
}

function summarizeTask(task, projectName) {
  return {
    project: projectName,
    number: task.number ?? task.id ?? null,
    title: task.title || task.name || '',
    status: task.status || 'backlog',
    impact: task.impact || null,
    owner: task.owner || null,
    description: task.description || '',
    objective: task.objective?.statement || null,
  };
}

function activeTasks(tasks) {
  return tasks.filter(task => !DONE_STATUSES.has(String(task.status || 'backlog')));
}

function terms(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_#.-]+/)
    .filter(token => token.length > 2);
}

function taskSearchText(task) {
  return [
    task.title,
    task.name,
    task.description,
    task.status,
    task.impact,
    task.objective?.statement,
    ...(task.objective?.successCriteria || []),
    ...(task.objective?.nonGoals || []),
  ].filter(Boolean).join(' ');
}

function scoreText(queryTerms, text) {
  const haystack = String(text || '').toLowerCase();
  return queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function gitSummary(workDir) {
  try {
    const out = execFileSync('git', ['-C', workDir, 'status', '--short'], {
      encoding: 'utf8',
      timeout: 2500,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = out.split(/\r?\n/).filter(Boolean);
    return { isRepo: true, dirty: lines.length > 0, changedFiles: lines.length };
  } catch {
    return { isRepo: false, dirty: null, changedFiles: null };
  }
}

function listProjects() {
  const cfg = readConfig();
  return configuredProjects().map(project => {
    const { tasks } = readProjectBacklog(project);
    const knowledgeDir = resolveKnowledgeDir(project, cfg);
    return {
      ...project,
      exists: fs.existsSync(project.workDir),
      knowledgeDir,
      knowledgeDirExists: knowledgeDir ? fs.existsSync(knowledgeDir) : false,
      backlogTasks: tasks.length,
      activeTasks: activeTasks(tasks).length,
      git: gitSummary(project.workDir),
    };
  });
}

function getProjectProfile(args = {}) {
  const project = configuredProjects().find(p => p.name.toLowerCase() === String(args.project || '').toLowerCase());
  if (!project) return { error: `Project not found: ${args.project || ''}` };
  const cfg = readConfig();
  const { path: backlogPath, tasks } = readProjectBacklog(project);
  const statuses = {};
  for (const task of tasks) statuses[task.status || 'backlog'] = (statuses[task.status || 'backlog'] || 0) + 1;
  return {
    ...project,
    exists: fs.existsSync(project.workDir),
    backlogPath,
    statuses,
    activeTasks: activeTasks(tasks).map(task => summarizeTask(task, project.name)).slice(0, 20),
    knowledgeDir: resolveKnowledgeDir(project, cfg),
    git: gitSummary(project.workDir),
  };
}

function listActiveTasks(args = {}) {
  const projectFilter = args.project ? String(args.project).toLowerCase() : null;
  const results = [];
  for (const project of configuredProjects()) {
    if (projectFilter && project.name.toLowerCase() !== projectFilter) continue;
    const { tasks } = readProjectBacklog(project);
    for (const task of activeTasks(tasks)) results.push(summarizeTask(task, project.name));
  }
  return { count: results.length, tasks: results.slice(0, Number(args.limit) || MAX_RESULTS) };
}

function searchAllBacklogs(args = {}) {
  const queryTerms = terms(args.query || '');
  const status = args.status ? String(args.status).toLowerCase() : null;
  const projectFilter = args.project ? String(args.project).toLowerCase() : null;
  const limit = Math.min(Number(args.limit) || 25, MAX_RESULTS);
  const matches = [];
  for (const project of configuredProjects()) {
    if (projectFilter && project.name.toLowerCase() !== projectFilter) continue;
    const { tasks } = readProjectBacklog(project);
    for (const task of tasks) {
      if (status && String(task.status || '').toLowerCase() !== status) continue;
      const score = queryTerms.length ? scoreText(queryTerms, taskSearchText(task)) : 1;
      if (score > 0) matches.push({ score, ...summarizeTask(task, project.name) });
    }
  }
  matches.sort((a, b) => b.score - a.score || String(a.project).localeCompare(String(b.project)));
  return { count: matches.length, matches: matches.slice(0, limit) };
}

function findRelatedTasks(args = {}) {
  const projectName = String(args.project || '');
  const taskNumber = String(args.taskNumber || args.number || '');
  const sourceProject = configuredProjects().find(p => p.name.toLowerCase() === projectName.toLowerCase());
  if (!sourceProject) return { error: `Project not found: ${projectName}` };
  const sourceTasks = readProjectBacklog(sourceProject).tasks;
  const sourceTask = sourceTasks.find(task => String(task.number ?? task.id ?? '') === taskNumber);
  if (!sourceTask) return { error: `Task not found: ${projectName} #${taskNumber}` };
  const queryTerms = [...new Set(terms(taskSearchText(sourceTask)))].slice(0, 30);
  const matches = [];
  for (const project of configuredProjects()) {
    const { tasks } = readProjectBacklog(project);
    for (const task of tasks) {
      if (project.name === sourceProject.name && task === sourceTask) continue;
      const score = scoreText(queryTerms, taskSearchText(task));
      if (score > 1) matches.push({ score, ...summarizeTask(task, project.name) });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return { source: summarizeTask(sourceTask, sourceProject.name), related: matches.slice(0, Number(args.limit) || 15) };
}

function getCrossProjectStatus() {
  const projects = listProjects();
  const totals = projects.reduce((acc, project) => {
    acc.projects += 1;
    acc.backlogTasks += project.backlogTasks;
    acc.activeTasks += project.activeTasks;
    if (project.git.dirty) acc.dirtyProjects += 1;
    return acc;
  }, { projects: 0, backlogTasks: 0, activeTasks: 0, dirtyProjects: 0 });
  return { totals, projects };
}

function walkTextFiles(root, limit = 120) {
  const files = [];
  const stack = [root];
  while (stack.length && files.length < limit) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') stack.push(full);
      if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
      if (files.length >= limit) break;
    }
  }
  return files;
}

function searchProjectKnowledge(args = {}) {
  const queryTerms = terms(args.query || '');
  if (!queryTerms.length) return { error: 'query is required' };
  const requested = Array.isArray(args.projects) ? args.projects.map(p => String(p).toLowerCase()) : null;
  const limit = Math.min(Number(args.limit) || 20, MAX_RESULTS);
  const cfg = readConfig();
  const matches = [];
  for (const project of configuredProjects()) {
    if (requested && !requested.includes(project.name.toLowerCase())) continue;
    const roots = [path.join(project.workDir, 'docs')];
    const knowledgeDir = resolveKnowledgeDir(project, cfg);
    if (knowledgeDir) roots.push(knowledgeDir);
    for (const root of roots.filter(Boolean)) {
      if (!fs.existsSync(root)) continue;
      for (const filePath of walkTextFiles(root, 80)) {
        const text = safeRead(filePath, 20000);
        const score = scoreText(queryTerms, text);
        if (score <= 0) continue;
        const idx = Math.max(0, text.toLowerCase().indexOf(queryTerms[0]) - 160);
        matches.push({
          score,
          project: project.name,
          path: filePath,
          excerpt: text.slice(idx, idx + 420).replace(/\s+/g, ' ').trim(),
        });
      }
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return { count: matches.length, matches: matches.slice(0, limit) };
}

const tools = [
  {
    name: 'listProjects',
    description: 'List Polaris projects with work directories, backlog counts, knowledge folders, and git summaries.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getProjectProfile',
    description: 'Get one project profile including active tasks, backlog status counts, knowledge folder, and git summary.',
    inputSchema: {
      type: 'object',
      properties: { project: { type: 'string', description: 'Polaris project name' } },
      required: ['project'],
    },
  },
  {
    name: 'listActiveTasks',
    description: 'List active backlog tasks across all projects, optionally filtered by project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project name' },
        limit: { type: 'number', description: 'Maximum tasks to return' },
      },
      required: [],
    },
  },
  {
    name: 'searchAllBacklogs',
    description: 'Search backlog tasks across every configured Polaris project.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
        status: { type: 'string', description: 'Optional exact task status filter' },
        project: { type: 'string', description: 'Optional project filter' },
        limit: { type: 'number', description: 'Maximum matches to return' },
      },
      required: ['query'],
    },
  },
  {
    name: 'findRelatedTasks',
    description: 'Find tasks in other projects that look related to a specific backlog task.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Source project name' },
        taskNumber: { type: 'string', description: 'Source task number' },
        limit: { type: 'number', description: 'Maximum related tasks to return' },
      },
      required: ['project', 'taskNumber'],
    },
  },
  {
    name: 'getCrossProjectStatus',
    description: 'Summarize backlog and git status across all configured Polaris projects.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'searchProjectKnowledge',
    description: 'Search project docs and Obsidian knowledge folders across projects.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
        projects: { type: 'array', items: { type: 'string' }, description: 'Optional project names' },
        limit: { type: 'number', description: 'Maximum matches to return' },
      },
      required: ['query'],
    },
  },
];

const server = new Server(
  { name: 'polaris-context', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args = {} } = request.params;
  try {
    const handlers = {
      listProjects,
      getProjectProfile,
      listActiveTasks,
      searchAllBacklogs,
      findRelatedTasks,
      getCrossProjectStatus,
      searchProjectKnowledge,
    };
    const handler = handlers[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    const result = handler(args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[polaris-context] MCP server started');
}

start().catch(error => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
