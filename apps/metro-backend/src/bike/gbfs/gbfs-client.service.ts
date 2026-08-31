import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { GbfsAutoDiscovery, GbfsFeedName, GbfsResponse } from './gbfs-v3.types';

const GBFS_AUTO_DISCOVERY_URL =
  'https://saopaulo.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json';
const GBFS_ORIGIN = new URL(GBFS_AUTO_DISCOVERY_URL).origin;

@Injectable()
export class GbfsClientService {
  private readonly logger = new Logger(GbfsClientService.name);
  private feedUrlsCache: {
    urls: Map<string, string>;
    expiresAt: number;
  } | null = null;
  private feedUrlsRequest: Promise<Map<string, string>> | null = null;

  constructor(private readonly http: HttpService) {}

  async fetchFeed<T>(feedName: GbfsFeedName): Promise<GbfsResponse<T>> {
    const feedUrls = await this.getFeedUrls();
    const url = feedUrls.get(feedName);

    if (!url) {
      throw new Error(`GBFS v3 feed is missing required entry: ${feedName}`);
    }

    return this.fetchGbfs<T>(url);
  }

  private async getFeedUrls(): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.feedUrlsCache && this.feedUrlsCache.expiresAt > now) {
      return this.feedUrlsCache.urls;
    }

    if (!this.feedUrlsRequest) {
      this.feedUrlsRequest = this.refreshFeedUrls().finally(() => {
        this.feedUrlsRequest = null;
      });
    }

    return this.feedUrlsRequest;
  }

  private async refreshFeedUrls(): Promise<Map<string, string>> {
    const response = await this.fetchGbfs<GbfsAutoDiscovery>(
      GBFS_AUTO_DISCOVERY_URL,
    );
    if (!Array.isArray(response.data.feeds)) {
      throw new Error('Invalid GBFS v3 auto-discovery feed list');
    }
    const urls = new Map<string, string>();

    for (const feed of response.data.feeds) {
      let url: URL;
      try {
        url = new URL(feed.url);
      } catch {
        this.logger.warn(`Ignoring malformed URL for GBFS feed ${feed.name}`);
        continue;
      }

      if (url.protocol !== 'https:' || url.origin !== GBFS_ORIGIN) {
        this.logger.warn(
          `Ignoring untrusted URL for GBFS feed ${feed.name}: ${url.origin}`,
        );
        continue;
      }
      urls.set(feed.name, url.toString());
    }

    this.feedUrlsCache = {
      urls,
      expiresAt: Date.now() + response.ttl * 1000,
    };

    return urls;
  }

  private async fetchGbfs<T>(url: string): Promise<GbfsResponse<T>> {
    try {
      const response = await firstValueFrom(
        this.http.get<GbfsResponse<T>>(url, { timeout: 10_000 }),
      );
      this.assertValidResponse(response.data, url);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch GBFS v3 data from ${url}: ${message}`);
      throw error;
    }
  }

  private assertValidResponse<T>(response: GbfsResponse<T>, url: string): void {
    if (
      response?.version !== '3.0' ||
      !response.data ||
      !Number.isFinite(response.ttl) ||
      response.ttl < 0 ||
      !Number.isFinite(Date.parse(response.last_updated))
    ) {
      throw new Error(`Invalid GBFS v3 response from ${url}`);
    }
  }
}
