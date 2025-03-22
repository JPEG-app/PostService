import express from 'express';
import { PostController } from '../controllers/post.controller';
import { PostService } from '../services/post.service';
import { PostRepository } from '../repositories/post.repository';

const router = express.Router();

export const setupPostRoutes = (userServiceUrl: string) => {
  const postRepository = new PostRepository();
  const postService = new PostService(postRepository, userServiceUrl);
  const postController = new PostController(postService);

  router.post('/posts', postController.createPost.bind(postController));
  router.get('/posts/:postId', postController.getPostById.bind(postController));
  router.put('/posts/:postId', postController.updatePost.bind(postController));
  router.delete('/posts/:postId', postController.deletePost.bind(postController));
  router.get('/users/:userId/posts', postController.getPostsByUserId.bind(postController));
  router.get('/posts', postController.getAllPosts.bind(postController));

  return router;
};