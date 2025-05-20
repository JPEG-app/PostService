// post-service/src/index.ts
import { App } from './app';
import * as dotenv from 'dotenv';
import { startUserEventsConsumer, stopUserEventsConsumer, initializeConsumerDependencies } from './kafka/consumer'; // Updated import for initializeConsumerDependencies
import { getKafkaProducer as getPostProducer, disconnectProducer as disconnectPostProducer, initializeKafkaProducerLogger } from './kafka/producer';
import logger from './utils/logger';

dotenv.config();

const port = process.env.PORT || 3001;
const jwtSecret = process.env.JWT_SECRET; // Get JWT_SECRET

if (!jwtSecret) {
  logger.error('PostService: JWT_SECRET environment variable is not set.', { type: 'StartupLog.FatalConfigError' });
  process.exit(1);
}

const startService = async () => {
  logger.info('Post Service starting...', { type: 'StartupLog.Init' });
  try {
    initializeKafkaProducerLogger(logger);
    // Pass logger to initializeConsumerDependencies
    initializeConsumerDependencies(logger);
    await startUserEventsConsumer(logger); // startUserEventsConsumer might not need logger if initializeConsumerDependencies sets it globally
    logger.info('Kafka consumer for user events started successfully.', { type: 'StartupLog.UserConsumerReady' });

    await getPostProducer(logger);
    logger.info('Kafka producer for post events initialized successfully.', { type: 'StartupLog.PostProducerReady' });

    const appInstance = new App(jwtSecret); // Pass jwtSecret to App
    const expressApp = appInstance.app;

    const server = expressApp.listen(port, () => {
      logger.info(`Post Service is running on port ${port}`, { port, type: 'StartupLog.HttpReady' });
    });

    // ... (shutdown logic remains the same) ...
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down Post Service gracefully.`, { signal, type: 'ShutdownLog.SignalReceived' });
      server.close(async (err?: Error) => {
        if (err) {
            logger.error('Error during HTTP server close:', { error: err.message, stack: err.stack, type: 'ShutdownLog.HttpCloseError'});
        } else {
            logger.info('HTTP server closed.', { type: 'ShutdownLog.HttpClosed' });
        }
        await stopUserEventsConsumer();
        logger.info('User events Kafka consumer stopped.', { type: 'ShutdownLog.UserConsumerStopped' });
        await disconnectPostProducer();
        logger.info('Post events Kafka producer stopped.', { type: 'ShutdownLog.PostProducerStopped' });
        process.exit(err ? 1 : 0);
      });

      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down', { timeout: 10000, type: 'ShutdownLog.ForceExit' });
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
        logger.error('Unhandled synchronous error (uncaughtException):', { error: error.message, stack: error.stack, type: 'FatalErrorLog.UncaughtException' });
        stopUserEventsConsumer().finally(() => disconnectPostProducer().finally(() => process.exit(1)));
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled promise rejection:', { reason, type: 'FatalErrorLog.UnhandledRejection' });
    });


  } catch (error: any) {
    logger.error('Failed to start Post Service or Kafka components.', { error: error.message, stack: error.stack, type: 'StartupLog.FatalError' });
    // ... (shutdown logic on failure remains the same) ...
    await stopUserEventsConsumer().catch(e => logger.error("Error stopping user consumer during failed startup", { error: (e as Error).message, type: 'ShutdownLog.UserConsumerFailStop'}));
    await disconnectPostProducer().catch(e => logger.error("Error stopping post producer during failed startup", { error: (e as Error).message, type: 'ShutdownLog.PostProducerFailStop'}));
    process.exit(1);
  }
};

startService();