import { Post, PostCreationAttributes, PostUpdateAttributes } from '../models/post.model';

const posts: Post[] = [];

export class PostRepository {
  async createPost(post: PostCreationAttributes): Promise<Post> {
    const newPost: Post = {
      postId: String(posts.length + 1),
      ...post,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    posts.push(newPost);
    return newPost;
  }

  async findPostById(postId: string): Promise<Post | undefined> {
    return posts.find((post) => post.postId === postId);
  }

  async updatePost(postId: string, updatedPost: PostUpdateAttributes): Promise<Post | undefined> {
    const postIndex = posts.findIndex((post) => post.postId === postId);
    if (postIndex !== -1) {
      posts[postIndex] = {
        ...posts[postIndex],
        ...updatedPost,
        updatedAt: new Date(),
      };
      return posts[postIndex];
    }
    return undefined;
  }

  async deletePost(postId: string): Promise<boolean> {
    const postIndex = posts.findIndex((post) => post.postId === postId);
    if (postIndex !== -1) {
      posts.splice(postIndex, 1);
      return true;
    }
    return false;
  }

  async findPostsByUserId(userId: string): Promise<Post[]> {
    return posts.filter((post) => post.userId === userId);
  }

  async findAllPosts(): Promise<Post[]> {
    return posts;
  }
}