import { Post, PostCreationAttributes, PostUpdateAttributes } from '../models/post.model';
import { PostRepository } from '../repositories/post.repository';
import axios from 'axios';

export class PostService {
  private postRepository: PostRepository;
  private userServiceUrl: string;

  constructor(postRepository: PostRepository, userServiceUrl: string) {
    this.postRepository = postRepository;
    this.userServiceUrl = userServiceUrl;
  }

  async createPost(post: PostCreationAttributes): Promise<Post> {
    try {
      await axios.get(`${this.userServiceUrl}/users/${post.userId}`);
    } catch (error) {
      throw new Error('User not found');
    }

    return this.postRepository.createPost(post);
  }

  async findPostById(postId: string): Promise<Post | undefined> {
    return this.postRepository.findPostById(postId);
  }

  async updatePost(postId: string, updatedPost: PostUpdateAttributes): Promise<Post | undefined> {
    return this.postRepository.updatePost(postId, updatedPost);
  }

  async deletePost(postId: string): Promise<boolean> {
    return this.postRepository.deletePost(postId);
  }

  async findPostsByUserId(userId: string): Promise<Post[]> {
    return this.postRepository.findPostsByUserId(userId);
  }

  async findAllPosts(): Promise<Post[]> {
    return this.postRepository.findAllPosts();
  }
}