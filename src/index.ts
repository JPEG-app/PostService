import { App } from './app';
import * as dotenv from 'dotenv';
import { startUserEventsConsumer, stopUserEventsConsumer } from './kafka/consumer';
import { getKafkaProducer as getPostProducer, disconnectProducer as disconnectPostProducer } from './kafka/producer'; // For post events

dotenv.config();

const port = process.env.PORT;

const startService = async () => {
  try {
    await startUserEventsConsumer();
    console.log('Kafka consumer for user events started successfully.');

    await getPostProducer(); // Initialize post events producer
    console.log('Kafka producer for post events initialized successfully.');

    const appInstance = new App();
    const expressApp = appInstance.app;

    const server = expressApp.listen(port, () => {
      console.log(`Post Service is running on port ${port}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`${signal} received. Shutting down Post Service gracefully.`);
      server.close(async () => {
        console.log('HTTP server closed.');
        await stopUserEventsConsumer();
        console.log('User events Kafka consumer stopped.');
        await disconnectPostProducer(); // Disconnect post events producer
        console.log('Post events Kafka producer stopped.');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start Post Service or Kafka components:', error);
    await stopUserEventsConsumer().catch(e => console.error("Error stopping user consumer during failed startup", e));
    await disconnectPostProducer().catch(e => console.error("Error stopping post producer during failed startup", e));
    process.exit(1);
  }
};

startService();