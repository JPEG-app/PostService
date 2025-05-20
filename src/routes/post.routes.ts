// post-service/src/routes/post.routes.ts
import express from 'express';
import { PostController } from '../controllers/post.controller';
import { PostService } from '../services/post.service';
import { PostRepository, initializePostRepositoryLogger } from '../repositories/post.repository';
import { CachedUserRepository, initializeCachedUserRepositoryLogger } from '../repositories/cachedUser.repository';
import winston from 'winston';
import { authMiddleware } from '../middleware/auth.middleware'; // Import new auth middleware
import { TokenService } from '../services/token.service';     // Import TokenService

const router = express.Router();

// Accept logger and tokenService instance from app.ts
export const setupPostRoutes = (logger: winston.Logger, tokenService: TokenService) => {
  initializePostRepositoryLogger(logger);
  initializeCachedUserRepositoryLogger(logger);

  const postRepository = new PostRepository(logger);
  const cachedUserRepository = new CachedUserRepository(logger);
  const postService = new PostService(postRepository, cachedUserRepository, logger);
  const postController = new PostController(postService, logger);

  // Create an instance of the auth middleware
  const requireAuth = authMiddleware(tokenService, logger);

  // Routes requiring authentication and authorization
  router.post('/posts', requireAuth, postController.createPost.bind(postController));
  router.put('/posts/:postId', requireAuth, postController.updatePost.bind(postController));
  router.delete('/posts/:postId', requireAuth, postController.deletePost.bind(postController));

  // Publicly accessible routes (do not use requireAuth)
  router.get('/posts/:postId', postController.getPostById.bind(postController));
  router.get('/users/:userId/posts', postController.getPostsByUserId.bind(postController));
  router.get('/posts', postController.getAllPosts.bind(postController));

  return router;
};