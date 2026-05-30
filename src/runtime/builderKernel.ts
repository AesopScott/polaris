export type BuilderRiskLevel = 'low' | 'medium' | 'high';

export interface BuilderWorkspaceSignal {
  cwd?: string;
  branch?: string;
  dirtyFiles?: string[];
  activeWorktrees?: string[];
  openPrs?: Array<{ number: number; branch: string; status: string }>;
}

export interface BuilderTaskSignal {
  activeTask?: number;
  taskStatus?: string;
  proofUnits?: unknown[];
  activeSessions?: Array<{ id: string; type: string; scope?: string; status: string }>;
}

export interface BuilderMemorySignal {
  id?: string;
  type?: string;
  content: string;
  score?: number;
}

export interface BuilderKernelInput {
  rawUserRequest: string;
  workspace?: BuilderWorkspaceSignal;
  projectState?: BuilderTaskSignal;
  memories?: BuilderMemorySignal[];
}

export interface BuilderKernelAction {
  action: string;
  reason: string;
  confidence: number;
  requiredEvidence: string[];
}

export interface BuilderDecisionJournalDraft {
  nextAction: string;
  why: string[];
  evidenceNeeded: string[];
  hardPoliciesChecked: string[];
  softPoliciesApplied: string[];
  alternativesConsidered: string[];
}

export interface PolarisBuilderKernel {
  objective: {
    rawUserRequest: string;
    inferredBuildIntent: string;
    productShape?: string;
    targetUser?: string;
    successCriteria: string[];
    nonGoals: string[];
    riskLevel: BuilderRiskLevel;
  };
  workspace: Required<BuilderWorkspaceSignal>;
  projectState: Required<BuilderTaskSignal>;
  memory: {
    retrieved: BuilderMemorySignal[];
    applicablePatterns: string[];
  };
  policies: {
    hard: string[];
    soft: string[];
    triggered: string[];
  };
  recommendedActions: BuilderKernelAction[];
  decisionJournalDraft: BuilderDecisionJournalDraft;
}

const HARD_POLICIES = [
  'Do not overwrite user changes.',
  'Do not merge or promote without required proof/review evidence.',
  "Do not edit another session's worktree.",
  'Do not bypass branch/worktree safety gates.',
  'Do not hide failed verification.',
  'Do not treat incomplete or blocked work as complete.',
];

