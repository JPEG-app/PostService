import { Pool } from 'pg';
import  * as dotenv from 'dotenv';
import { Post, PostCreationAttributes, PostUpdateAttributes } from '../models/post.model';
import winston from 'winston'; 

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

const POST_COLUMNS_ALIASED = `
  post_id AS "postId",
  user_id AS "userId",
  title,
  content,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

let repositoryLogger: winston.Logger;

export const initializePostRepositoryLogger = (loggerInstance: winston.Logger) => {
    repositoryLogger = loggerInstance;
};

export class PostRepository {
  private logger: winston.Logger;

  constructor(loggerInstance?: winston.Logger) {
    this.logger = loggerInstance || repositoryLogger;
    if (!this.logger) {
        console.warn("PostRepository initialized without a logger instance. Falling back to console.");
        this.logger = console as any;
    }
  }

  private logQuery(query: string, values: any[] | undefined, correlationId?: string, operation?: string) {
    this.logger.debug(`PostRepository: Executing DB query`, {
        correlationId,
        operation: operation || 'UnknownDBOperation',
        query,
        values: process.env.NODE_ENV !== 'production' ? values : '[values_hidden_in_prod]', 
        type: 'DBLog.Query'
    });
  }

  async createPost(post: PostCreationAttributes, correlationId?: string): Promise<Post> {
    const operation = "createPost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId: post.userId, type: `DBLog.${operation}` });
    try {
      const query = `INSERT INTO posts (user_id, title, content) VALUES ($1, $2, $3) RETURNING ${POST_COLUMNS_ALIASED}`;
      const values = [post.userId, post.title, post.content];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      if (!result.rows[0] || !result.rows[0].postId) {
        this.logger.error(`PostRepository: ${operation} did not return a valid post with postId.`, { correlationId, resultRow: result.rows[0], type: `DBError.${operation}NoId` });
        throw new Error("Failed to create post or retrieve its ID after creation.");
      }
      this.logger.info(`PostRepository: ${operation} successful`, { correlationId, postId: result.rows[0].postId, type: `DBLog.${operation}Success` });
      return result.rows[0] as Post;
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostById(postId: string, correlationId?: string): Promise<Post | undefined> {
    const operation = "findPostById";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, type: `DBLog.${operation}` });
    try {
      const query = `SELECT ${POST_COLUMNS_ALIASED} FROM posts WHERE post_id = $1`;
      const values = [postId];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      if (result.rows[0]) {
        this.logger.info(`PostRepository: ${operation} found post`, { correlationId, postId, type: `DBLog.${operation}Found` });
      } else {
        this.logger.info(`PostRepository: ${operation} post not found`, { correlationId, postId, type: `DBLog.${operation}NotFound` });
      }
      return result.rows[0] as Post | undefined;
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async updatePost(postId: string, updatedPost: PostUpdateAttributes, correlationId?: string): Promise<Post | undefined> {
    const operation = "updatePost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, data: updatedPost, type: `DBLog.${operation}` });
    try {
      let setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updatedPost.title !== undefined) {
        setClauses.push(`title = $${paramCount++}`);
        values.push(updatedPost.title);
      }
      if (updatedPost.content !== undefined) {
        setClauses.push(`content = $${paramCount++}`);
        values.push(updatedPost.content);
      }

      if (setClauses.length === 0) {
        this.logger.info(`PostRepository: ${operation} - no fields to update, fetching current post.`, { correlationId, postId, type: `DBLog.${operation}NoChanges` });
        return this.findPostById(postId, correlationId);
      }
      
      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      
      const query = `UPDATE posts SET ${setClauses.join(', ')} WHERE post_id = $${paramCount} RETURNING ${POST_COLUMNS_ALIASED}`;
      values.push(postId);
      this.logQuery(query, values, correlationId, operation);

      const result = await pool.query(query, values);
      if (result.rows[0]) {
        this.logger.info(`PostRepository: ${operation} successful`, { correlationId, postId, type: `DBLog.${operation}Success` });
      } else {
        this.logger.info(`PostRepository: ${operation} - post not found for update`, { correlationId, postId, type: `DBLog.${operation}NotFoundForUpdate` });
      }
      return result.rows[0] as Post | undefined;
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async deletePost(postId: string, correlationId?: string): Promise<boolean> {
    const operation = "deletePost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, type: `DBLog.${operation}` });
    try {
      const query = 'DELETE FROM posts WHERE post_id = $1';
      const values = [postId];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      const success = result.rowCount !== null && result.rowCount > 0;
      this.logger.info(`PostRepository: ${operation} ${success ? 'successful' : 'failed (post not found)'}`, { correlationId, postId, success, type: `DBLog.${operation}Result` });
      return success;
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostsByUserId(userId: string, correlationId?: string): Promise<Post[]> {
    const operation = "findPostsByUserId";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId, type: `DBLog.${operation}` });
    try {
      const query = `SELECT ${POST_COLUMNS_ALIASED} FROM posts WHERE user_id = $1`;
      const values = [userId];
      this.logQuery(query, values, correlationId, operation);
      const result = await pool.query(query, values);
      this.logger.info(`PostRepository: ${operation} found ${result.rows.length} posts`, { correlationId, userId, count: result.rows.length, type: `DBLog.${operation}Result` });
      return result.rows as Post[];
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, userId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findAllPosts(correlationId?: string): Promise<Post[]> {
    const operation = "findAllPosts";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, type: `DBLog.${operation}` });
    try {
      const query = `SELECT ${POST_COLUMNS_ALIASED} FROM posts`;
      this.logQuery(query, undefined, correlationId, operation);
      const result = await pool.query(query);
      this.logger.info(`PostRepository: ${operation} found ${result.rows.length} posts`, { correlationId, count: result.rows.length, type: `DBLog.${operation}Result` });
      return result.rows as Post[];
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }
}