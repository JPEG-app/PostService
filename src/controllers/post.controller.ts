import { Request as ExpressRequest, Response } from 'express';
import { PostService } from '../services/post.service';
import { RequestWithId } from '../utils/logger'; // Assuming this has authUserId
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

    this.logger.info('PostController: createPost initiated', { correlationId, authUserId, body: req.body, type: 'ControllerLog.createPost' });
    try {
      const { userId, title, content } = req.body;
      if (!userId || !title || !content) {
        this.logger.warn('PostController: createPost - Missing required fields', { correlationId, required: ['userId', 'title', 'content'], provided: req.body, type: 'ControllerValidationWarn.createPost' });
        return res.status(400).json({ message: 'Missing required fields: userId, title, content', correlationId });
      }
      const post = await this.postService.createPost({ userId, title, content }, correlationId, authUserId);
      this.logger.info('PostController: createPost successful', { correlationId, postId: post.postId, type: 'ControllerLog.createPostSuccess' });
      res.status(201).json(post);
    } catch (error: any) {
      if (error.message === 'User not found') {
        this.logger.warn(`PostController: createPost failed - User not found`, { correlationId, userId: req.body.userId, error: error.message, type: 'ControllerUserError.createPostUserNotFound' });
        res.status(400).json({ message: error.message, correlationId });
      } else if (error.message === 'Forbidden') {
        this.logger.warn(`PostController: createPost failed - Forbidden by service`, { correlationId, userId: req.body.userId, error: error.message, type: 'ControllerAuthError.createPostForbiddenByService' });
        res.status(403).json({ message: error.message, correlationId });
      }
      else {
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
        this.logger.info('PostController: getPostById successful', { correlationId, postId, type: 'ControllerLog.getPostByIdSuccess' });
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

    this.logger.info('PostController: updatePost initiated', { correlationId, postId, authUserId, body: req.body, type: 'ControllerLog.updatePost' });
    try {
      const { title, content } = req.body;
      const updateData: { title?: string; content?: string } = {};
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;

      if (Object.keys(updateData).length === 0) {
        this.logger.info('PostController: updatePost - No fields to update', { correlationId, postId, type: 'ControllerLog.updatePostNoChanges' });
        // Optionally fetch and return the current post, or return 200/204 with a message
        const currentPost = await this.postService.findPostById(postId, correlationId);
        return currentPost ? res.json(currentPost) : res.status(404).json({ message: 'Post not found', correlationId });
      }

      const updatedPost = await this.postService.updatePost(postId, updateData, authUserId, correlationId);
      // Service now throws if post not found before update, so updatedPost should always be defined if no error
      this.logger.info('PostController: updatePost successful', { correlationId, postId, type: 'ControllerLog.updatePostSuccess' });
      res.json(updatedPost);
    } catch (error: any) {
      if (error.message === 'Forbidden') {
        this.logger.warn('PostController: updatePost - Forbidden by service', { correlationId, authUserId, postId, type: 'ControllerAuthError.updatePostForbiddenByService' });
        res.status(403).json({ message: 'Forbidden: You do not have permission to update this post', correlationId });
      } else if (error.message === 'Post not found') {
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
      // Service now throws if post not found before delete, so deleted should always be true if no error
      this.logger.info('PostController: deletePost successful', { correlationId, postId, type: 'ControllerLog.deletePostSuccess' });
      res.status(204).send();
    } catch (error: any) {
      if (error.message === 'Forbidden') {
        this.logger.warn('PostController: deletePost - Forbidden by service', { correlationId, authUserId, postId, type: 'ControllerAuthError.deletePostForbiddenByService' });
        res.status(403).json({ message: 'Forbidden: You do not have permission to delete this post', correlationId });
      } else if (error.message === 'Post not found') {
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
      this.logger.info(`PostController: getPostsByUserId successful, found ${posts.length} posts`, { correlationId, userId, count: posts.length, type: 'ControllerLog.getPostsByUserIdSuccess' });
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
      this.logger.info(`PostController: getAllPosts successful, found ${posts.length} posts`, { correlationId, count: posts.length, type: 'ControllerLog.getAllPostsSuccess' });
      res.json(posts);
    } catch (error: any) {
      this.logger.error('PostController: getAllPosts - Internal server error', { correlationId, error: error.message, stack: error.stack, type: 'ControllerError.getAllPosts' });
      res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async likePost(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const authUserId = typedReq.authUserId;
    const postId = req.params.postId;

    if (!authUserId) {
        this.logger.warn('PostController: likePost - Unauthorized', { correlationId, postId, type: 'ControllerAuthError.likePostNoAuthUser' });
        return res.status(401).json({ message: 'Unauthorized', correlationId });
    }

    this.logger.info('PostController: likePost initiated', { correlationId, postId, authUserId, type: 'ControllerLog.likePost' });
    try {
        const like = await this.postService.likePost(postId, authUserId, correlationId);
        this.logger.info('PostController: likePost successful', { correlationId, postId, authUserId, likeId: like.likeId, type: 'ControllerLog.likePostSuccess' });
        res.status(201).json(like);
    } catch (error: any) {
        if (error.message === 'Post not found' || error.message === 'User not found') {
            this.logger.warn(`PostController: likePost - ${error.message}`, { correlationId, postId, authUserId, type: `ControllerValidationWarn.likePost${error.message.replace(/\s/g, '')}` });
            return res.status(404).json({ message: error.message, correlationId });
        }
        // Service handles 'Like already exists' by returning the existing like, so it should be a 201 or 200.
        // If service throws 'Like already exists' instead of returning it, then:
        // if (error.message === 'Like already exists') {
        //     this.logger.info(`PostController: likePost - Already liked`, { correlationId, postId, authUserId, type: 'ControllerLog.likePostAlreadyLiked' });
        //     return res.status(200).json({ message: 'Post already liked by this user', correlationId }); // Or 409 Conflict
        // }
        this.logger.error('PostController: likePost - Internal server error', { correlationId, postId, authUserId, error: error.message, stack: error.stack, type: 'ControllerError.likePost' });
        res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async unlikePost(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const authUserId = typedReq.authUserId;
    const postId = req.params.postId;

    if (!authUserId) {
        this.logger.warn('PostController: unlikePost - Unauthorized', { correlationId, postId, type: 'ControllerAuthError.unlikePostNoAuthUser' });
        return res.status(401).json({ message: 'Unauthorized', correlationId });
    }

    this.logger.info('PostController: unlikePost initiated', { correlationId, postId, authUserId, type: 'ControllerLog.unlikePost' });
    try {
        const success = await this.postService.unlikePost(postId, authUserId, correlationId);
        if (success) {
            this.logger.info('PostController: unlikePost successful', { correlationId, postId, authUserId, type: 'ControllerLog.unlikePostSuccess' });
            res.status(204).send();
        } else {
            // This case implies the like didn't exist, which is fine for an unlike operation (idempotent).
            // Or the post didn't exist, handled by service throwing an error.
            this.logger.info('PostController: unlikePost - Like not found or post not found', { correlationId, postId, authUserId, type: 'ControllerLog.unlikePostNotFound' });
            res.status(204).send(); // Still success from client perspective if like wasn't there
        }
    } catch (error: any) {
        if (error.message === 'Post not found') {
            this.logger.warn(`PostController: unlikePost - Post not found`, { correlationId, postId, authUserId, type: 'ControllerValidationWarn.unlikePostNotFound' });
            return res.status(404).json({ message: error.message, correlationId });
        }
        this.logger.error('PostController: unlikePost - Internal server error', { correlationId, postId, authUserId, error: error.message, stack: error.stack, type: 'ControllerError.unlikePost' });
        res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async getPostLikeCount(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const postId = req.params.postId;

    this.logger.info('PostController: getPostLikeCount initiated', { correlationId, postId, type: 'ControllerLog.getPostLikeCount' });
    try {
        const count = await this.postService.getLikeCount(postId, correlationId);
        this.logger.info('PostController: getPostLikeCount successful', { correlationId, postId, count, type: 'ControllerLog.getPostLikeCountSuccess' });
        res.json({ postId, count });
    } catch (error: any) {
        if (error.message === 'Post not found') {
            this.logger.warn('PostController: getPostLikeCount - Post not found', { correlationId, postId, type: 'ControllerNotFound.getPostLikeCountPostNotFound' });
            return res.status(404).json({ message: 'Post not found', correlationId });
        }
        this.logger.error('PostController: getPostLikeCount - Internal server error', { correlationId, postId, error: error.message, stack: error.stack, type: 'ControllerError.getPostLikeCount' });
        res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }

  async checkUserLike(req: ExpressRequest, res: Response) {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    const authUserId = typedReq.authUserId;
    const postId = req.params.postId;

    if (!authUserId) {
        this.logger.warn('PostController: checkUserLike - Unauthorized', { correlationId, postId, type: 'ControllerAuthError.checkUserLikeNoAuthUser' });
        return res.status(401).json({ message: 'Unauthorized', correlationId });
    }
    
    this.logger.info('PostController: checkUserLike initiated', { correlationId, postId, authUserId, type: 'ControllerLog.checkUserLike' });
    try {
        const hasLiked = await this.postService.hasUserLikedPost(postId, authUserId, correlationId);
        this.logger.info('PostController: checkUserLike successful', { correlationId, postId, authUserId, hasLiked, type: 'ControllerLog.checkUserLikeSuccess' });
        res.json({ postId, userId: authUserId, hasLiked });
    } catch (error: any) {
        this.logger.error('PostController: checkUserLike - Internal server error', { correlationId, postId, authUserId, error: error.message, stack: error.stack, type: 'ControllerError.checkUserLike' });
        res.status(500).json({ message: 'Internal server error', correlationId });
    }
  }
}