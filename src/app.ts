import express, { Application, Request as ExpressRequest, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { setupPostRoutes } from './routes/post.routes';
import logger, { assignRequestId, requestLogger, logError, RequestWithId } from './utils/logger';

export class App {
  public app: Application;
  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.errorHandling();
  }

  private config(): void {
    this.app.use(assignRequestId); 

    const allowedOrigins = [
      'http://localhost:5173', 
      'http://127.0.0.1:5173',
    ];
    const corsOptions: cors.CorsOptions = {
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn('CORS blocked request', { origin, type: 'CorsErrorLog' });
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true, 
    };
    this.app.use(cors(corsOptions));

    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use(requestLogger); 
  }

  private routes(): void {
    this.app.use('/', setupPostRoutes(logger));
  }

  private errorHandling(): void {
    this.app.use((req: ExpressRequest, res: Response, next: NextFunction) => {
      const err: any = new Error('Not Found');
      err.status = 404;
      next(err);
    });

    this.app.use((err: any, req: ExpressRequest, res: Response, next: NextFunction) => {
      const typedReq = req as RequestWithId;
      logError(err, req, 'Unhandled error in Express request lifecycle');
      res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
        correlationId: typedReq.id,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    });
  }
}