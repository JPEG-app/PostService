import { Request as ExpressRequest, Response } from 'express';
import { PostService } from '../services/post.service';
import { RequestWithId } from '../utils/logger';
import winston from 'winston';

export class PostController {
  private postService: PostService;
  private logger: winston.Logger;

  constructor(postService: PostService, loggerInstance: winston.Logger) {
    this.postService = postService;
    this.logger = loggerInstance;
  }

  async createPost(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const authUserId = typedReq.authUserId; 

    if (!authUserId) {
        this.logger.warn('PostController: createPost - Unauthorized, no authenticated user', { correlationId, type: 'ControllerAuthError.createPostNoAuthUser' });
        return res.status(401).json({ message: 'Unauthorized: Missing authentication', correlationId });
    }
    if (String(req.body.userId) !== String(authUserId)) {
        this.logger.warn('PostController: createPost - Forbidden, userId in body does not match authenticated user', { correlationId, authUserId, bodyUserId: req.body.userId, type: 'ControllerAuthError.createPostMismatch' });
        return res.status(403).json({ message: 'Forbidden: Cannot create post for another user', correlationId });
    }

    this.logger.info('PostController: createPost initiated', { correlationId, body: req.body, type: 'ControllerLog.createPost' });
    try {
      const { userId, title, content } = req.body;
      if (!userId || !title || !content) {
        this.logger.warn('PostController: createPost - Missing required fields', { correlationId, required: ['userId', 'title', 'content'], provided: req.body, type: 'ControllerValidationWarn.createPost' });
        return res.status(400).json({ message: 'Missing required fields: userId, title, content', correlationId });
      }
      const post = await this.postService.createPost(req.body, correlationId);
      this.logger.info('PostController: createPost successful', { correlationId, postId: post.postId, type: 'ControllerLog.createPost' });
      res.status(201).json(post);
    } catch (error: any) {
      if (error.message === 'User not found') {
        this.logger.warn(`PostController: createPost failed - User not found`, { correlationId, userId: req.body.userId, error: error.message, type: 'ControllerUserError.createPost' });
        res.status(400).json({ message: error.message, correlationId });
      } else {
        this.logger.error('PostController: createPost - Internal server error', { correlationId, error: error.message, stack: error.stack, type: 'ControllerError.createPost' });
        res.status(500).json({ message: 'Internal server error', correlationId });
      }
    }
  }

