import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import * as dotenv from 'dotenv';
import { CachedUserRepository } from '../repositories/cachedUser.repository';

dotenv.config();

const kafkaBroker = process.env.KAFKA_BROKER || 'localhost:9092';
const clientId = process.env.KAFKA_CLIENT_ID_POST || 'post-service-consumer';
const userLifecycleTopic = process.env.USER_LIFECYCLE_TOPIC || 'user_lifecycle_events';
const consumerGroupId = process.env.KAFKA_CONSUMER_GROUP_POST || 'post-service-user-events-group';

const kafka = new Kafka({
  clientId: clientId,
  brokers: [kafkaBroker],
});

let consumer: Consumer | null = null;
let cachedUserRepository: CachedUserRepository | null = null;

interface UserLifecycleEvent {
  eventType: 'UserCreated' | 'UserDeleted' | 'UserUpdated';
  userId: string;
  timestamp: string;
}

const initializeCachedUserRepository = (): CachedUserRepository => {
  if (!cachedUserRepository) {
    cachedUserRepository = new CachedUserRepository();
  }
  return cachedUserRepository;
};

const handleUserLifecycleEvent = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  if (!message.value) {
    console.warn('Received Kafka message with no value.');
    return;
  }

  const repo = initializeCachedUserRepository();
  const eventDataString = message.value.toString();
  console.log(`Received message from topic ${topic}: ${eventDataString}`);

  try {
    const event: UserLifecycleEvent = JSON.parse(eventDataString);

    if (!event.userId || !event.eventType) {
        console.warn('Received malformed user lifecycle event:', event);
        return;
    }

    switch (event.eventType) {
      case 'UserCreated':
        await repo.addCachedUser(event.userId);
        console.log(`Cached user ${event.userId} due to UserCreated event.`);
        break;
      case 'UserDeleted':
        await repo.removeCachedUser(event.userId);
        console.log(`Removed cached user ${event.userId} due to UserDeleted event.`);
        break;
      case 'UserUpdated':
        // For now, UserUpdated might just refresh the updated_at timestamp
        // or ensure the user exists if they were somehow missed.
        await repo.addCachedUser(event.userId);
        console.log(`Refreshed cached user ${event.userId} due to UserUpdated event.`);
        break;
      default:
        console.warn(`Unknown event type received: ${event.eventType}`);
    }
  } catch (error) {
    console.error('Error processing user lifecycle event:', error);
    console.error('Failed event data:', eventDataString);
    // Implement more robust error handling (e.g., dead-letter queue)
  }
};

export const startUserEventsConsumer = async (): Promise<void> => {
  if (consumer) {
    console.log('User events consumer already running.');
    return;
  }

  initializeCachedUserRepository();
  consumer = kafka.consumer({ groupId: consumerGroupId });

  try {
    await consumer.connect();
    console.log(`Kafka Consumer [${clientId}] connected to ${kafkaBroker} for group ${consumerGroupId}`);
    await consumer.subscribe({ topic: userLifecycleTopic, fromBeginning: true });
    console.log(`Subscribed to topic: ${userLifecycleTopic}`);

    await consumer.run({
      eachMessage: handleUserLifecycleEvent,
    });
    console.log('User events consumer is running...');
  } catch (error) {
    console.error(`Failed to start Kafka Consumer [${clientId}]:`, error);
    if (consumer) {
      await consumer.disconnect().catch(disconnectError => {
        console.error('Error disconnecting consumer after startup failure:', disconnectError);
      });
      consumer = null;
    }
    throw error;
  }
};

export const stopUserEventsConsumer = async (): Promise<void> => {
  if (consumer) {
    try {
      await consumer.disconnect();
      console.log(`Kafka Consumer [${clientId}] disconnected.`);
    } catch (error) {
      console.error(`Error disconnecting Kafka Consumer [${clientId}]:`, error);
    } finally {
      consumer = null;
    }
  } else {
    console.log('User events consumer was not running.');
  }
};