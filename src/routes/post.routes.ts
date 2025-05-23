import express from 'express';
import { PostController } from '../controllers/post.controller';
import { PostService } from '../services/post.service';
import { PostRepository, initializePostRepositoryLogger } from '../repositories/post.repository';
import { CachedUserRepository, initializeCachedUserRepositoryLogger } from '../repositories/cachedUser.repository';
import winston from 'winston';
import { authMiddleware } from '../middleware/auth.middleware';
import { TokenService } from '../services/token.service';  

const router = express.Router();

export const setupPostRoutes = (logger: winston.Logger, tokenService: TokenService) => {
  initializePostRepositoryLogger(logger);
  initializeCachedUserRepositoryLogger(logger);

  const postRepository = new PostRepository(logger);
  const cachedUserRepository = new CachedUserRepository(logger);
  const postService = new PostService(postRepository, cachedUserRepository, logger);
  const postController = new PostController(postService, logger);

  const requireAuth = authMiddleware(tokenService, logger);

  router.post('/posts', requireAuth, postController.createPost.bind(postController));
  router.put('/posts/:postId', requireAuth, postController.updatePost.bind(postController));
  router.delete('/posts/:postId', requireAuth, postController.deletePost.bind(postController));

  router.get('/posts/:postId', postController.getPostById.bind(postController));
  router.get('/users/:userId/posts', postController.getPostsByUserId.bind(postController));
  router.get('/posts', postController.getAllPosts.bind(postController));

  router.post('/posts/:postId/like', requireAuth, postController.likePost.bind(postController));
  router.delete('/posts/:postId/like', requireAuth, postController.unlikePost.bind(postController));
  router.get('/posts/:postId/likes/count', postController.getPostLikeCount.bind(postController));
  router.get('/posts/:postId/like/status', requireAuth, postController.checkUserLike.bind(postController)); 

  return router;
};