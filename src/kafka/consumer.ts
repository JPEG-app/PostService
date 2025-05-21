import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import * as dotenv from 'dotenv';
import { CachedUserRepository, initializeCachedUserRepositoryLogger as initCachedUserRepoLoggerFromConsumer } from '../repositories/cachedUser.repository';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const kafkaBroker = process.env.KAFKA_BROKER || 'kafka.kafka-ca1.svc.cluster.local:9092';
const clientId = process.env.KAFKA_CLIENT_ID_POST || 'post-service-consumer';
const userLifecycleTopic = process.env.USER_LIFECYCLE_TOPIC || 'user_lifecycle_events';
const consumerGroupId = process.env.KAFKA_CONSUMER_GROUP_POST || 'post-service-user-events-group';

const kafka = new Kafka({
  clientId: clientId,
  brokers: [kafkaBroker],
  retry: {
    initialRetryTime: 3000,
    retries: 30,
    maxRetryTime: 30000,
    factor: 2,
    multiplier: 2,
  }
});

let consumer: Consumer | null = null;
let cachedUserRepositoryInstance: CachedUserRepository | null = null;
let consumerLogger: winston.Logger | Console = console; 

interface UserLifecycleEvent {
  eventType: 'UserCreated' | 'UserDeleted' | 'UserUpdated';
  userId: string;
  username?: string; 
  timestamp: string;
}

export const initializeConsumerDependencies = (loggerInstance: winston.Logger): CachedUserRepository => {
  consumerLogger = loggerInstance;
  initCachedUserRepoLoggerFromConsumer(loggerInstance); 
  if (!cachedUserRepositoryInstance) {
    cachedUserRepositoryInstance = new CachedUserRepository(loggerInstance);
  }
  return cachedUserRepositoryInstance;
};


const handleUserLifecycleEvent = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  const msgCorrelationId = message.headers?.['X-Correlation-ID']?.toString() ||
                           message.headers?.['correlationId']?.toString() ||
                           uuidv4();

  const logMetadata = {
      topic,
      partition,
      offset: message.offset,
      correlationId: msgCorrelationId,
      messageKey: message.key?.toString(),
      type: 'KafkaConsumerLog.UserLifecycleEventReceived'
  };

  if (!message.value) {
    consumerLogger.warn(`Kafka Consumer: Received message with no value.`, logMetadata );
    return;
  }

  if (!cachedUserRepositoryInstance) {
      consumerLogger.error('Kafka Consumer: CachedUserRepository not initialized. Skipping message.', logMetadata);
      return; 
  }

  const repo = cachedUserRepositoryInstance;
  const eventDataString = message.value.toString();
  consumerLogger.info(`Kafka Consumer: Received message, processing...`, { ...logMetadata, dataPreview: eventDataString.substring(0,100) + '...' });

  try {
    const event: UserLifecycleEvent = JSON.parse(eventDataString);

    if (!event.userId || !event.eventType) {
        consumerLogger.warn('Kafka Consumer: Received malformed user lifecycle event.', { ...logMetadata, eventData: eventDataString, type: 'KafkaConsumerLog.MalformedEvent' });
        return;
    }

    switch (event.eventType) {
      case 'UserCreated':
        await repo.addCachedUser(event.userId, msgCorrelationId);
        consumerLogger.info(`Kafka Consumer: Cached user due to UserCreated event.`, { ...logMetadata, userId: event.userId, eventType: event.eventType, type: 'KafkaConsumerLog.UserCreatedProcessed' });
        break;
      case 'UserDeleted':
        await repo.removeCachedUser(event.userId, msgCorrelationId);
        consumerLogger.info(`Kafka Consumer: Removed cached user due to UserDeleted event.`, { ...logMetadata, userId: event.userId, eventType: event.eventType, type: 'KafkaConsumerLog.UserDeletedProcessed' });
        break;
      case 'UserUpdated':
        await repo.addCachedUser(event.userId, msgCorrelationId);
        consumerLogger.info(`Kafka Consumer: Refreshed cached user due to UserUpdated event.`, { ...logMetadata, userId: event.userId, eventType: event.eventType, type: 'KafkaConsumerLog.UserUpdatedProcessed' });
        break;
      default:
        consumerLogger.warn(`Kafka Consumer: Unknown event type received.`, { ...logMetadata, eventTypeReceived: (event as any).eventType, type: 'KafkaConsumerLog.UnknownEventType' });
    }
  } catch (error: any) {
    consumerLogger.error('Kafka Consumer: Error processing user lifecycle event.', { ...logMetadata, error: error.message, stack: error.stack, eventData: eventDataString, type: 'KafkaConsumerLog.ProcessingError' });
  }
};

export const startUserEventsConsumer = async (loggerInstance: winston.Logger): Promise<void> => {
  initializeConsumerDependencies(loggerInstance); 

  if (consumer) {
    consumerLogger.info('Kafka Consumer: User events consumer already running.', { clientId, type: 'KafkaConsumerControl.AlreadyRunning'});
    return;
  }

  consumer = kafka.consumer({ groupId: consumerGroupId });

  try {
    await consumer.connect();
    consumerLogger.info(`Kafka Consumer [${clientId}] connected to ${kafkaBroker} for group ${consumerGroupId}`, { clientId, kafkaBroker, consumerGroupId, type: 'KafkaConsumerControl.Connected' });
    await consumer.subscribe({ topic: userLifecycleTopic, fromBeginning: true }); 
    consumerLogger.info(`Kafka Consumer: Subscribed to topic: ${userLifecycleTopic}`, { topic: userLifecycleTopic, type: 'KafkaConsumerControl.Subscribed' });

    await consumer.run({
      eachMessage: handleUserLifecycleEvent,
    });
    consumerLogger.info('Kafka Consumer: User events consumer is running...', { type: 'KafkaConsumerControl.Running' });
  } catch (error: any) {
    consumerLogger.error(`Kafka Consumer: Failed to start [${clientId}]`, { clientId, error: error.message, stack: error.stack, type: 'KafkaConsumerControl.StartError' });
    if (consumer) {
      await consumer.disconnect().catch(disconnectError => {
        consumerLogger.error('Kafka Consumer: Error disconnecting consumer after startup failure.', { error: (disconnectError as Error).message, type: 'KafkaConsumerControl.DisconnectErrorOnFail' });
      });
      consumer = null;
    }
    throw error;
  }
};

export const stopUserEventsConsumer = async (): Promise<void> => {
  if (consumer) {
    consumerLogger.info(`Kafka Consumer [${clientId}]: Disconnecting...`, { clientId, type: 'KafkaConsumerControl.Disconnecting' });
    try {
      await consumer.disconnect();
      consumerLogger.info(`Kafka Consumer [${clientId}] disconnected successfully.`, { clientId, type: 'KafkaConsumerControl.Disconnected' });
    } catch (error: any) {
      consumerLogger.error(`Kafka Consumer: Error disconnecting [${clientId}]`, { clientId, error: error.message, stack: error.stack, type: 'KafkaConsumerControl.DisconnectError' });
    } finally {
      consumer = null;
    }
  } else {
    consumerLogger.info('Kafka Consumer: User events consumer was not running or already stopped.', { type: 'KafkaConsumerControl.NotRunning' });
  }
};