const SOFT_POLICIES = [
  'Usually plan before building.',
  'Usually create a backlog task for durable product work.',
  'Usually run cross-boundary audit for shared contracts or registries.',
  'Usually run browser verification for UI changes.',
  'Usually split major tasks before implementation.',
  'Usually prefer narrow edits over refactors.',
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function inferIntent(request: string): string {
  const text = normalizeText(request);
  if (includesAny(text, ['fix', 'bug', 'broken', 'error', 'failing'])) return 'repair existing software';
  if (includesAny(text, ['review', 'audit', 'inspect'])) return 'evaluate existing software';
  if (includesAny(text, ['ship', 'release', 'deploy', 'promote'])) return 'ship verified software';
  if (includesAny(text, ['build', 'create', 'make', 'scaffold', 'app', 'tool', 'website', 'game'])) {
    return 'build application';
  }
  if (includesAny(text, ['explore', 'think', 'architecture', 'design'])) return 'shape product architecture';
  return 'clarify build intent';
}

function inferProductShape(request: string): string | undefined {
  const text = normalizeText(request);
  if (includesAny(text, ['dashboard', 'admin', 'crm', 'ops'])) return 'operational dashboard';
  if (includesAny(text, ['game', 'playable'])) return 'interactive game';
  if (includesAny(text, ['website', 'site', 'landing'])) return 'web experience';
  if (includesAny(text, ['extension', 'browser extension', 'chrome'])) return 'browser extension';
  if (includesAny(text, ['api', 'service', 'server'])) return 'service/API';
  if (includesAny(text, ['builder', 'scaffold', 'create apps', 'make applications'])) return 'application builder';
  if (includesAny(text, ['app', 'tool'])) return 'application/tool';
  return undefined;
}

function inferTargetUser(request: string): string | undefined {
  const text = normalizeText(request);
  if (text.includes('for scott') || text.includes('my ')) return 'Scott';
  if (text.includes('developer') || text.includes('engineer')) return 'developer';
  if (text.includes('customer') || text.includes('client')) return 'customer';
  if (text.includes('admin') || text.includes('operator')) return 'operator';
  return undefined;
}

function inferSuccessCriteria(intent: string, request: string): string[] {
  const criteria = ['Intent is captured as a concrete build objective.'];
  if (intent === 'build application') {
    criteria.push('First useful workflow or screen is identified.');
    criteria.push('A runnable implementation path is selected.');
  }
  if (intent === 'repair existing software') {
    criteria.push('Root cause is identified before broad edits.');
    criteria.push('A failing check is reproduced or explicitly waived.');
  }
  if (intent === 'evaluate existing software') {
    criteria.push('Findings are grounded in files, behavior, or proof output.');
  }
  if (intent === 'ship verified software') {
    criteria.push('Release path and required evidence are known before promotion.');
  }
  if (normalizeText(request).includes('ui') || normalizeText(request).includes('screen')) {
    criteria.push('User-facing behavior is verified visually or in browser.');
  }
  return unique(criteria);
}

function inferRiskLevel(input: BuilderKernelInput, intent: string): BuilderRiskLevel {
  const dirtyFiles = input.workspace?.dirtyFiles ?? [];
  const request = normalizeText(input.rawUserRequest);
  if (
    dirtyFiles.length > 0 ||
    includesAny(request, ['server.js', 'runtime', 'promote', 'deploy', 'security', 'auth', 'payment'])
  ) {
    return 'high';
  }
  if (
    intent !== 'clarify build intent' ||
    includesAny(request, ['database', 'schema', 'contract', 'api', 'memory', 'orchestrator'])
  ) {
    return 'medium';
  }
  return 'low';
}

function extractApplicablePatterns(memories: BuilderMemorySignal[]): string[] {
  return memories
    .filter((memory) => ['preference', 'decision', 'pattern'].includes(memory.type ?? ''))
    .slice(0, 5)
    .map((memory) => memory.content);
}

function detectTriggeredPolicies(input: BuilderKernelInput, riskLevel: BuilderRiskLevel): string[] {
  const triggered: string[] = [];
  const request = normalizeText(input.rawUserRequest);
  const dirtyFiles = input.workspace?.dirtyFiles ?? [];
  const sessions = input.projectState?.activeSessions ?? [];

  if (dirtyFiles.length > 0) triggered.push('Do not overwrite user changes.');
  if (sessions.some((session) => session.status !== 'complete' && session.scope)) {
    triggered.push("Do not edit another session's worktree.");
  }
  if (includesAny(request, ['merge', 'promote', 'deploy', 'release', 'ship'])) {
    triggered.push('Do not merge or promote without required proof/review evidence.');
  }
  if (riskLevel === 'high') triggered.push('Do not hide failed verification.');
  return unique(triggered);
}

function evidenceForRequest(request: string, riskLevel: BuilderRiskLevel): string[] {
  const text = normalizeText(request);
  const evidence: string[] = [];
  if (includesAny(text, ['ui', 'screen', 'frontend', 'website', 'app', 'game'])) {
    evidence.push('Browser or screenshot verification');
  }
  if (includesAny(text, ['contract', 'schema', 'websocket', 'api'])) {
    evidence.push('Contract or API test');
  }
  if (includesAny(text, ['memory', 'retrieval', 'querymemory'])) {
    evidence.push('Memory/retrieval test');
  }
  if (includesAny(text, ['ship', 'release', 'deploy', 'promote'])) {
    evidence.push('Release checklist and review evidence');
  }
  if (riskLevel !== 'low') evidence.push('Targeted test or explicit waiver');
  return unique(evidence.length > 0 ? evidence : ['Reasoned inspection summary']);
}

function recommendActions(input: BuilderKernelInput, intent: string, riskLevel: BuilderRiskLevel): BuilderKernelAction[] {
  const request = normalizeText(input.rawUserRequest);
  const taskStatus = input.projectState?.taskStatus;
  const dirtyFiles = input.workspace?.dirtyFiles ?? [];
  const evidence = evidenceForRequest(input.rawUserRequest, riskLevel);
  const actions: BuilderKernelAction[] = [];

  if (dirtyFiles.length > 0) {
    actions.push({
      action: 'inspect_dirty_workspace',
      reason: 'The workspace has uncommitted changes, so the builder must classify ownership before any write.',
      confidence: 0.95,
      requiredEvidence: ['Dirty file list reviewed'],
    });
  }

  if (intent === 'build application') {
    actions.push({
      action: 'draft_app_blueprint',
      reason: 'The request is asking for software to exist, so the next useful artifact is a buildable product blueprint.',
      confidence: 0.88,
      requiredEvidence: ['Objective, first workflow, data needs, and acceptance criteria identified'],
    });
    actions.push({
      action: 'propose_scaffold_path',
      reason: 'A builder should choose where and how the app will be created before spawning implementation workers.',
      confidence: 0.76,
      requiredEvidence: ['Stack/repo target chosen with tradeoffs'],
    });
  }

  if (taskStatus === 'planned') {
    actions.push({
      action: 'consider_legacy_start_build',
      reason: 'The existing pipeline can safely start implementation, but it should be selected because it fits the situation.',
      confidence: 0.72,
      requiredEvidence: ['Task objective and proof units still match the request'],
    });
  }

  if (includesAny(request, ['ui', 'screen', 'frontend', 'website', 'game'])) {
    actions.push({
      action: 'plan_browser_verification',
      reason: 'User-facing software needs visual verification, not just code inspection.',
      confidence: 0.9,
      requiredEvidence: ['Browser check or screenshot'],
    });
  }

  if (actions.length === 0) {
    actions.push({
      action: 'clarify_or_summarize_intent',
      reason: 'The request does not yet imply a safe build action.',
      confidence: 0.67,
      requiredEvidence: evidence,
    });
  }

  return actions;
}

export function createBuilderKernel(input: BuilderKernelInput): PolarisBuilderKernel {
  const intent = inferIntent(input.rawUserRequest);
  const productShape = inferProductShape(input.rawUserRequest);
  const targetUser = inferTargetUser(input.rawUserRequest);
  const riskLevel = inferRiskLevel(input, intent);
  const triggered = detectTriggeredPolicies(input, riskLevel);
  const recommendedActions = recommendActions(input, intent, riskLevel);
  const primaryAction = recommendedActions[0];

  return {
    objective: {
      rawUserRequest: input.rawUserRequest,
      inferredBuildIntent: intent,
      productShape,
      targetUser,
      successCriteria: inferSuccessCriteria(intent, input.rawUserRequest),
      nonGoals: ['Do not execute writes from the read-only builder kernel.'],
      riskLevel,
    },
    workspace: {
      cwd: input.workspace?.cwd ?? '',
      branch: input.workspace?.branch ?? '',
      dirtyFiles: input.workspace?.dirtyFiles ?? [],
      activeWorktrees: input.workspace?.activeWorktrees ?? [],
      openPrs: input.workspace?.openPrs ?? [],
    },
    projectState: {
      activeTask: input.projectState?.activeTask ?? 0,
      taskStatus: input.projectState?.taskStatus ?? '',
      proofUnits: input.projectState?.proofUnits ?? [],
      activeSessions: input.projectState?.activeSessions ?? [],
    },
    memory: {
      retrieved: input.memories ?? [],
      applicablePatterns: extractApplicablePatterns(input.memories ?? []),
    },
    policies: {
      hard: HARD_POLICIES,
      soft: SOFT_POLICIES,
      triggered,
    },
    recommendedActions,
    decisionJournalDraft: {
      nextAction: primaryAction.action,
      why: [primaryAction.reason],
      evidenceNeeded: primaryAction.requiredEvidence,
      hardPoliciesChecked: triggered.length > 0 ? triggered : ['No hard policy trigger detected in read-only analysis.'],
      softPoliciesApplied: SOFT_POLICIES.filter((policy) => {
        if (policy.includes('browser')) return primaryAction.requiredEvidence.some((item) => item.includes('Browser'));
        if (policy.includes('backlog')) return intent === 'build application';
        if (policy.includes('narrow')) return riskLevel !== 'low';
        return false;
      }),
      alternativesConsidered: recommendedActions.slice(1).map((action) => action.action),
    },
  };
}

export const BUILDER_KERNEL_VERSION = '0.1.0-readonly';
