/**
 * Shared runtime feature flags.
 *
 * These modules are not wired into the packaged app yet, but keeping the same
 * flags here prevents the split runtime from re-enabling noisy orchestration
 * paths when it replaces the monolith.
 */

export const ORCHESTRATION_QUIET_MODE = process.env.POLARIS_ORCHESTRATION_QUIET_MODE !== '0';

