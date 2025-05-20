import { Post, PostCreationAttributes, PostUpdateAttributes } from '../models/post.model';
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
      this.logger.error('PostService: createPost - Forbidden, userId mismatch.', { type: 'ServiceAuthError.createPostMismatch' });
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
    this.logger.info('PostService: updatePost initiated', { correlationId, postId, data: updatedPostData, type: 'ServiceLog.updatePost' });
    const post = await this.postRepository.updatePost(postId, updatedPostData, correlationId);
    const existingPost = await this.postRepository.findPostById(postId, correlationId);
    if (!existingPost) {
      this.logger.warn('PostService: updatePost - Post not found for update', { /*...*/ });
      throw new Error('Post not found for update');
    }
    if (existingPost.userId !== requestingAuthUserId) {
      this.logger.error('PostService: updatePost - Forbidden, user is not author.', { /*...*/ type: 'ServiceAuthError.updatePostForbidden' });
      throw new Error('Forbidden');
    }

    if (post) {
        this.logger.info('PostService: updatePost successful', { correlationId, postId, type: 'ServiceLog.updatePostSuccess' });
    } else {
        this.logger.warn('PostService: updatePost - Post not found or no changes made', { correlationId, postId, type: 'ServiceLog.updatePostNotFoundOrNoChange' });
    }
    return post;
  }

  async deletePost(postId: string, requestingAuthUserId: string, correlationId?: string): Promise<boolean> {
    this.logger.info('PostService: deletePost initiated', { correlationId, postId, type: 'ServiceLog.deletePost' });
    const existingPost = await this.postRepository.findPostById(postId, correlationId);
    if (!existingPost) {
      this.logger.warn('PostService: deletePost - Post not found for deletion', { /*...*/ });
      throw new Error('Post not found for deletion');
    }
    if (existingPost.userId !== requestingAuthUserId) {
      this.logger.error('PostService: deletePost - Forbidden, user is not author.', { /*...*/ type: 'ServiceAuthError.deletePostForbidden' });
      throw new Error('Forbidden');
    }
    const success = await this.postRepository.deletePost(postId, correlationId);
    if (success) {
        this.logger.info('PostService: deletePost successful', { correlationId, postId, type: 'ServiceLog.deletePostSuccess' });
    } else {
        this.logger.warn('PostService: deletePost - Post not found', { correlationId, postId, type: 'ServiceLog.deletePostNotFound' });
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
}