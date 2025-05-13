import express from 'express';
import { PostController } from '../controllers/post.controller';
import { PostService } from '../services/post.service';
import { PostRepository } from '../repositories/post.repository';
import { CachedUserRepository } from '../repositories/cachedUser.repository'; // Import new repo

const router = express.Router();

// userServiceUrl might not be needed anymore if its only purpose was user validation
// export const setupPostRoutes = (userServiceUrl: string) => {
export const setupPostRoutes = () => {
  const postRepository = new PostRepository();
  const cachedUserRepository = new CachedUserRepository(); // Instantiate new repo
  const postService = new PostService(postRepository, cachedUserRepository /*, userServiceUrl */); // Pass it to service
  const postController = new PostController(postService);

  router.post('/posts', postController.createPost.bind(postController));
  router.get('/posts/:postId', postController.getPostById.bind(postController));
  router.put('/posts/:postId', postController.updatePost.bind(postController));
  router.delete('/posts/:postId', postController.deletePost.bind(postController));
  router.get('/users/:userId/posts', postController.getPostsByUserId.bind(postController));
  router.get('/posts', postController.getAllPosts.bind(postController));

  return router;
};