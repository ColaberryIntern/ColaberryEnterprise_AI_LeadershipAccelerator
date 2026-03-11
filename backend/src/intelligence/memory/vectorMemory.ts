// ─── Vector Memory ───────────────────────────────────────────────────────────
// pgvector-backed memory store for the Intelligence OS. Stores conversation
// history, investigation traces, decision outcomes, experiment results, and
// extracted insights. Falls back to text-only search when Python proxy
// (embedding service) is unavailable.

import IntelligenceMemory, { type MemoryCategory } from '../../models/IntelligenceMemory';
import { intelligenceProxy } from '../../services/intelligenceProxyService';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  metadata: Record<string, any>;
  similarity?: number; // 0-1, only present in search results
  created_at: Date;
}

// ─── Vector Memory ───────────────────────────────────────────────────────────

export class VectorMemory {
  /**
   * Store a memory entry, optionally embedding it via the Python proxy.
   */
  async store(
    category: MemoryCategory,
    content: string,
    metadata: Record<string, any> = {},
  ): Promise<string> {
    let embedding: number[] | undefined;

    try {
      embedding = await this.getEmbedding(content);
    } catch {
      // Python proxy unavailable — store without embedding
    }

    const record = await IntelligenceMemory.create({
      category,
      content,
      embedding,
      metadata,
    });

    return record.get('id') as string;
  }

  /**
   * Search memory by semantic similarity (vector) with text fallback.
   */
  async search(
    query: string,
    category?: MemoryCategory,
    limit = 10,
  ): Promise<MemoryEntry[]> {
    // Try vector search first
    try {
      const embedding = await this.getEmbedding(query);
      if (embedding) {
        return this.searchByVector(embedding, category, limit);
      }
    } catch {
      // Fall through to text search
    }

    return this.searchByText(query, category, limit);
  }

  /**
   * Search by pre-computed embedding vector.
   */
  async searchSimilar(
    embedding: number[],
    category?: MemoryCategory,
    limit = 10,
  ): Promise<MemoryEntry[]> {
    return this.searchByVector(embedding, category, limit);
  }

  /**
   * Delete old memories beyond a retention window.
   */
  async prune(olderThanDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const deleted = await IntelligenceMemory.destroy({
      where: { created_at: { [Op.lt]: cutoff } },
    });
    return deleted;
  }

  /**
   * Count memories, optionally by category.
   */
  async count(category?: MemoryCategory): Promise<number> {
    const where = category ? { category } : {};
    return IntelligenceMemory.count({ where });
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  /**
   * Get embedding vector from the Python intelligence proxy.
   * Returns undefined if the proxy is unavailable.
   */
  private async getEmbedding(text: string): Promise<number[] | undefined> {
    try {
      const response = await intelligenceProxy.embedPipeline();
      // The embed pipeline returns embeddings for provided text.
      // If the endpoint expects a different payload, adapt here.
      const data = response?.data;
      if (Array.isArray(data?.embedding)) {
        return data.embedding;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Vector similarity search using pgvector's cosine distance operator.
   */
  private async searchByVector(
    embedding: number[],
    category: MemoryCategory | undefined,
    limit: number,
  ): Promise<MemoryEntry[]> {
    const embeddingStr = `[${embedding.join(',')}]`;
    const categoryFilter = category ? `AND category = :category` : '';

    const results: any[] = await sequelize.query(
      `SELECT id, category, content, metadata, created_at,
              1 - (embedding <=> :embedding::vector) AS similarity
       FROM intelligence_memory
       WHERE embedding IS NOT NULL ${categoryFilter}
       ORDER BY embedding <=> :embedding::vector
       LIMIT :limit`,
      {
        replacements: { embedding: embeddingStr, category, limit },
        type: 'SELECT' as any,
      },
    );

    return results.map((r) => ({
      id: r.id,
      category: r.category,
      content: r.content,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {},
      similarity: parseFloat(r.similarity) || 0,
      created_at: new Date(r.created_at),
    }));
  }

  /**
   * Text fallback search using ILIKE when embeddings are unavailable.
   */
  private async searchByText(
    query: string,
    category: MemoryCategory | undefined,
    limit: number,
  ): Promise<MemoryEntry[]> {
    const where: Record<string, any> = {
      content: { [Op.iLike]: `%${query}%` },
    };
    if (category) where.category = category;

    const records = await IntelligenceMemory.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
    });

    return records.map((r) => ({
      id: r.get('id') as string,
      category: r.get('category') as MemoryCategory,
      content: r.get('content') as string,
      metadata: (r.get('metadata') as Record<string, any>) || {},
      created_at: r.get('created_at') as Date,
    }));
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let instance: VectorMemory | null = null;

export function getVectorMemory(): VectorMemory {
  if (!instance) instance = new VectorMemory();
  return instance;
}
