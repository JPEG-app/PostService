import { Post, PostCreationAttributes, PostUpdateAttributes, Like } from '../models/post.model';
import { PostRepository } from '../repositories/post.repository';
import { CachedUserRepository } from '../repositories/cachedUser.repository';
import { getKafkaProducer } from '../kafka/producer';
import { ProducerRecord, Message } from 'kafkajs';
import winston from 'winston';

const POST_EVENTS_TOPIC = process.env.POST_EVENTS_TOPIC || 'post_events';

export interface PostCreatedEventData extends Post {
  eventType: 'PostCreated';
  eventTimestamp: string;
}

export class PostService {
  private postRepository: PostRepository;
  private cachedUserRepository: CachedUserRepository;
  private logger: winston.Logger;

  constructor(
    postRepository: PostRepository,
    cachedUserRepository: CachedUserRepository,
    loggerInstance: winston.Logger,
  ) {
    this.postRepository = postRepository;
    this.cachedUserRepository = cachedUserRepository;
    this.logger = loggerInstance;
  }

  private async sendPostEvent(eventData: PostCreatedEventData, correlationId?: string): Promise<void> {
    this.logger.info(`PostService: Attempting to send ${eventData.eventType} event`, { correlationId, postId: eventData.postId, topic: POST_EVENTS_TOPIC, type: 'KafkaProducerLog.AttemptSend' });
    try {
      const producer = await getKafkaProducer(this.logger, correlationId); 
      const messages: Message[] = [{
        value: JSON.stringify(eventData),
        headers: correlationId ? { 'X-Correlation-ID': correlationId } : undefined,
      }];
      const record: ProducerRecord = {
        topic: POST_EVENTS_TOPIC,
        messages: messages,
      };
      await producer.send(record);
      this.logger.info(`PostService: Sent ${eventData.eventType} event successfully`, { correlationId, postId: eventData.postId, topic: POST_EVENTS_TOPIC, type: 'KafkaProducerLog.SentSuccess' });
    } catch (error: any) {
      this.logger.error(`PostService: Failed to send post event to Kafka`, { correlationId, postId: eventData.postId, topic: POST_EVENTS_TOPIC, error: error.message, stack: error.stack, type: 'KafkaProducerLog.SendError' });
    }
  }

  async createPost(postData: PostCreationAttributes, correlationId?: string, requestingAuthUserId?: string): Promise<Post> {
    if (requestingAuthUserId && postData.userId !== requestingAuthUserId) {
      this.logger.error('PostService: createPost - Forbidden, userId mismatch.', { correlationId, type: 'ServiceAuthError.createPostMismatch' });
      throw new Error('Forbidden');
    }

    this.logger.info('PostService: createPost initiated', { correlationId, userId: postData.userId, type: 'ServiceLog.createPost' });
    const userExists = await this.cachedUserRepository.findCachedUserById(postData.userId, correlationId);

    if (!userExists) {
      this.logger.warn(`PostService: User validation failed - User not found in local cache`, { correlationId, userId: postData.userId, type: 'ServiceValidationWarn.createPostUserNotFound' });
      throw new Error('User not found');
    }
    this.logger.info(`PostService: User validation successful for createPost`, { correlationId, userId: postData.userId, type: 'ServiceLog.createPostUserFound' });

    const createdPost = await this.postRepository.createPost(postData, correlationId);
    this.logger.info('PostService: Post created in repository', { correlationId, postId: createdPost.postId, type: 'ServiceLog.createPostRepoSuccess' });

    if (createdPost && createdPost.postId) {
      const eventPayload: PostCreatedEventData = {
        ...createdPost,
        eventType: 'PostCreated',
        eventTimestamp: new Date().toISOString(),
      };
      await this.sendPostEvent(eventPayload, correlationId);
    } else {
        this.logger.error("PostService: Post created but ID is missing, cannot send PostCreated Kafka event.", { correlationId, postData: createdPost, type: 'ServiceError.createPostMissingIdForEvent' });
    }
    return createdPost;
  }

