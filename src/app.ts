import express, { Application, Request as ExpressRequest, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { setupPostRoutes } from './routes/post.routes';
import logger, { assignRequestId, requestLogger, logError, RequestWithId } from './utils/logger';
import { TokenService } from './services/token.service'; 

export class App {
  public app: Application;
  public tokenService: TokenService; 

  constructor(jwtSecret: string) { 
    this.app = express();
    if (!jwtSecret) {
        logger.error("PostService App: JWT_SECRET not provided to App constructor.", { type: "ConfigError.App" });
        throw new Error("JWT_SECRET is required for PostService App");
    }
    this.tokenService = new TokenService(jwtSecret, logger); 
    this.config();
    this.routes();
    this.errorHandling();
  }

  private config(): void {
    this.app.use(assignRequestId);
    
    const allowedOrigins = [
      'https://jpegapp.lol',
      'https://www.jpegapp.lol'
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
    this.app.options('*', cors(corsOptions));

    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use(requestLogger);
  }

  private routes(): void {
    this.app.use('/', setupPostRoutes(logger, this.tokenService));
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
        ...(typedReq.authUserId && { authUserId: typedReq.authUserId }), 
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    });
  }
}