  async getPostById(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const postId = req.params.postId;
    this.logger.info('PostController: getPostById initiated', { correlationId, postId, type: 'ControllerLog.getPostById' });
    try {
      const post = await this.postService.findPostById(postId, correlationId);
      if (post) {
        this.logger.info('PostController: getPostById successful', { correlationId, postId, type: 'ControllerLog.getPostById' });
        res.json(post);
      } else {
        this.logger.warn('PostController: getPostById - Post not found', { correlationId, postId, type: 'ControllerNotFound.getPostById' });
        res.status(404).json({ message: 'Post not found', correlationId });
      }
    } catch (error: any) {
      this.logger.error('PostController: getPostById - Internal server error', { correlationId, postId, error: error.message, stack: error.stack, type: 'ControllerError.getPostById' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async updatePost(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const authUserId = typedReq.authUserId;
    const postId = req.params.postId;

    if (!authUserId) {
      this.logger.warn('PostController: updatePost - Unauthorized, no authenticated user', { correlationId, postId, type: 'ControllerAuthError.updatePostNoAuthUser' });
      return res.status(401).json({ message: 'Unauthorized: Missing authentication', correlationId });
    }

    this.logger.info('PostController: updatePost initiated', { correlationId, postId, body: req.body, type: 'ControllerLog.updatePost' });
    try {
      const updatedPost = await this.postService.updatePost(postId, req.body, authUserId, correlationId);
      if (updatedPost) {
        this.logger.info('PostController: updatePost successful', { correlationId, postId, type: 'ControllerLog.updatePost' });
        res.json(updatedPost);
      } else {
        this.logger.warn('PostController: updatePost - Post not found', { correlationId, postId, type: 'ControllerNotFound.updatePost' });
        res.status(404).json({ message: 'Post not found', correlationId });
      }
    } catch (error: any) {
      if (error.message === 'Forbidden') {
        this.logger.warn('PostController: updatePost - Forbidden by service', { correlationId, authUserId, postId, type: 'ControllerAuthError.updatePostForbiddenByService' });
        res.status(403).json({ message: 'Forbidden: You do not have permission to update this post', correlationId });
      } else if (error.message === 'Post not found for update') {
        this.logger.warn('PostController: updatePost - Post not found by service for update', { correlationId, authUserId, postId, type: 'ControllerNotFound.updatePostNotFoundByService' });
        res.status(404).json({ message: 'Post not found', correlationId });
      } else {
        this.logger.error('PostController: updatePost - Internal server error', { correlationId, postId, error: error.message, stack: error.stack, type: 'ControllerError.updatePost' });
        res.status(500).json({ message: 'Internal server error', correlationId });
      }
    }
  }

  async deletePost(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const postId = req.params.postId;
    const authUserId = typedReq.authUserId;

    if (!authUserId) {
      this.logger.warn('PostController: deletePost - Unauthorized, no authenticated user', { correlationId, postId, type: 'ControllerAuthError.deletePostNoAuthUser' });
      return res.status(401).json({ message: 'Unauthorized: Missing authentication', correlationId });
    }

    this.logger.info('PostController: deletePost initiated', { correlationId, postId, authUserId, type: 'ControllerLog.deletePost' });
    try {
      const deleted = await this.postService.deletePost(postId, authUserId, correlationId);
      if (deleted) {
        this.logger.info('PostController: deletePost successful', { correlationId, postId, type: 'ControllerLog.deletePost' });
        res.status(204).send();
      } else {
        this.logger.warn('PostController: deletePost - Post not found', { correlationId, postId, type: 'ControllerNotFound.deletePost' });
        res.status(404).json({ message: 'Post not found', correlationId });
      }
    } catch (error: any) {
      if (error.message === 'Forbidden') {
        this.logger.warn('PostController: deletePost - Forbidden by service', { correlationId, authUserId, postId, type: 'ControllerAuthError.deletePostForbiddenByService' });
        res.status(403).json({ message: 'Forbidden: You do not have permission to delete this post', correlationId });
      } else if (error.message === 'Post not found for deletion') {
          this.logger.warn('PostController: deletePost - Post not found by service for deletion', { correlationId, authUserId, postId, type: 'ControllerNotFound.deletePostNotFoundByService' });
          res.status(404).json({ message: 'Post not found', correlationId });
      } else {
        this.logger.error('PostController: deletePost - Internal server error', { correlationId, postId, error: error.message, stack: error.stack, type: 'ControllerError.deletePost' });
        res.status(500).json({ message: 'Internal server error', correlationId });
      }
    }
  }

  async getPostsByUserId(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const userId = req.params.userId;
    this.logger.info('PostController: getPostsByUserId initiated', { correlationId, userId, type: 'ControllerLog.getPostsByUserId' });
    try {
      const posts = await this.postService.findPostsByUserId(userId, correlationId);
      this.logger.info(`PostController: getPostsByUserId successful, found ${posts.length} posts`, { correlationId, userId, count: posts.length, type: 'ControllerLog.getPostsByUserId' });
      res.json(posts);
    } catch (error: any) {
      this.logger.error('PostController: getPostsByUserId - Internal server error', { correlationId, userId, error: error.message, stack: error.stack, type: 'ControllerError.getPostsByUserId' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async getAllPosts(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    this.logger.info('PostController: getAllPosts initiated', { correlationId, type: 'ControllerLog.getAllPosts' });
    try {
      const posts = await this.postService.findAllPosts(correlationId);
      this.logger.info(`PostController: getAllPosts successful, found ${posts.length} posts`, { correlationId, count: posts.length, type: 'ControllerLog.getAllPosts' });
      res.json(posts);
    } catch (error: any) {
      this.logger.error('PostController: getAllPosts - Internal server error', { correlationId, error: error.message, stack: error.stack, type: 'ControllerError.getAllPosts' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }
}