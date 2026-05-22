#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// ─── Config ───────────────────────────────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKLOG_PATH = path.join(REPO_ROOT, 'docs', 'backlog.json');
const ARCHIVE_PATH = path.join(REPO_ROOT, 'docs', 'backlog-archive.json');

// ─── Utilities ───────────────────────────────────────────────────────────
function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: REPO_ROOT, ...opts }).trim();
  } catch (e) {
    return '';
  }
}

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function groupByStatus(tasks) {
  const groups = {};
  tasks.forEach(task => {
    if (!groups[task.status]) groups[task.status] = [];
    groups[task.status].push(task);
  });
  return groups;
}

function getAllTasks() {
  const backlog = readJSON(BACKLOG_PATH);
  const archive = readJSON(ARCHIVE_PATH);
  return [...(backlog.tasks || []), ...(archive.tasks || [])];
}

function getBranchInfo() {
  const branches = {};

  // Get all local branches
  const branchList = exec('git branch -a --format="%(refname:short)|%(objectname:short)|%(committerdate:short)"')
    .split('\n')
    .filter(Boolean);

  branchList.forEach(line => {
    const [branchName, commit, date] = line.split('|');
    branches[branchName] = { commit, date, tasks: [] };
  });

  return branches;
}

function getTasksByBranch(tasks) {
  const tasksByBranch = {};

  tasks.forEach(task => {
    if (!task.branch) return;
    if (!tasksByBranch[task.branch]) tasksByBranch[task.branch] = [];
    tasksByBranch[task.branch].push(task);
  });

  return tasksByBranch;
}

function getPRStatus(branch) {
  try {
    const prJson = exec(`gh pr list --head "${branch}" --json "number,title,state,url" --limit 1`);
    if (!prJson) return null;
    const prs = JSON.parse(prJson);
    return prs[0] || null;
  } catch {
    return null;
  }
}

function colorize(text, status) {
  const colors = {
    'backlog': '\x1b[90m',        // dim gray
    'planned': '\x1b[36m',        // cyan
    'build-started': '\x1b[33m',  // yellow
    'build-finished': '\x1b[34m', // blue
    'cba-complete': '\x1b[35m',   // magenta
    'staged': '\x1b[32m',         // green
    'production': '\x1b[1;32m',   // bright green
    'failed-smoke-test': '\x1b[31m', // red
    'blocked': '\x1b[90m',        // dim
    'reset': '\x1b[0m'
  };

  const color = colors[status] || '';
  const reset = colors.reset;
  return `${color}${text}${reset}`;
}

function formatBranchSection(name, tasks, pr) {
  let output = `\n${colorize(`━━━ ${name} ━━━`, 'reset')}\n`;

  if (tasks.length === 0 && !pr) {
    output += `  (empty)\n`;
    return output;
  }

  if (pr) {
    const prStatus = pr.state === 'MERGED' ? '✓ MERGED' : pr.state === 'OPEN' ? '⧗ OPEN' : '✗ CLOSED';
    output += `  PR #${pr.number}: ${colorize(prStatus, pr.state.toLowerCase())} — ${pr.title}\n`;
    output += `  ${pr.url}\n`;
  }

  if (tasks.length > 0) {
    output += `\n  Tasks:\n`;
    tasks.forEach(task => {
      const statusBadge = colorize(task.status.toUpperCase().padEnd(15), task.status);
      output += `    #${String(task.number).padStart(3)} ${statusBadge} ${task.title}\n`;
      if (task.pr_url) output += `      → ${task.pr_url}\n`;
    });
  }

  return output;
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.clear();
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      WORKFLOW SUMMARY                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const allTasks = getAllTasks();
  const branches = getBranchInfo();
  const tasksByBranch = getTasksByBranch(allTasks);
  const tasksByStatus = groupByStatus(allTasks);

  // ─── MAIN BRANCH ──────────────────────────────────────────────────
  const mainTasks = allTasks.filter(t => t.status === 'production');
  const mainPR = getPRStatus('main');
  console.log(formatBranchSection('MAIN (Production)', mainTasks, mainPR));

  // ─── STAGE BRANCH ─────────────────────────────────────────────────
  const stageTasks = allTasks.filter(t => t.status === 'staged');
  const stagePR = getPRStatus('stage');
  console.log(formatBranchSection('STAGE (Ready for Prod)', stageTasks, stagePR));

  // ─── WORK TREES ────────────────────────────────────────────────────
  console.log('\n' + colorize('━━━ WORK TREES ━━━', 'reset'));

  const workTreeBranches = Object.keys(branches).filter(b =>
    b.startsWith('task-') && !b.includes('remotes')
  );

  if (workTreeBranches.length === 0) {
    console.log('  (no active work trees)\n');
  } else {
    workTreeBranches.forEach(branch => {
      const tasks = tasksByBranch[branch] || [];
      const pr = getPRStatus(branch);
      const branchInfo = branches[branch];

      console.log(`\n  ${colorize(branch, 'reset')} (${branchInfo.commit} — ${branchInfo.date})`);

      if (pr) {
        const prStatus = pr.state === 'MERGED' ? '✓' : pr.state === 'OPEN' ? '⧗' : '✗';
        console.log(`    ${prStatus} PR #${pr.number}: ${pr.title}`);
      }

      if (tasks.length > 0) {
        tasks.forEach(task => {
          console.log(`    #${String(task.number).padStart(3)} — ${colorize(task.status, task.status)} — ${task.title}`);
        });
      } else {
        console.log(`    (no tasks)`);
      }
    });
  }

  // ─── STATS ─────────────────────────────────────────────────────────
  console.log('\n' + colorize('━━━ STATS ━━━', 'reset'));
  console.log(`  Total tasks: ${allTasks.length}`);
  console.log(`  By status:`);
  Object.entries(tasksByStatus).sort().forEach(([status, tasks]) => {
    console.log(`    ${colorize(status.padEnd(20), status)}: ${tasks.length}`);
  });

  console.log(`  Active branches: ${workTreeBranches.length}\n`);
}

main().catch(console.error);
