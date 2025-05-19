import { Request, Response } from 'express';
import { PostService } from '../services/post.service';

export class PostController {
  private postService: PostService;

  constructor(postService: PostService) {
    this.postService = postService;
  }

  async createPost(req: Request, res: Response) {
    try {
      const { userId, title, content } = req.body;
      if (!userId || !title || !content) {
        return res.status(400).json({ message: 'Missing required fields: userId, title, content' });
      }
      const post = await this.postService.createPost(req.body);
      res.status(201).json(post);
    } catch (error: any) {
      if (error.message === 'User not found') {
        res.status(400).json({ message: error.message });
      } else {
        console.log(error);
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  }

  async getPostById(req: Request, res: Response) {
    try {
      const post = await this.postService.findPostById(req.params.postId);
      if (post) {
        res.json(post);
      } else {
        res.status(404).json({ message: 'Post not found' });
      }
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async updatePost(req: Request, res: Response) {
    try {
      const updatedPost = await this.postService.updatePost(req.params.postId, req.body);
      if (updatedPost) {
        res.json(updatedPost);
      } else {
        res.status(404).json({ message: 'Post not found' });
      }
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async deletePost(req: Request, res: Response) {
    try {
      const deleted = await this.postService.deletePost(req.params.postId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ message: 'Post not found' });
      }
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getPostsByUserId(req: Request, res: Response) {
    try {
      const posts = await this.postService.findPostsByUserId(req.params.userId);
      res.json(posts);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async getAllPosts(req: Request, res: Response) {
    try {
      const posts = await this.postService.findAllPosts();
      res.json(posts);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}