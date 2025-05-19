import { Pool } from 'pg';
import  * as dotenv from 'dotenv';
import { Post, PostCreationAttributes, PostUpdateAttributes } from '../models/post.model';

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

export class PostRepository {
  async createPost(post: PostCreationAttributes): Promise<Post> {
    try {
      const query = `INSERT INTO posts (user_id, title, content) VALUES ($1, $2, $3) RETURNING ${POST_COLUMNS_ALIASED}`;
      const values = [post.userId, post.title, post.content];
      const result = await pool.query(query, values);
      if (!result.rows[0] || !result.rows[0].postId) {
        console.error("PostRepository: createPost did not return a valid post with postId.", result.rows[0]);
        throw new Error("Failed to create post or retrieve its ID after creation.");
      }
      return result.rows[0] as Post;
    } catch (error: any) {
      console.error('Error creating post in repository:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostById(postId: string): Promise<Post | undefined> {
    try {
      const query = `SELECT ${POST_COLUMNS_ALIASED} FROM posts WHERE post_id = $1`;
      const values = [postId];
      const result = await pool.query(query, values);
      return result.rows[0] as Post | undefined;
    } catch (error: any) {
      console.error('Error finding post by ID:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async updatePost(postId: string, updatedPost: PostUpdateAttributes): Promise<Post | undefined> {
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
        if (values.length === 0) {
             return this.findPostById(postId);
        }
      }
      
      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      
      const query = `UPDATE posts SET ${setClauses.join(', ')} WHERE post_id = $${paramCount} RETURNING ${POST_COLUMNS_ALIASED}`;
      values.push(postId);

      const result = await pool.query(query, values);
      return result.rows[0] as Post | undefined;
    } catch (error: any) {
      console.error('Error updating post:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async deletePost(postId: string): Promise<boolean> {
    try {
      const query = 'DELETE FROM posts WHERE post_id = $1';
      const values = [postId];
      const result = await pool.query(query, values);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error: any) {
      console.error('Error deleting post:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostsByUserId(userId: string): Promise<Post[]> {
    try {
      const query = `SELECT ${POST_COLUMNS_ALIASED} FROM posts WHERE user_id = $1`;
      const values = [userId];
      const result = await pool.query(query, values);
      return result.rows as Post[];
    } catch (error: any) {
      console.error('Error finding posts by user ID:', error);
      throw new Error('Database error: ' + error.message);
    }
  }

  async findAllPosts(): Promise<Post[]> {
    try {
      const query = `SELECT ${POST_COLUMNS_ALIASED} FROM posts`;
      const result = await pool.query(query);
      return result.rows as Post[];
    } catch (error: any) {
      console.error('Error finding all posts:', error);
      throw new Error('Database error: ' + error.message);
    }
  }
}