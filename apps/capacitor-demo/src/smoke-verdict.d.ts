export type SmokeFlow = 'smoke' | 'let-end' | 'boundary';

export type SmokeVerdictStatus = 'IDLE' | 'RUNNING' | 'PASS' | 'FAIL';

export type SmokeVerdictCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type SmokeVerdict = {
  flow: SmokeFlow | null;
  status: SmokeVerdictStatus;
  checks: SmokeVerdictCheck[];
  snapshotSummary: string;
  errorSummary: string | null;
};

export type SmokeVerdictAction =
  | { type: 'start'; flow: SmokeFlow }
  | { type: 'snapshot'; snapshot: unknown }
  | { type: 'error'; message: string }
  | { type: 'complete' };

export function createInitialSmokeVerdict(): SmokeVerdict;
export function reduceSmokeVerdict(state: SmokeVerdict, action: SmokeVerdictAction): SmokeVerdict;
export function summarizeSmokeVerdict(verdict: SmokeVerdict): string;
