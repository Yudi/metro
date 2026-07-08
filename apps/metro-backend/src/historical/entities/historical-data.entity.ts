import {
  Field,
  Float,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

export enum HistoricalIncidentEventType {
  RAIL_STATUS_INCIDENT = 'RAIL_STATUS_INCIDENT',
  RAIL_STATUS_RECOVERED = 'RAIL_STATUS_RECOVERED',
  BACKEND_ONLINE = 'BACKEND_ONLINE',
  BACKEND_OFFLINE = 'BACKEND_OFFLINE',
  BACKEND_OFFLINE_DETECTED = 'BACKEND_OFFLINE_DETECTED',
  RETRIEVAL_ISSUE = 'RETRIEVAL_ISSUE',
}

registerEnumType(HistoricalIncidentEventType, {
  name: 'HistoricalIncidentEventType',
  description: 'Kind of historical incident or transparency event',
});

@ObjectType({
  description:
    'Historical incident or transparency event for rail operations and backend availability',
})
export class HistoricalIncidentEventEntity {
  @Field(() => String, { description: 'Historical event identifier' })
  id!: string;

  @Field(() => HistoricalIncidentEventType, {
    description: 'Event type',
  })
  eventType!: HistoricalIncidentEventType;

  @Field(() => Date, { description: 'When this event was observed' })
  observedAt!: Date;

  @Field(() => Date, {
    nullable: true,
    description: 'When the event started, if known',
  })
  startedAt?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description: 'When the event ended, if known',
  })
  endedAt?: Date | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Event duration in seconds, if known',
  })
  durationSeconds?: number | null;

  @Field(() => String, { description: 'Logical source of the event' })
  source!: string;

  @Field(() => String, {
    nullable: true,
    description: 'External provider or subsystem involved',
  })
  provider?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Rail line code, such as L9',
  })
  lineCode?: string | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Numeric rail line code',
  })
  lineNumber?: number | null;

  @Field(() => String, {
    nullable: true,
    description: 'Rail line display name',
  })
  lineName?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Transit agency recorded when this event was generated',
  })
  agency?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Rail status code at observation time',
  })
  statusCode?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Rail status label at observation time',
  })
  statusLabel?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Rail status color at observation time',
  })
  statusColor?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Normalized severity for filtering and visualization',
  })
  severity?: string | null;

  @Field(() => String, { description: 'Short event title' })
  title!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Detailed event description',
  })
  description?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Incident category reported by the source, when available',
  })
  incidentCategory?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Additional operational details',
  })
  detail?: string | null;

  @Field(() => GraphQLJSON, {
    nullable: true,
    description: 'Structured metadata for diagnostics and future analysis',
  })
  metadata?: unknown;

  @Field(() => Date, { description: 'When this history row was created' })
  createdAt!: Date;
}

@ObjectType({
  description: 'Historical average headway snapshot for a station direction',
})
export class HistoricalHeadwaySnapshotEntity {
  @Field(() => String, { description: 'Headway snapshot identifier' })
  id!: string;

  @Field(() => Date, { description: 'When this snapshot was observed' })
  observedAt!: Date;

  @Field(() => String, { description: 'Rail line code, such as L9' })
  lineCode!: string;

  @Field(() => String, {
    description: 'Transit agency recorded when this snapshot was generated',
  })
  agency!: string;

  @Field(() => String, {
    description: 'Internal station key used by the headway calculation',
    deprecationReason: 'Use stationName for user-facing historical data.',
  })
  stationCode!: string;

  @Field(() => String, {
    nullable: true,
    description: 'User-facing station name',
  })
  stationName?: string | null;

  @Field(() => String, { description: 'Terminal or direction name' })
  direction!: string;

  @Field(() => Float, {
    nullable: true,
    description: 'Average headway in seconds, null when unavailable',
  })
  averageSeconds?: number | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Number of interval samples used or available',
  })
  sampleCount?: number | null;

  @Field(() => String, {
    nullable: true,
    description: 'Time-of-day bucket id used for the calculation',
  })
  bucket?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Display label for the time-of-day bucket',
  })
  bucketLabel?: string | null;

  @Field(() => Boolean, {
    description: 'True when the snapshot used a fallback bucket',
  })
  isFallback!: boolean;

  @Field(() => GraphQLJSON, {
    nullable: true,
    description:
      'Anonymized interval samples used for this average, without raw timestamps or train identifiers',
  })
  samples?: unknown;

  @Field(() => String, { description: 'Logical source of this headway row' })
  source!: string;

  @Field(() => GraphQLJSON, {
    nullable: true,
    description:
      'Structured JSONB error details when the headway calculation is incomplete',
  })
  errors?: unknown;

  @Field(() => GraphQLJSON, {
    nullable: true,
    description: 'Structured metadata for diagnostics and future analysis',
  })
  metadata?: unknown;

  @Field(() => Date, { description: 'When this history row was created' })
  createdAt!: Date;
}

@ObjectType({
  description: 'Historical operations data grouped by data kind',
})
export class HistoricalDataEntity {
  @Field(() => [HistoricalIncidentEventEntity], {
    description: 'Historical incident and transparency events',
  })
  incidents!: HistoricalIncidentEventEntity[];

  @Field(() => [HistoricalHeadwaySnapshotEntity], {
    description: 'Historical headway snapshots',
  })
  headwaySnapshots!: HistoricalHeadwaySnapshotEntity[];
}
