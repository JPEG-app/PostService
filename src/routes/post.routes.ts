import express from 'express';
import { PostController } from '../controllers/post.controller';
import { PostService } from '../services/post.service';
import { PostRepository, initializePostRepositoryLogger } from '../repositories/post.repository';
import { CachedUserRepository, initializeCachedUserRepositoryLogger } from '../repositories/cachedUser.repository';
import winston from 'winston'; 

const router = express.Router();

export const setupPostRoutes = (logger: winston.Logger) => {
  initializePostRepositoryLogger(logger);
  initializeCachedUserRepositoryLogger(logger);

  const postRepository = new PostRepository(logger);
  const cachedUserRepository = new CachedUserRepository(logger);
  const postService = new PostService(postRepository, cachedUserRepository, logger);
  const postController = new PostController(postService, logger);

  router.post('/posts', postController.createPost.bind(postController));
  router.get('/posts/:postId', postController.getPostById.bind(postController));
  router.put('/posts/:postId', postController.updatePost.bind(postController));
  router.delete('/posts/:postId', postController.deletePost.bind(postController));
  router.get('/users/:userId/posts', postController.getPostsByUserId.bind(postController));
  router.get('/posts', postController.getAllPosts.bind(postController));

  return router;
};