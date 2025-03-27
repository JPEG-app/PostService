import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { Post, PostCreationAttributes, PostUpdateAttributes } from '../models/post.model';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

export class PostRepository {
  async createPost(post: PostCreationAttributes): Promise<Post> {
    try {
      const query = 'INSERT INTO posts (user_id, title, content) VALUES ($1, $2, $3) RETURNING *';
      const values = [post.userId, post.title, post.content];
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('Error creating post:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostById(postId: string): Promise<Post | undefined> {
    try {
      const query = 'SELECT * FROM posts WHERE post_id = $1';
      const values = [postId];
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('Error finding post by ID:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async updatePost(postId: string, updatedPost: PostUpdateAttributes): Promise<Post | undefined> {
    try {
      let query = 'UPDATE posts SET ';
      const values: any[] = [];
      let paramCount = 1;

      if (updatedPost.title) {
        query += `title = $${paramCount}, `;
        values.push(updatedPost.title);
        paramCount++;
      }
      if (updatedPost.content) {
        query += `content = $${paramCount}, `;
        values.push(updatedPost.content);
        paramCount++;
      }

      query += `updated_at = CURRENT_TIMESTAMP WHERE post_id = $${paramCount} RETURNING *`;
      values.push(postId);

      if (values.length > 1) {
        query = query.replace(/, updated_at/, ' updated_at');
      } else {
        return undefined;
      }

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error: any) {
      console.error('Error updating post:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async deletePost(postId: string): Promise<boolean> {
    try {
      const query = 'DELETE FROM posts WHERE post_id = $1';
      const values = [postId];
      await pool.query(query, values);
      return true;
    } catch (error: any) {
      console.error('Error deleting post:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostsByUserId(userId: string): Promise<Post[]> {
    try {
      const query = 'SELECT * FROM posts WHERE user_id = $1';
      const values = [userId];
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error: any) {
      console.error('Error finding posts by user ID:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async findAllPosts(): Promise<Post[]> {
    try {
      const query = 'SELECT * FROM posts';
      const result = await pool.query(query);
      return result.rows;
    } catch (error: any) {
      console.error('Error finding all posts:', error);
      throw new Error('Database error: ' + error.message);
    }
  }
}