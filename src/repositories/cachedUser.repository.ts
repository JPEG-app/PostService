import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { CachedUser } from '../models/cachedUser.model';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

export class CachedUserRepository {
  async addCachedUser(userId: string): Promise<CachedUser | undefined> {
    try {
      const query = `
        INSERT INTO cached_valid_users (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error: any) {
      console.error('Error adding/updating cached user:', error);
      throw new Error('Database error while caching user: ' + error.message);
    }
  }

  async removeCachedUser(userId: string): Promise<boolean> {
    try {
      const query = 'DELETE FROM cached_valid_users WHERE user_id = $1';
      const result = await pool.query(query, [userId]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error: any) {
      console.error('Error removing cached user:', error);
      throw new Error('Database error while removing cached user: ' + error.message);
    }
  }

  async findCachedUserById(userId: string): Promise<CachedUser | undefined> {
    try {
      const query = 'SELECT * FROM cached_valid_users WHERE user_id = $1';
      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error: any) {
      console.error('Error finding cached user by ID:', error);
      throw new Error('Database error while finding cached user: ' + error.message);
    }
  }
}