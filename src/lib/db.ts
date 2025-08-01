import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 30000, // 增加到30秒
  idleTimeoutMillis: 60000, // 增加空闲超时
  max: 20, // 增加最大连接数
  min: 2, // 设置最小连接数
  acquireTimeoutMillis: 20000, // 获取连接的超时时间
  createTimeoutMillis: 20000, // 创建连接的超时时间
  destroyTimeoutMillis: 5000, // 销毁连接的超时时间
  createRetryIntervalMillis: 2000, // 重试间隔
  reapIntervalMillis: 1000, // 清理间隔
  log: (msg, level) => {
    if (level === 'error') {
      console.error('Database pool error:', msg);
    }
  }
});

export const db = drizzle(pool);

// 数据库操作重试包装器
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Database operation attempt ${attempt}/${maxRetries}`);
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error);
      
      // 检查是否是可重试的错误
      const isRetryableError = 
        error instanceof Error && (
          error.message.includes('connection') ||
          error.message.includes('timeout') ||
          error.message.includes('network') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT')
        );
      
      if (!isRetryableError || attempt === maxRetries) {
        throw error;
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
  
  throw lastError!;
}
