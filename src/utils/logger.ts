import type { D1Database } from '@cloudflare/workers-types';

export async function logExecution(
  db: D1Database,
  type: string,
  status: string,
  message: string,
  articlesProcessed: number,
  articlesPosted: number,
  cost: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO execution_logs (execution_type, status, message, articles_processed, articles_posted, total_cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(type, status, message, articlesProcessed, articlesPosted, cost, new Date().toISOString())
    .run();
}
