import { Post, PostCreationAttributes, PostUpdateAttributes } from '../models/post.model';
import { PostRepository } from '../repositories/post.repository';
import { CachedUserRepository } from '../repositories/cachedUser.repository';
// The line below was incorrect and referred to user-service. We need post-service's own producer.
// import { getKafkaProducer as getUserServiceKafkaProducer } from '../../user-service/src/kafka/producer';
import { getKafkaProducer } from '../kafka/producer'; // Correct: Use producer from post-service/src/kafka/producer.ts
import { ProducerRecord } from 'kafkajs';

const POST_EVENTS_TOPIC = process.env.POST_EVENTS_TOPIC || 'post_events';

export interface PostCreatedEventData extends Post {
  eventType: 'PostCreated';
  eventTimestamp: string;
}

export class PostService {
  private postRepository: PostRepository;
  private cachedUserRepository: CachedUserRepository;

  constructor(
    postRepository: PostRepository,
    cachedUserRepository: CachedUserRepository
  ) {
    this.postRepository = postRepository;
    this.cachedUserRepository = cachedUserRepository;
  }

  private async sendPostEvent(eventData: PostCreatedEventData): Promise<void> {
    try {
      const producer = await getKafkaProducer();
      const record: ProducerRecord = {
        topic: POST_EVENTS_TOPIC,
        messages: [{ value: JSON.stringify(eventData) }],
      };
      await producer.send(record);
      console.log(`Sent ${eventData.eventType} event for postId ${eventData.postId} to Kafka topic ${POST_EVENTS_TOPIC}`);
    } catch (error) {
      console.error(`Failed to send post event to Kafka for postId ${eventData.postId}:`, error);
    }
  }

  async createPost(postData: PostCreationAttributes): Promise<Post> {
    const userExists = await this.cachedUserRepository.findCachedUserById(postData.userId);

    if (!userExists) {
      console.error(`User validation failed: User with ID ${postData.userId} not found in local cache.`);
      throw new Error('User not found');
    }

    const createdPost = await this.postRepository.createPost(postData);

    if (createdPost && createdPost.postId) {
      const eventPayload: PostCreatedEventData = {
        ...createdPost,
        eventType: 'PostCreated',
        eventTimestamp: new Date().toISOString(),
      };
      await this.sendPostEvent(eventPayload);
    } else {
        console.error("Post created but ID is missing, cannot send PostCreated Kafka event.");
    }

    return createdPost;
  }

  async findPostById(postId: string): Promise<Post | undefined> {
    return this.postRepository.findPostById(postId);
  }

  async updatePost(postId: string, updatedPost: PostUpdateAttributes): Promise<Post | undefined> {
    const post = await this.postRepository.updatePost(postId, updatedPost);
    return post;
  }

  async deletePost(postId: string): Promise<boolean> {
    const success = await this.postRepository.deletePost(postId);
    return success;
  }

  async findPostsByUserId(userId: string): Promise<Post[]> {
    return this.postRepository.findPostsByUserId(userId);
  }

  async findAllPosts(): Promise<Post[]> {
    return this.postRepository.findAllPosts();
  }
}