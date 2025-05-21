import { Kafka, Producer, Partitioners, Message } from 'kafkajs';
import * as dotenv from 'dotenv';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const kafkaBroker = process.env.KAFKA_BROKER || 'kafka.kafka-ca1.svc.cluster.local:9092';
const clientId = process.env.KAFKA_CLIENT_ID_POST_PRODUCER || 'post-service-producer';

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

let producer: Producer | null = null;
let isProducerConnected = false;
let producerLogger: winston.Logger | Console = console;

export const initializeKafkaProducerLogger = (loggerInstance: winston.Logger) => {
    producerLogger = loggerInstance;
};

export const getKafkaProducer = async (loggerInstance?: winston.Logger, correlationId?: string): Promise<Producer> => {
  const currentLogger = loggerInstance || producerLogger;
  const opCorrelationId = correlationId || uuidv4();

  if (producer && isProducerConnected) {
    currentLogger.debug(`Kafka Producer [${clientId}]: Reusing existing connected producer.`, { correlationId: opCorrelationId, clientId, type: 'KafkaProducerLog.ReuseInstance' });
    return producer;
  }
  currentLogger.info(`Kafka Producer [${clientId}]: Creating new producer instance.`, { correlationId: opCorrelationId, clientId, type: 'KafkaProducerLog.CreateInstance' });
  const newProducer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: process.env.NODE_ENV !== 'production',
  });
  try {
    await newProducer.connect();
    currentLogger.info(`Kafka Producer [${clientId}] connected to ${kafkaBroker}`, { correlationId: opCorrelationId, clientId, kafkaBroker, type: 'KafkaProducerLog.Connected' });
    producer = newProducer;
    isProducerConnected = true;

    producer.on('producer.disconnect', () => {
        currentLogger.warn(`Kafka Producer [${clientId}] disconnected unexpectedly.`, { correlationId: opCorrelationId, clientId, type: 'KafkaProducerEvent.Disconnect' });
        isProducerConnected = false;
        producer = null; 
    });

    return producer;
  } catch (error: any) {
    currentLogger.error(`Kafka Producer [${clientId}] failed to connect.`, { correlationId: opCorrelationId, clientId, error: error.message, stack: error.stack, type: 'KafkaProducerLog.ConnectError' });
    isProducerConnected = false;
    producer = null;
    throw error;
  }
};

export const disconnectProducer = async (correlationId?: string): Promise<void> => {
  const opCorrelationId = correlationId || uuidv4();
  if (producer) {
    producerLogger.info(`Kafka Producer [${clientId}]: Disconnecting...`, { correlationId: opCorrelationId, clientId, type: 'KafkaProducerLog.Disconnecting' });
    try {
      await producer.disconnect();
      producerLogger.info(`Kafka Producer [${clientId}] disconnected successfully.`, { correlationId: opCorrelationId, clientId, type: 'KafkaProducerLog.Disconnected' });
    } catch (error: any) {
      producerLogger.error(`Error disconnecting Kafka Producer [${clientId}]`, { correlationId: opCorrelationId, clientId, error: error.message, stack: error.stack, type: 'KafkaProducerLog.DisconnectError' });
    } finally {
      producer = null;
      isProducerConnected = false;
    }
  } else {
    producerLogger.info(`Kafka Producer [${clientId}]: Was not connected or already disconnected.`, { correlationId: opCorrelationId, clientId, type: 'KafkaProducerLog.AlreadyDisconnected' });
  }
};