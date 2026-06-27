import { HttpErrorResponse } from '@angular/common/http';
import {
  Meta,
  StoryObj,
  applicationConfig,
  moduleMetadata,
} from '@storybook/angular';
import { NEVER, Observable, delay, of, throwError } from 'rxjs';
import { RailGraphqlService } from '@metro/shared/api';
import { HistoricalHeadwaySnapshot } from '@metro/shared/utils';
import { HeadwayHistoryComponent } from './headway-history.component';

type StoryState = 'loaded' | 'loading' | 'empty' | 'backend-down' | 'error';

interface HeadwayHistoryStoryArgs {
  state: StoryState;
  rowCount: number;
  networkDelayMs: number;
  mockRows: HistoricalHeadwaySnapshot[];
}

const MOCK_ROWS: HistoricalHeadwaySnapshot[] = [
  {
    id: 'snapshot-001',
    observedAt: '2026-06-10T12:03:00.000Z',
    lineCode: 'L9',
    stationCode: 'OSASCO',
    stationName: 'Osasco',
    direction: 'Bruno Covas/Mendes-Vila Natal',
    averageSeconds: 390,
    sampleCount: 8,
    bucket: 'midday',
    bucketLabel: 'Meio do dia',
    isFallback: false,
    samples: {
      method: 'intervals_between_detected_passages',
      intervalsSeconds: [360, 420, 390, 405],
      intervalCount: 4,
      discardedIntervalCount: 1,
      minimumIntervals: 3,
      maximumPassages: 10,
      targetBucket: 'midday',
      selectedBucket: 'midday',
    },
    source: 'headway_tracking',
    metadata: {
      updatedAt: '2026-06-10T12:02:48.000Z',
    },
    createdAt: '2026-06-10T12:03:04.000Z',
  },
  {
    id: 'snapshot-002',
    observedAt: '2026-06-10T11:57:00.000Z',
    lineCode: 'L8',
    stationCode: 'JULIO_PRESTES',
    stationName: 'Júlio Prestes',
    direction: 'Itapevi',
    averageSeconds: 510,
    sampleCount: 3,
    bucket: 'morning',
    bucketLabel: 'Manhã',
    isFallback: true,
    samples: {
      method: 'intervals_between_detected_passages',
      intervalsSeconds: [480, 540, 510],
      intervalCount: 3,
      discardedIntervalCount: 0,
      minimumIntervals: 3,
      maximumPassages: 10,
      targetBucket: 'midday',
      selectedBucket: 'morning',
    },
    source: 'headway_tracking',
    errors: {
      reason: 'insufficient_current_bucket_samples',
    },
    metadata: {
      updatedAt: '2026-06-10T11:56:30.000Z',
    },
    createdAt: '2026-06-10T11:57:03.000Z',
  },
  {
    id: 'snapshot-003',
    observedAt: '2026-06-10T11:50:00.000Z',
    lineCode: 'L4',
    stationCode: 'PAULISTA',
    stationName: 'Paulista',
    direction: 'Vila Sônia',
    averageSeconds: null,
    sampleCount: 0,
    bucket: 'midday',
    bucketLabel: 'Meio do dia',
    isFallback: false,
    source: 'headway_tracking',
    errors: {
      reason: 'no_detected_passages',
    },
    metadata: {
      updatedAt: '2026-06-10T11:49:45.000Z',
    },
    createdAt: '2026-06-10T11:50:02.000Z',
  },
];

let activeArgs: HeadwayHistoryStoryArgs;

function createMockRailGraphqlService(
): Partial<RailGraphqlService> {
  return {
    fetchHistoricalHeadwaySnapshots: () => createMockFetchResponse(activeArgs),
  };
}

function createMockFetchResponse(
  args: HeadwayHistoryStoryArgs,
): Observable<HistoricalHeadwaySnapshot[]> {
  switch (args.state) {
    case 'loading':
      return NEVER;
    case 'backend-down':
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 0,
            statusText: 'Unknown Error',
            error: new ProgressEvent('error'),
          }),
      );
    case 'error':
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 502,
            statusText: 'Bad Gateway',
          }),
      );
    case 'empty':
      return of([]).pipe(delay(args.networkDelayMs));
    case 'loaded':
      return of(createRows(args)).pipe(delay(args.networkDelayMs));
  }
}

function createRows(args: HeadwayHistoryStoryArgs): HistoricalHeadwaySnapshot[] {
  const sourceRows = args.mockRows?.length > 0 ? args.mockRows : MOCK_ROWS;

  return Array.from({ length: args.rowCount }, (_, index) => {
    const source = sourceRows[index % sourceRows.length];
    const observedAt = new Date(source.observedAt);

    observedAt.setMinutes(observedAt.getMinutes() - index * 9);

    return {
      ...source,
      id: `${source.id}-${index}`,
      observedAt: observedAt.toISOString(),
      createdAt: observedAt.toISOString(),
    };
  });
}

const defaultArgs: HeadwayHistoryStoryArgs = {
  state: 'loaded',
  rowCount: 9,
  networkDelayMs: 0,
  mockRows: MOCK_ROWS,
};

activeArgs = defaultArgs;

function normalizeArgs(
  args: Partial<HeadwayHistoryStoryArgs>,
): HeadwayHistoryStoryArgs {
  return {
    state: args.state ?? defaultArgs.state,
    rowCount: args.rowCount ?? defaultArgs.rowCount,
    networkDelayMs: args.networkDelayMs ?? defaultArgs.networkDelayMs,
    mockRows: args.mockRows ?? defaultArgs.mockRows,
  };
}

const meta: Meta<HeadwayHistoryStoryArgs> = {
  title: 'History/IntervalHistory',
  component: HeadwayHistoryComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [HeadwayHistoryComponent],
    }),
    applicationConfig({
      providers: [
        {
          provide: RailGraphqlService,
          useValue: createMockRailGraphqlService(),
        },
      ],
    }),
  ],
  argTypes: {
    state: {
      control: 'select',
      options: ['loaded', 'loading', 'empty', 'backend-down', 'error'],
    },
    rowCount: {
      control: { type: 'number', min: 0, max: 90, step: 1 },
    },
    networkDelayMs: {
      control: { type: 'number', min: 0, max: 5000, step: 250 },
    },
    mockRows: {
      control: 'object',
    },
  },
  render: (args) => {
    activeArgs = normalizeArgs(args);

    return {
      props: {},
      template: '<app-headway-history />',
    };
  },
};

export default meta;

type Story = StoryObj<HeadwayHistoryStoryArgs>;

export const Playground: Story = {
  args: defaultArgs,
};

export const Empty: Story = {
  args: {
    ...defaultArgs,
    state: 'empty',
    rowCount: 0,
  },
};

export const Loading: Story = {
  args: {
    ...defaultArgs,
    state: 'loading',
  },
};

export const BackendDown: Story = {
  args: {
    ...defaultArgs,
    state: 'backend-down',
  },
};
