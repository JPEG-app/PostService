import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { CachedUser } from '../models/cachedUser.model';
import winston from 'winston';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

let repositoryLogger: winston.Logger;

export const initializeCachedUserRepositoryLogger = (loggerInstance: winston.Logger) => {
    repositoryLogger = loggerInstance;
};

export class CachedUserRepository {
  private logger: winston.Logger;

  constructor(loggerInstance?: winston.Logger) {
    this.logger = loggerInstance || repositoryLogger;
    if (!this.logger) {
        console.warn("CachedUserRepository initialized without a logger instance. Falling back to console.");
        this.logger = console as any;
    }
  }

  private logQuery(query: string, values: any[] | undefined, correlationId?: string, operation?: string) {
    this.logger.debug(`CachedUserRepository: Executing DB query`, {
        correlationId,
        operation: operation || 'UnknownCachedUserDBOperation',
        query,
        values: process.env.NODE_ENV !== 'production' ? values : '[values_hidden_in_prod]',
        type: 'DBLog.CachedUserQuery'
    });
  }

  async addCachedUser(userId: string, correlationId?: string): Promise<CachedUser | undefined> {
    const operation = 'addCachedUser';
    this.logger.info(`CachedUserRepository: ${operation} initiated`, { correlationId, userId, type: `DBLog.${operation}` });
    try {
      const query = `
        INSERT INTO cached_valid_users (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      const values = [userId];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      this.logger.info(`CachedUserRepository: ${operation} successful`, { correlationId, userId, result: result.rows[0], type: `DBLog.${operation}Success` });
      return result.rows[0];
    } catch (error: any) {
      this.logger.error(`CachedUserRepository: Error in ${operation}`, { correlationId, userId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error while caching user: ' + error.message);
    }
  }

  async removeCachedUser(userId: string, correlationId?: string): Promise<boolean> {
    const operation = 'removeCachedUser';
    this.logger.info(`CachedUserRepository: ${operation} initiated`, { correlationId, userId, type: `DBLog.${operation}` });
    try {
      const query = 'DELETE FROM cached_valid_users WHERE user_id = $1';
      const values = [userId];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      const success = result.rowCount !== null && result.rowCount > 0;
      this.logger.info(`CachedUserRepository: ${operation} ${success ? 'successful' : 'failed (user not found)'}`, { correlationId, userId, success, type: `DBLog.${operation}Result` });
      return success;
    } catch (error: any) {
      this.logger.error(`CachedUserRepository: Error in ${operation}`, { correlationId, userId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error while removing cached user: ' + error.message);
    }
  }

  async findCachedUserById(userId: string, correlationId?: string): Promise<CachedUser | undefined> {
    const operation = 'findCachedUserById';
    this.logger.info(`CachedUserRepository: ${operation} initiated`, { correlationId, userId, type: `DBLog.${operation}` });
    try {
      const query = 'SELECT * FROM cached_valid_users WHERE user_id = $1';
      const values = [userId];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      if (result.rows[0]) {
        this.logger.info(`CachedUserRepository: ${operation} found user`, { correlationId, userId, type: `DBLog.${operation}Found` });
      } else {
        this.logger.info(`CachedUserRepository: ${operation} user not found`, { correlationId, userId, type: `DBLog.${operation}NotFound` });
      }
      return result.rows[0];
    } catch (error: any) {
      this.logger.error(`CachedUserRepository: Error in ${operation}`, { correlationId, userId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error while finding cached user: ' + error.message);
    }
  }
}