  async findPostById(postId: string, correlationId?: string): Promise<Post | undefined> {
    this.logger.info('PostService: findPostById initiated', { correlationId, postId, type: 'ServiceLog.findPostById' });
    const post = await this.postRepository.findPostById(postId, correlationId);
    if (post) {
        this.logger.info('PostService: findPostById successful', { correlationId, postId, type: 'ServiceLog.findPostByIdFound' });
    } else {
        this.logger.warn('PostService: findPostById - Post not found', { correlationId, postId, type: 'ServiceLog.findPostByIdNotFound' });
    }
    return post;
  }

  async updatePost(postId: string, updatedPostData: PostUpdateAttributes, requestingAuthUserId: string, correlationId?: string): Promise<Post | undefined> {
    this.logger.info('PostService: updatePost initiated', { correlationId, postId, data: updatedPostData, requestingAuthUserId, type: 'ServiceLog.updatePost' });
    const existingPost = await this.postRepository.findPostById(postId, correlationId);
    if (!existingPost) {
      this.logger.warn('PostService: updatePost - Post not found for update', { correlationId, postId, type: 'ServiceLog.updatePostNotFoundForUpdate' });
      throw new Error('Post not found');
    }
    if (existingPost.userId !== requestingAuthUserId) {
      this.logger.error('PostService: updatePost - Forbidden, user is not author.', { correlationId, postId, postAuthor: existingPost.userId, requestingAuthUserId, type: 'ServiceAuthError.updatePostForbidden' });
      throw new Error('Forbidden');
    }

    const post = await this.postRepository.updatePost(postId, updatedPostData, correlationId);
    if (post) {
        this.logger.info('PostService: updatePost successful', { correlationId, postId, type: 'ServiceLog.updatePostSuccess' });
    } else {
        this.logger.warn('PostService: updatePost - Post not found or no changes made after attempting update', { correlationId, postId, type: 'ServiceLog.updatePostNotFoundOrNoChangeAfterAttempt' });
    }
    return post;
  }

  async deletePost(postId: string, requestingAuthUserId: string, correlationId?: string): Promise<boolean> {
    this.logger.info('PostService: deletePost initiated', { correlationId, postId, requestingAuthUserId, type: 'ServiceLog.deletePost' });
    const existingPost = await this.postRepository.findPostById(postId, correlationId);
    if (!existingPost) {
      this.logger.warn('PostService: deletePost - Post not found for deletion', { correlationId, postId, type: 'ServiceLog.deletePostNotFoundForDeletion' });
      throw new Error('Post not found');
    }
    if (existingPost.userId !== requestingAuthUserId) {
      this.logger.error('PostService: deletePost - Forbidden, user is not author.', { correlationId, postId, postAuthor: existingPost.userId, requestingAuthUserId, type: 'ServiceAuthError.deletePostForbidden' });
      throw new Error('Forbidden');
    }
    const success = await this.postRepository.deletePost(postId, correlationId);
    if (success) {
        this.logger.info('PostService: deletePost successful', { correlationId, postId, type: 'ServiceLog.deletePostSuccess' });
    } else {
        this.logger.warn('PostService: deletePost - Deletion failed in repository', { correlationId, postId, type: 'ServiceLog.deletePostRepoFail' });
    }
    return success;
  }

  async findPostsByUserId(userId: string, correlationId?: string): Promise<Post[]> {
    this.logger.info('PostService: findPostsByUserId initiated', { correlationId, userId, type: 'ServiceLog.findPostsByUserId' });
    const posts = await this.postRepository.findPostsByUserId(userId, correlationId);
    this.logger.info(`PostService: findPostsByUserId found ${posts.length} posts`, { correlationId, userId, count: posts.length, type: 'ServiceLog.findPostsByUserIdResult' });
    return posts;
  }

  async findAllPosts(correlationId?: string): Promise<Post[]> {
    this.logger.info('PostService: findAllPosts initiated', { correlationId, type: 'ServiceLog.findAllPosts' });
    const posts = await this.postRepository.findAllPosts(correlationId);
    this.logger.info(`PostService: findAllPosts found ${posts.length} posts`, { correlationId, count: posts.length, type: 'ServiceLog.findAllPostsResult' });
    return posts;
  }

