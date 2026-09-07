import type { Prisma } from '../../generated/prisma/client';

export interface RecordRetrievalIssueParams {
  source: string;
  attemptedAt: Date;
}

export interface RecordRetrievalRecoveredParams {
  source: string;
  recoveredAt: Date;
}

export interface RecordHeadwayErrorParams {
  lineCode: string;
  stationCode: string;
  direction?: string;
  source?: string;
  observedAt?: Date;
  sampleCount?: number;
  bucket?: string;
  bucketLabel?: string;
  reason: string;
  error?: unknown;
  metadata?: Prisma.InputJsonValue;
}

export interface HeadwayCalculationSamples {
  intervalsSeconds: number[];
  discardedIntervalCount: number;
  minimumIntervals: number;
  maximumPassages: number;
  targetBucket?: string;
  selectedBucket?: string;
}
