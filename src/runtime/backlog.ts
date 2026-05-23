/**
 * @module backlog
 * Task backlog management for Polaris — CRUD, status lifecycle, and archiving.
 *
 * Manages both the global Obsidian-vault backlog and per-project backlogs
 * (docs/backlog.json). Archive files (backlog-archive.json) hold production
 * and cancelled tasks to keep active backlogs lean.
 *
 * Cache: loadAllBacklogs() caches for BACKLOG_CACHE_TTL_MS; invalidated on
 * any write. Auto-commit: writes to per-project backlogs trigger an async
 * non-blocking git commit (failure is logged, not re-thrown).
 *
 * Dependencies: Node fs/path
 *
 * Topology: contracts ← backlog ← WebSocket adapter
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ProofUnit } from './contracts';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Cache TTL for loadAllBacklogs() — short to keep the UI responsive. */
export const BACKLOG_CACHE_TTL_MS = 5000;

/** Canonical set of valid task status strings (skill-driven + manual + legacy). */
export const VALID_BACKLOG_STATUSES = new Set([
  // Skill lifecycle: plan-task → start-build → finish-build → codex-review → promote-stage → promote-to-prod
  'backlog', 'planned', 'build-started', 'build-finished', 'cba-complete', 'review-blocked', 'staged', 'production',
  // Manual: set when smoke tests fail after production deployment
  'failed-smoke-test',
  // State machine statuses written by LangGraph executor (task #26)
  'stalled', 'failed',
  // Special states
  'blocked', 'on-hold', 'cancelled',
  // Legacy/deprecated — still accepted for backward compatibility
  'ready', 'in-progress', 'complete', 'pr-reviewed', 'cba-half-complete', 'smoke-tested',
]);

/** Status values that set completed_at. */
const TERMINAL_STATUSES = new Set(['production', 'cancelled', 'done', 'complete']);