  async likePost(postId: string, userId: string, correlationId?: string): Promise<Like> {
    this.logger.info('PostService: likePost initiated', { correlationId, postId, userId, type: 'ServiceLog.likePost' });
    const postExists = await this.postRepository.findPostById(postId, correlationId);
    if (!postExists) {
        this.logger.warn('PostService: likePost - Post not found', { correlationId, postId, type: 'ServiceValidationWarn.likePostNotFound' });
        throw new Error('Post not found');
    }
    const userExists = await this.cachedUserRepository.findCachedUserById(userId, correlationId);
    if (!userExists) {
        this.logger.warn('PostService: likePost - User not found in cache', { correlationId, userId, type: 'ServiceValidationWarn.likePostUserNotFound' });
        throw new Error('User not found');
    }
    
    try {
        const newLike = await this.postRepository.createLike(userId, postId, correlationId);
        this.logger.info('PostService: likePost successful', { correlationId, postId, userId, likeId: newLike.likeId, type: 'ServiceLog.likePostSuccess' });
        return newLike;
    } catch (error: any) {
        if (error.message === 'Like already exists') {
            this.logger.info('PostService: likePost - User already liked this post', { correlationId, postId, userId, type: 'ServiceLog.likePostAlreadyLiked' });
            // Optionally, find and return the existing like
            const existingLike = await this.postRepository.findLikeByUserAndPost(userId, postId, correlationId);
            if (!existingLike) { // Should not happen if UniqueConstraintError was thrown
                this.logger.error('PostService: likePost - Could not find existing like after UniqueConstraintError', { correlationId, postId, userId, type: 'ServiceError.likePostAlreadyLikedNotFound' });
                throw new Error('Failed to process like action');
            }
            return existingLike;
        }
        this.logger.error('PostService: likePost - Error creating like', { correlationId, postId, userId, error: error.message, type: 'ServiceError.likePost' });
        throw error;
    }
  }

  async unlikePost(postId: string, userId: string, correlationId?: string): Promise<boolean> {
    this.logger.info('PostService: unlikePost initiated', { correlationId, postId, userId, type: 'ServiceLog.unlikePost' });
    const postExists = await this.postRepository.findPostById(postId, correlationId);
    if (!postExists) {
        this.logger.warn('PostService: unlikePost - Post not found', { correlationId, postId, type: 'ServiceValidationWarn.unlikePostNotFound' });
        throw new Error('Post not found');
    }
    // No need to check cachedUser for unliking, if the like exists, the user existed at some point.

    const success = await this.postRepository.deleteLike(userId, postId, correlationId);
    if (success) {
        this.logger.info('PostService: unlikePost successful', { correlationId, postId, userId, type: 'ServiceLog.unlikePostSuccess' });
    } else {
        this.logger.info('PostService: unlikePost - Like not found or already unliked', { correlationId, postId, userId, type: 'ServiceLog.unlikePostNotFoundOrAlreadyUnliked' });
    }
    return success;
  }

  async getLikeCount(postId: string, correlationId?: string): Promise<number> {
    this.logger.info('PostService: getLikeCount initiated', { correlationId, postId, type: 'ServiceLog.getLikeCount' });
    const postExists = await this.postRepository.findPostById(postId, correlationId);
    if (!postExists) {
        this.logger.warn('PostService: getLikeCount - Post not found', { correlationId, postId, type: 'ServiceValidationWarn.getLikeCountPostNotFound' });
        throw new Error('Post not found');
    }
    const count = await this.postRepository.countLikesForPost(postId, correlationId);
    this.logger.info('PostService: getLikeCount successful', { correlationId, postId, count, type: 'ServiceLog.getLikeCountSuccess' });
    return count;
  }

  async hasUserLikedPost(postId: string, userId: string, correlationId?: string): Promise<boolean> {
    this.logger.info('PostService: hasUserLikedPost initiated', { correlationId, postId, userId, type: 'ServiceLog.hasUserLikedPost' });
    const like = await this.postRepository.findLikeByUserAndPost(userId, postId, correlationId);
    const hasLiked = !!like;
    this.logger.info(`PostService: hasUserLikedPost result: ${hasLiked}`, { correlationId, postId, userId, hasLiked, type: 'ServiceLog.hasUserLikedPostResult' });
    return hasLiked;
  }
}