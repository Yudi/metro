import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { matchPhysicalStops, PhysicalStopCandidate } from './physical-stop-matcher';

const MATCHER_VERSION = 1;

@Injectable()
export class PhysicalStopService {
  private readonly logger = new Logger(PhysicalStopService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Run under the transit catalog import lock, after service summary refresh. */
  async refresh(sourceSignature: string | null): Promise<void> {
    const signature = sourceSignature ? `v${MATCHER_VERSION}:${sourceSignature}` : null;
    if (signature) {
      const states = await this.prisma.$queryRaw<Array<{ sourceSignature: string }>>`
        SELECT "sourceSignature" FROM public.transit_precompute_state
        WHERE key = 'physical-bus-stops'
      `;
      if (states[0]?.sourceSignature === signature) return;
    }
    // Geography indexes bound candidates before the text matcher. Only stops used by bus trips qualify.
    const candidates = await this.prisma.$queryRaw<PhysicalStopCandidate[]>`
      SELECT sp.stop_id AS "sptransStopId", ar.stop_id AS "artespStopId",
        sp.stop_name AS "sptransName", ar.stop_name AS "artespName",
        sp.stop_desc AS "sptransDescription", ar.stop_desc AS "artespDescription",
        sp.platform_code AS "sptransPlatform", ar.platform_code AS "artespPlatform",
        ST_Distance(sp.location, ar.location)::double precision AS "distanceMeters"
      FROM public."Gtfs_Stop" sp
      JOIN public.gtfs_stop_service_summary ss ON ss.stop_id = sp.stop_id AND ss.serves_bus
      JOIN public."Gtfs_Stop" ar ON ar.source_agency = 'artesp'
        AND ST_DWithin(sp.location, ar.location, 10.0)
      JOIN public.gtfs_stop_service_summary ars ON ars.stop_id = ar.stop_id AND ars.serves_bus
      WHERE sp.source_agency = 'sptrans' AND sp.location IS NOT NULL AND ar.location IS NOT NULL
    `;
    const matches = matchPhysicalStops(candidates);
    const members = matches.flatMap((match) => [
      { source_stop_id: match.sptransStopId, physical_stop_id: match.sptransStopId },
      { source_stop_id: match.artespStopId, physical_stop_id: match.sptransStopId },
    ]);
    // Atomic replacement: readers see either the old complete mapping or the new one.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM public.physical_stop_members`;
      if (members.length) {
        await tx.$executeRaw`
          INSERT INTO public.physical_stop_members (source_stop_id, physical_stop_id)
          SELECT source_stop_id, physical_stop_id
          FROM jsonb_to_recordset(${JSON.stringify(members)}::jsonb)
            AS member(source_stop_id text, physical_stop_id text)
        `;
      }
      if (signature) {
        await tx.$executeRaw`
          INSERT INTO public.transit_precompute_state (key, "sourceSignature", "updatedAt")
          VALUES ('physical-bus-stops', ${signature}, now())
          ON CONFLICT (key) DO UPDATE SET "sourceSignature" = EXCLUDED."sourceSignature", "updatedAt" = now()
        `;
      }
    });
    this.logger.log(`Matched ${matches.length} shared SPTrans/Artesp bus stops`);
  }
}
