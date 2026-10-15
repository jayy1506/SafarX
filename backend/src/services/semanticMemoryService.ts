import crypto from 'crypto';
import { redis, vectorIndex } from '../config/upstash.js';
import { logger } from '../utils/logger.js';

export interface MemoryQueryResult<T = any> {
  fromMemory: boolean;
  similarityScore?: number;
  data: T;
  tokensSaved?: number;
  queryId?: string;
}

export class SemanticMemoryService {
  private static readonly CACHE_PREFIX = 'safarx:memory:cache:';
  private static readonly METRICS_KEY = 'safarx:memory:metrics';
  private static readonly DEFAULT_TTL_SECONDS = 7 * 24 * 3600; // 7 days

  /**
   * Hashes text into a reproducible unique identifier
   */
  private static hashQuery(query: string): string {
    return crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
  }

  /**
   * Look up query in memory:
   * 1. Exact match via Upstash Redis Cache (ultra-fast sub-5ms)
   * 2. Semantic vector similarity match via Upstash Vector (if similarity >= threshold)
   */
  static async searchMemory<T = any>(
    query: string,
    similarityThreshold = 0.88
  ): Promise<MemoryQueryResult<T> | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const queryHash = this.hashQuery(trimmed);

    // 1. Direct Redis Exact-Match Cache Lookup
    try {
      const cached = await redis.get<T>(`${this.CACHE_PREFIX}${queryHash}`);
      if (cached) {
        logger.info({ query: trimmed }, '[SemanticMemory] Exact match found in Redis memory cache');
        await this.incrementMetric('exact_hits');
        return {
          fromMemory: true,
          similarityScore: 1.0,
          data: cached,
          tokensSaved: Math.ceil(trimmed.length / 4) + 150,
          queryId: queryHash,
        };
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, '[SemanticMemory] Redis lookup warning');
    }

    // 2. Upstash Vector Semantic Similarity Lookup
    try {
      // Query Upstash Vector with raw text data (dense vector cosine similarity)
      const vectorResults = await vectorIndex.query({
        data: trimmed,
        topK: 1,
        includeMetadata: true,
      });

      if (vectorResults && vectorResults.length > 0) {
        const topResult = vectorResults[0];
        const score = topResult.score || 0;

        if (score >= similarityThreshold) {
          logger.info(
            { query: trimmed, matchedId: topResult.id, score },
            '[SemanticMemory] Semantic similarity match found in Upstash Vector memory'
          );

          // Retrieve full cached payload from Redis or metadata
          let responseData = (topResult.metadata as any)?.payload;
          if (!responseData && topResult.id) {
            responseData = await redis.get<T>(`${this.CACHE_PREFIX}${topResult.id}`);
          }

          if (responseData) {
            await this.incrementMetric('vector_hits');
            return {
              fromMemory: true,
              similarityScore: score,
              data: responseData,
              tokensSaved: Math.ceil(trimmed.length / 4) + 200,
              queryId: String(topResult.id),
            };
          }
        }
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, '[SemanticMemory] Vector similarity lookup warning');
    }

    return null;
  }

  /**
   * Save a new query and response into Upstash Memory (Redis + Vector)
   */
  static async storeMemory<T = any>(
    query: string,
    data: T,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    const trimmed = query.trim();
    const queryHash = this.hashQuery(trimmed);

    try {
      // 1. Store in Upstash Redis Key-Value
      await redis.set(`${this.CACHE_PREFIX}${queryHash}`, data, {
        ex: this.DEFAULT_TTL_SECONDS,
      });

      // 2. Upsert into Upstash Vector Index
      await vectorIndex.upsert({
        id: queryHash,
        data: trimmed,
        metadata: {
          queryText: trimmed,
          createdAt: new Date().toISOString(),
          ...metadata,
        },
      });

      await this.incrementMetric('stored_queries');
      logger.info({ queryHash, query: trimmed }, '[SemanticMemory] Stored search query in Upstash Vector & Redis');
    } catch (err: any) {
      logger.error({ error: err.message }, '[SemanticMemory] Error storing query in memory');
    }

    return queryHash;
  }

  /**
   * Track token savings and hit rates in Redis
   */
  private static async incrementMetric(field: 'exact_hits' | 'vector_hits' | 'stored_queries'): Promise<void> {
    try {
      await redis.hincrby(this.METRICS_KEY, field, 1);
    } catch {
      // Non-fatal metric tracking
    }
  }

  /**
   * Get overall memory efficiency stats
   */
  static async getMemoryStats(): Promise<Record<string, any>> {
    try {
      const metrics = (await redis.hgetall(this.METRICS_KEY)) || {};
      const vectorInfo = await vectorIndex.info().catch(() => null);

      return {
        success: true,
        metrics,
        vectorIndex: vectorInfo,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
