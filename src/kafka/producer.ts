import { Kafka, Producer, Partitioners } from 'kafkajs';
import * as dotenv from 'dotenv';

dotenv.config();

const kafkaBroker = process.env.KAFKA_BROKER || 'kafka:9092'; // Ensure this is correct
const clientId = process.env.KAFKA_CLIENT_ID_POST_PRODUCER || 'post-service-producer';

const kafka = new Kafka({
  clientId: clientId,
  brokers: [kafkaBroker],
  retry: { // Robust retry configuration
    initialRetryTime: 300,
    retries: 5
  }
});

let producer: Producer | null = null;
let isProducerConnected = false;

export const getKafkaProducer = async (): Promise<Producer> => {
  if (producer && isProducerConnected) {
    return producer;
  }
  const newProducer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
    allowAutoTopicCreation: true // Usually true for dev, might be false in prod
  });
  try {
    await newProducer.connect();
    console.log(`Kafka Producer [${clientId}] connected to ${kafkaBroker}`);
    producer = newProducer;
    isProducerConnected = true;
    return producer;
  } catch (error) {
    console.error(`Kafka Producer [${clientId}] failed to connect:`, error);
    isProducerConnected = false;
    producer = null;
    throw error;
  }
};

export const disconnectProducer = async (): Promise<void> => {
  if (producer) {
    try {
      await producer.disconnect();
      console.log(`Kafka Producer [${clientId}] disconnected.`);
    } catch (error) {
      console.error(`Error disconnecting Kafka Producer [${clientId}]:`, error);
    } finally {
      producer = null;
      isProducerConnected = false;
    }
  }
};