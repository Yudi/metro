import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../prisma/prisma.service';
import { BusNoticeHttpClient } from './bus-notice.http';
import { BusNotice, NoticeReference, parseNoticeDetail, parseNoticeIndex } from './bus-notice.parser';

const INDEX_PATHS = [...Array.from({ length: 8 }, (_, i) => `/informativos/regiao/${i + 1}`), '/informativos/varias-areas'];
const REFRESH_MS = 86_400_000;
interface CachedDetail { notice: BusNotice; fetchedAt: string }
interface NoticeState {
  attemptedWindow: string;
  successfulWindow: string;
  lastSuccessAt: Date | null;
  notices: BusNotice[];
  detailCache: Record<string, CachedDetail>;
}

/** Two local daily windows, each eligible only after its offset (04:23 / 16:23). */
export function noticeWindow(now: Date): string | null {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
  const minutes = Number(part('hour')) * 60 + Number(part('minute'));
  const slot = minutes >= 720 ? 1 : 0;
  if (minutes < slot * 720 + 263) return null;
  return `${part('year')}-${part('month')}-${part('day')}:${slot}`;
}

@Injectable()
export class BusNoticeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BusNoticeService.name);
  private readonly shutdown = new AbortController();
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly http: BusNoticeHttpClient) {}

  onApplicationBootstrap(): void { void this.refresh(); }
  onModuleDestroy(): void { this.shutdown.abort(); }

  @Cron('23 4,16 * * *', { timeZone: 'America/Sao_Paulo' })
  async refresh(now = new Date()): Promise<void> {
    const window = noticeWindow(now);
    if (!window || this.running || this.shutdown.signal.aborted) return;
    this.running = true;
    try {
      // Persist BEFORE all network activity. No in-memory/Redis fallback: losing the
      // durable claim must fail closed. A crash, block or parser failure spends this window.
      const claimed = await this.prisma.$executeRaw`
        UPDATE public.bus_notice_scrape_state SET "attemptedWindow" = ${window}
        WHERE id = 'sptrans' AND "attemptedWindow" < ${window}
      `;
      if (claimed !== 1) return;
      const state = await this.readState();
      if (!state) return;
      const signal = AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(600_000)]);
      const references = new Map<string, NoticeReference>();
      for (const path of INDEX_PATHS) {
        await delay(2000, undefined, { signal });
        for (const reference of parseNoticeIndex(await this.http.get(path, signal))) {
          const previous = references.get(reference.sourceId);
          if (!previous || reference.listing === 'UPCOMING') references.set(reference.sourceId, reference);
        }
      }
      if (references.size > 1000) throw new Error('Unexpected aggregate notice count');
      const cache = Object.fromEntries(Object.entries(state.detailCache).filter(([id]) => references.has(id)));
      // Oldest/missing details first. Checkpoints let a bounded next window resume a large intake.
      const pending = [...references.values()].filter((reference) => {
        const saved = cache[reference.sourceId];
        return !saved || saved.notice.sourceUrl !== reference.sourceUrl || saved.notice.title !== reference.title || saved.notice.listedDate !== reference.listedDate ||
          now.getTime() - Date.parse(saved.fetchedAt) >= REFRESH_MS;
      }).sort((a, b) => (cache[a.sourceId]?.fetchedAt ?? '').localeCompare(cache[b.sourceId]?.fetchedAt ?? ''));
      for (const reference of pending.slice(0, 120)) {
        await delay(2000, undefined, { signal });
        const notice = parseNoticeDetail(await this.http.get(reference.sourceUrl, signal), reference);
        cache[reference.sourceId] = { notice, fetchedAt: now.toISOString() };
        await this.prisma.$executeRaw`
          UPDATE public.bus_notice_scrape_state SET "detailCache" = ${JSON.stringify(cache)}::jsonb
          WHERE id = 'sptrans' AND "attemptedWindow" = ${window}
        `;
      }
      if (pending.length > 120) throw new Error('Notice detail budget reached; continuing next window');
      const notices = [...references.values()].map((reference) => ({ ...cache[reference.sourceId].notice, ...reference }));
      const retainedCache = Object.fromEntries([...references.keys()].map((id) => [id, cache[id]]));
      await this.prisma.$executeRaw`
        UPDATE public.bus_notice_scrape_state
        SET notices = ${JSON.stringify(notices)}::jsonb, "detailCache" = ${JSON.stringify(retainedCache)}::jsonb,
          "successfulWindow" = ${window}, "lastSuccessAt" = ${new Date()}
        WHERE id = 'sptrans' AND "attemptedWindow" = ${window}
      `;
    } catch (error) {
      this.logger.warn(`Notice refresh skipped or failed; keeping last complete snapshot: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally { this.running = false; }
  }

  private async readState(): Promise<NoticeState | null> {
    const rows = await this.prisma.$queryRaw<NoticeState[]>`
      SELECT "attemptedWindow", "successfulWindow", "lastSuccessAt", notices, "detailCache"
      FROM public.bus_notice_scrape_state WHERE id = 'sptrans'
    `;
    return rows[0] ?? null;
  }

  async forRoutes(routeCodes: string[], now = new Date()) {
    try {
      const state = await this.readState();
      const lastUpdated = state?.lastSuccessAt?.toISOString() ?? null;
      if (!state || !lastUpdated) return { status: 'UNAVAILABLE', lastUpdated: null, notices: [] };
      const stale = state.successfulWindow !== state.attemptedWindow ||
        now.getTime() - Date.parse(lastUpdated) > 13 * 3_600_000;
      return {
        status: stale ? 'STALE' : 'AVAILABLE', lastUpdated,
        notices: state.notices.filter((notice) => notice.routes.some((route) => routeCodes.includes(route))),
      };
    } catch {
      return { status: 'UNAVAILABLE', lastUpdated: null, notices: [] };
    }
  }
}