/** Fields allowed in updateBacklogTask() patch. */
const UPDATABLE_FIELDS = ['title', 'description', 'category', 'priority', 'impact'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type BacklogScope = 'global' | string;  // 'global' or a project name

export type BacklogStatus =
  | 'backlog' | 'planned' | 'build-started' | 'build-finished'
  | 'cba-complete' | 'review-blocked' | 'staged' | 'production'
  | 'failed-smoke-test' | 'stalled' | 'failed'
  | 'blocked' | 'on-hold' | 'cancelled'
  | 'ready' | 'in-progress' | 'complete' | 'pr-reviewed'
  | 'cba-half-complete' | 'smoke-tested';

export type ImpactLevel = 'minor' | 'standard' | 'major';

export interface BacklogTask {
  number: number;
  title: string;
  description: string;
  category: string;
  priority: number;
  impact: ImpactLevel;
  status: BacklogStatus;
  created_at: string;
  completed_at: string | null;
  dependencies: number[];
  scope?: string;
  branch?: string;
  pr_url?: string;
  plan?: string;
  proofUnits?: ProofUnit[];
  [key: string]: any;
}

export interface ProjectBacklogEntry {
  name: string;
  workDir: string;
  backlog: { tasks: BacklogTask[] } | null;
}

export interface ProjectArchiveEntry {
  name: string;
  workDir: string;
  archive: { tasks: BacklogTask[] } | null;
}

export interface AllBacklogsResult {
  global: { tasks: BacklogTask[] } | null;
  projects: ProjectBacklogEntry[];
  archive: {
    global: { tasks: BacklogTask[] } | null;
    projects: ProjectArchiveEntry[];
  };
}

export interface AddTaskInput {
  title: string;
  description?: string;
  category?: string;
  priority?: number | string;
  impact?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  category?: string;
  priority?: number | string;
  impact?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME STATE
// ─────────────────────────────────────────────────────────────────────────────

let _backlogCache: AllBacklogsResult | null = null;
let _backlogCacheAt = 0;

// Injected at init
let _readConfig: () => Record<string, any>;
let _exec: typeof import('child_process').exec;
let _broadcast: (msg: object) => void;

export function initBacklog(opts: {
  readConfig: () => Record<string, any>;
  exec: typeof import('child_process').exec;
  broadcast: (msg: object) => void;
}): void {
  _readConfig = opts.readConfig;
  _exec = opts.exec;
  _broadcast = opts.broadcast;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Validate and normalise an impact string. */
export function _validImpact(v: any): ImpactLevel {
  const s = String(v || '').trim();
  return (['minor', 'standard', 'major'] as ImpactLevel[]).includes(s as ImpactLevel)
    ? (s as ImpactLevel)
    : 'standard';
}

/** Compute the next task number across current + archived tasks. */
export function _nextBacklogTaskNumber(
  currentTasks: BacklogTask[],
  archivedTasks: BacklogTask[]
): number {
  const all = [
    ...(Array.isArray(currentTasks) ? currentTasks : []),
    ...(Array.isArray(archivedTasks) ? archivedTasks : []),
  ];
  if (all.length === 0) return 1;
  return all.reduce((max, t) => Math.max(max, t.number || 0), 0) + 1;
}

/** Strip UTF-8 BOM (PowerShell adds it by default) then JSON.parse. */
function _readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
}

/**
 * Non-blocking git commit of backlog changes.
 * Failure is logged, not re-thrown — the file is already written.
 */
export function _autoCommitBacklog(repoDir: string, taskNumber: number | null, verbOverride?: string): void {
  const verb = verbOverride || ('add task #' + taskNumber);
  _exec(
    `git add docs/backlog.json && git commit -m "chore(backlog): ${verb} from Polaris"`,
    { cwd: repoDir, timeout: 5000 },
    (err) => {
      if (err) console.error('[backlog] auto-commit failed:', err.message);
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────────────────────────────

/** Invalidate the loadAllBacklogs() cache. */
export function invalidateBacklogCache(): void {
  _backlogCache = null;
  _backlogCacheAt = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCAFFOLD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure docs/backlog.json exists for a project. Returns the path.
 * Optionally broadcasts backlog-scaffolded and auto-commits.
 */
export function ensureProjectBacklogFile(
  project: { name?: string; workDir?: string },
  opts: { broadcast?: boolean; commit?: boolean } = {}
): string | null {
  const { name, workDir } = project;
  if (!workDir) return null;
  const docsDir = path.join(workDir, 'docs');
  const backlogPath = path.join(docsDir, 'backlog.json');
  if (fs.existsSync(backlogPath)) return backlogPath;

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(backlogPath, JSON.stringify({ tasks: [] }, null, 2) + '\n', 'utf8');
  console.log(`[scaffold-backlog] wrote ${backlogPath} for ${name || workDir}`);
  if (opts.broadcast) _broadcast({ type: 'backlog-scaffolded', project: name, path: backlogPath });
  if (opts.commit) {
    try {
      _autoCommitBacklog(workDir, null, 'scaffold empty backlog');
    } catch (e: any) {
      console.error('[backlog] scaffold auto-commit failed in ' + workDir + ':', e.message);
    }
  }
  return backlogPath;
}

/** Scaffold a project backlog with broadcast, swallowing errors. */
export function scaffoldBacklog(project: { name?: string; workDir?: string }): void {
  try {
    ensureProjectBacklogFile(project, { broadcast: true });
  } catch (e: any) {
    console.error('[scaffold-backlog] failed:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all backlogs (global + all projects) with a short-lived cache.
 * Strips BOM from files PowerShell may have written.
 * Mirrors loadAllBacklogs() in server.js.
 */
export function loadAllBacklogs(): AllBacklogsResult {
  if (_backlogCache && Date.now() - _backlogCacheAt < BACKLOG_CACHE_TTL_MS) {
    return _backlogCache;
  }

  const cfg = _readConfig();
  const result: AllBacklogsResult = {
    global: null,
    projects: [],
    archive: { global: null, projects: [] },
  };

  if (cfg.obsidianVaultPath) {
    const globalPath = path.join(cfg.obsidianVaultPath, 'Backlog', 'backlog.json');
    try {
      result.global = _readJson(globalPath);
    } catch (e: any) {
      console.warn('[backlog] global backlog not readable:', e.message);
    }

    const globalArchivePath = path.join(cfg.obsidianVaultPath, 'Backlog', 'backlog-archive.json');
    try {
      result.archive.global = _readJson(globalArchivePath);
    } catch {
      result.archive.global = { tasks: [] };
    }
  }

  const projects = ((cfg.projects || []) as Array<{ name: string; workDir: string }>)
    .filter(p => p.workDir && p.name);

  for (const proj of projects) {
    const backlogPath = ensureProjectBacklogFile(proj) || path.join(proj.workDir, 'docs', 'backlog.json');
    let backlog: { tasks: BacklogTask[] } | null = null;
    try {
      backlog = _readJson(backlogPath);
    } catch (e: any) {
      console.warn(`[backlog] ${proj.name} backlog not readable:`, e.message);
    }
    result.projects.push({ name: proj.name, workDir: proj.workDir, backlog });

    const archivePath = path.join(proj.workDir, 'docs', 'backlog-archive.json');
    let archive: { tasks: BacklogTask[] } | null = null;
    try {
      archive = _readJson(archivePath);
    } catch {
      archive = { tasks: [] };
    }
    result.archive.projects.push({ name: proj.name, workDir: proj.workDir, archive });
  }

  const globalTasks = result.global?.tasks?.length || 0;
  const projectTasks = result.projects.reduce((sum, p) => sum + (p.backlog?.tasks || []).length, 0);
  const archiveTasks = (result.archive.global?.tasks?.length || 0)
    + result.archive.projects.reduce((sum, p) => sum + (p.archive?.tasks || []).length, 0);
  console.log(`[backlog] loaded ${projects.length} projects, ${globalTasks + projectTasks} active, ${archiveTasks} archived`);

  _backlogCache = result;
  _backlogCacheAt = Date.now();
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a new task to the specified scope (global or project name).
 * Mirrors addBacklogTask() in server.js.
 */
export function addBacklogTask(scope: BacklogScope, taskInput: AddTaskInput): BacklogTask {
  const cfg = _readConfig();
  if (!taskInput?.title || !String(taskInput.title).trim()) {
    throw new Error('Task title is required.');
  }

  const baseTask: BacklogTask = {
    number: 0,
    title: String(taskInput.title).trim(),
    description: String(taskInput.description || '').trim(),
    category: String(taskInput.category || 'feature').trim(),
    priority: parseInt(String(taskInput.priority), 10) || 50,
    impact: _validImpact(taskInput.impact),
    status: 'backlog',
    created_at: new Date().toISOString().split('T')[0],
    completed_at: null,
    dependencies: [],
  };

  if (scope === 'global') {
    if (!cfg.obsidianVaultPath) throw new Error('Obsidian vault path not configured in Polaris settings.');
    const filePath = path.join(cfg.obsidianVaultPath, 'Backlog', 'backlog.json');
    const archivePath = path.join(cfg.obsidianVaultPath, 'Backlog', 'backlog-archive.json');
    const data: { tasks: BacklogTask[] } = _readJson(filePath);
    if (!Array.isArray(data.tasks)) data.tasks = [];
    let archivedTasks: BacklogTask[] = [];
    try {
      const archiveData: { tasks: BacklogTask[] } = _readJson(archivePath);
      if (Array.isArray(archiveData.tasks)) archivedTasks = archiveData.tasks;
    } catch {}
    baseTask.number = _nextBacklogTaskNumber(data.tasks, archivedTasks);
    baseTask.scope = 'global';
    data.tasks.push(baseTask);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    invalidateBacklogCache();
    return baseTask;
  }

  const project = ((cfg.projects || []) as Array<{ name: string; workDir: string }>)
    .find(p => p.name === scope);
  if (!project) throw new Error('Project not found in config: ' + scope);
  if (!project.workDir) throw new Error('Project ' + scope + ' has no workDir configured.');

  const filePath = path.join(project.workDir, 'docs', 'backlog.json');
  const archivePath = path.join(project.workDir, 'docs', 'backlog-archive.json');

  let data: { tasks: BacklogTask[] };
  try {
    data = _readJson(filePath);
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch {}
      data = { tasks: [] };
    } else {
      throw new Error('Could not read ' + filePath + ': ' + e.message);
    }
  }
  if (!Array.isArray(data.tasks)) data.tasks = [];

  let archivedTasks: BacklogTask[] = [];
  try {
    const archiveData: { tasks: BacklogTask[] } = _readJson(archivePath);
    if (Array.isArray(archiveData.tasks)) archivedTasks = archiveData.tasks;
  } catch {}

  baseTask.number = _nextBacklogTaskNumber(data.tasks, archivedTasks);
  data.tasks.push(baseTask);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  invalidateBacklogCache();

  try {
    _autoCommitBacklog(project.workDir, baseTask.number);
  } catch (e: any) {
    console.error('[backlog] auto-commit failed in ' + project.workDir + ':', e.message);
  }
  return baseTask;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS UPDATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the status of a task. Validates against VALID_BACKLOG_STATUSES.
 * Sets completed_at for terminal statuses, clears it otherwise.
 * Mirrors updateBacklogTaskStatus() in server.js.
 */
export function updateBacklogTaskStatus(
  scope: BacklogScope,
  taskNumber: number | string,
  newStatus: string
): BacklogTask {
  console.log(`[backlog] updateBacklogTaskStatus scope=${scope} task=#${taskNumber} newStatus="${newStatus}"`);
  if (!VALID_BACKLOG_STATUSES.has(newStatus)) {
    console.warn(`[backlog] REJECTED status "${newStatus}" — not in VALID_BACKLOG_STATUSES`);
    throw new Error('Invalid status "' + newStatus + '". Valid: ' + [...VALID_BACKLOG_STATUSES].join(', '));
  }

  const cfg = _readConfig();
  const taskNum = parseInt(String(taskNumber), 10);
  if (!taskNum) throw new Error('Invalid task number: ' + taskNumber);

  if (scope === 'global') {
    if (!cfg.obsidianVaultPath) throw new Error('Obsidian vault path not configured.');
    const filePath = path.join(cfg.obsidianVaultPath, 'Backlog', 'backlog.json');
    const data: { tasks: BacklogTask[] } = _readJson(filePath);
    const task = (data.tasks || []).find(t => t.number === taskNum);
    if (!task) throw new Error('Task #' + taskNum + ' not found in global backlog.');
    task.status = newStatus as BacklogStatus;
    task.completed_at = TERMINAL_STATUSES.has(newStatus)
      ? new Date().toISOString().split('T')[0]
      : null;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    invalidateBacklogCache();
    return task;
  }

  const project = ((cfg.projects || []) as Array<{ name: string; workDir: string }>)
    .find(p => p.name === scope);
  if (!project) throw new Error('Project not found: ' + scope);
  if (!project.workDir) throw new Error('Project ' + scope + ' has no workDir.');

  const filePath = path.join(project.workDir, 'docs', 'backlog.json');
  const data: { tasks: BacklogTask[] } = _readJson(filePath);
  const task = (data.tasks || []).find(t => t.number === taskNum);
  if (!task) throw new Error('Task #' + taskNum + ' not found in ' + scope + ' backlog.');

  const prevStatus = task.status;
  task.status = newStatus as BacklogStatus;
  task.completed_at = TERMINAL_STATUSES.has(newStatus)
    ? new Date().toISOString().split('T')[0]
    : null;
  console.log(`[backlog] task #${taskNum} in ${scope}: ${prevStatus} → ${newStatus}`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  invalidateBacklogCache();

  try {
    _autoCommitBacklog(project.workDir, taskNum, 'set task #' + taskNum + ' status to ' + newStatus);
  } catch (e: any) {
    console.error('[backlog] auto-commit failed in ' + project.workDir + ':', e.message);
  }
  return task;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL UPDATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update editable fields of a task (title, description, category, priority, impact).
 * Status changes must go through updateBacklogTaskStatus().
 * Mirrors updateBacklogTask() in server.js.
 */
export function updateBacklogTask(
  scope: BacklogScope,
  taskNumber: number | string,
  updates: UpdateTaskInput
): BacklogTask {
  const cfg = _readConfig();
  const taskNum = parseInt(String(taskNumber), 10);
  if (!taskNum) throw new Error('Invalid task number: ' + taskNumber);
  if (!updates || typeof updates !== 'object') throw new Error('No updates provided.');

  const applyUpdates = (task: BacklogTask): void => {
    if ('title' in updates) task.title = String(updates.title).trim();
    if ('description' in updates) task.description = String(updates.description).trim();
    if ('category' in updates) task.category = String(updates.category).trim();
    if ('priority' in updates) task.priority = parseInt(String(updates.priority), 10) || 50;
    if ('impact' in updates) task.impact = _validImpact(updates.impact);
  };

  if (scope === 'global') {
    if (!cfg.obsidianVaultPath) throw new Error('Obsidian vault path not configured.');
    const filePath = path.join(cfg.obsidianVaultPath, 'Backlog', 'backlog.json');
    const data: { tasks: BacklogTask[] } = _readJson(filePath);
    const task = (data.tasks || []).find(t => t.number === taskNum);
    if (!task) throw new Error('Task #' + taskNum + ' not found in global backlog.');
    applyUpdates(task);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    invalidateBacklogCache();
    return task;
  }

  const project = ((cfg.projects || []) as Array<{ name: string; workDir: string }>)
    .find(p => p.name === scope);
  if (!project) throw new Error('Project not found: ' + scope);
  if (!project.workDir) throw new Error('Project ' + scope + ' has no workDir.');

  const filePath = path.join(project.workDir, 'docs', 'backlog.json');
  const data: { tasks: BacklogTask[] } = _readJson(filePath);
  const task = (data.tasks || []).find(t => t.number === taskNum);
  if (!task) throw new Error('Task #' + taskNum + ' not found in ' + scope + ' backlog.');
  applyUpdates(task);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  invalidateBacklogCache();

  try {
    _autoCommitBacklog(project.workDir, taskNum, 'update task #' + taskNum);
  } catch (e: any) {
    console.error('[backlog] auto-commit failed in ' + project.workDir + ':', e.message);
  }
  return task;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Move production/cancelled tasks into backlog-archive.json.
 * Only tasks with status 'production' or 'cancelled' are eligible.
 * Mirrors archiveCompletedTasks() in server.js.
 */
export function archiveBacklogTasks(
  scope: BacklogScope,
  taskNumbers: number | number[],
  promotionPRNumber?: number | null
): BacklogTask[] {
  const cfg = _readConfig();
  const taskNums = (Array.isArray(taskNumbers) ? taskNumbers : [taskNumbers])
    .map(n => parseInt(String(n), 10));

  const archiveFrom = (
    backlogPath: string,
    archivePath: string,
    projectSource: string
  ): BacklogTask[] => {
    const backlog: { tasks: BacklogTask[] } = _readJson(backlogPath);
    let archive: { tasks: BacklogTask[] } = { tasks: [] };
    try {
      archive = _readJson(archivePath);
    } catch {}

    const tasksToArchive: BacklogTask[] = [];
    const remaining: BacklogTask[] = [];

    for (const task of (backlog.tasks || [])) {
      if (taskNums.includes(task.number) && (task.status === 'production' || task.status === 'cancelled')) {
        tasksToArchive.push({ ...task, project_source: projectSource, promoted_via_pr: promotionPRNumber });
      } else {
        remaining.push(task);
      }
    }

    if (tasksToArchive.length > 0) {
      archive.tasks = (archive.tasks || []).concat(tasksToArchive);
      backlog.tasks = remaining;
      fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2) + '\n', 'utf8');
      fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2) + '\n', 'utf8');
      console.log(`[backlog] archived ${tasksToArchive.length} tasks from ${projectSource} to backlog-archive.json`);
    }
    return tasksToArchive;
  };

  if (scope === 'global') {
    if (!cfg.obsidianVaultPath) throw new Error('Obsidian vault path not configured.');
    const backlogPath = path.join(cfg.obsidianVaultPath, 'Backlog', 'backlog.json');
    const archivePath = path.join(cfg.obsidianVaultPath, 'Backlog', 'backlog-archive.json');
    const archived = archiveFrom(backlogPath, archivePath, 'global');
    invalidateBacklogCache();
    return archived;
  }

  const project = ((cfg.projects || []) as Array<{ name: string; workDir: string }>)
    .find(p => p.name === scope);
  if (!project) throw new Error('Project not found: ' + scope);
  if (!project.workDir) throw new Error('Project ' + scope + ' has no workDir.');

  const backlogPath = path.join(project.workDir, 'docs', 'backlog.json');
  const archivePath = path.join(project.workDir, 'docs', 'backlog-archive.json');
  const archived = archiveFrom(backlogPath, archivePath, project.name);
  invalidateBacklogCache();
  return archived;
}
