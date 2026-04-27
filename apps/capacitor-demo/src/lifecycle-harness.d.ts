export type LifecycleCheckpointInput = {
  step: string;
  snapshotState: string;
  recentEvents?: string[];
};

export type LifecycleCheckpointVerdict = {
  label: string;
  ok: boolean;
  detail: string;
};

export function classifyLifecycleCheckpoint(
  step: string,
  snapshotState: string,
  recentEvents?: string[],
): LifecycleCheckpointVerdict;

export function buildLifecycleCheckpointSummary(
  checkpoints: LifecycleCheckpointInput[],
): string;
