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

export type SmokeReportV1 = {
  schemaVersion: 1;
  flow: 'smoke';
  status: 'PASS' | 'FAIL';
  checks: SmokeVerdictCheck[];
  snapshotSummary: string;
  recentEvents: string[];
  errors: string[];
  runtimeIntegrity: {
    transportCommandsObserved: boolean;
    progressAdvancedWhilePlaying: boolean;
    trackEndTransitionObserved: boolean;
    snapshotProjectionCoherent: boolean;
    details: {
      transport: string;
      progress: string;
      trackEnd: string;
      snapshot: string;
    };
  };
};

export type SmokeVerdictAction =
  | { type: 'start'; flow: SmokeFlow }
  | { type: 'snapshot'; snapshot: unknown }
  | { type: 'error'; message: string }
  | { type: 'complete' };

export function createInitialSmokeVerdict(): SmokeVerdict;
export function createSmokeChecks(flow: SmokeFlow | null, snapshot: unknown): SmokeVerdictCheck[];
export function createSmokeSnapshotSummary(snapshot: unknown): string;
export function deriveSmokeStatusFromChecks(checks: SmokeVerdictCheck[], errorSummary?: string | null): 'PASS' | 'FAIL';
export function buildSmokeReportV1(input: {
  verdict: SmokeVerdict;
  recentEvents?: string[];
  runtimeIntegrity?: {
    transportCommandsObserved?: boolean;
    progressAdvancedWhilePlaying?: boolean;
    trackEndTransitionObserved?: boolean;
    snapshotProjectionCoherent?: boolean;
    details?: {
      transport?: string;
      progress?: string;
      trackEnd?: string;
      snapshot?: string;
    };
  };
}): SmokeReportV1;
export function reduceSmokeVerdict(state: SmokeVerdict, action: SmokeVerdictAction): SmokeVerdict;
export function summarizeSmokeVerdict(verdict: SmokeVerdict): string;
