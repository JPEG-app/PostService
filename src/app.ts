// post-service/src/app.ts
import express, { Application, Request as ExpressRequest, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { setupPostRoutes } from './routes/post.routes';
import logger, { assignRequestId, requestLogger, logError, RequestWithId } from './utils/logger';
// REMOVE: import { extractAuthUserMiddleware } from './middleware/extractAuthUser.middleware';
import { TokenService } from './services/token.service'; // Import TokenService

export class App {
  public app: Application;
  public tokenService: TokenService; // Add TokenService instance

  constructor(jwtSecret: string) { // App needs jwtSecret now
    this.app = express();
    if (!jwtSecret) {
        logger.error("PostService App: JWT_SECRET not provided to App constructor.", { type: "ConfigError.App" });
        throw new Error("JWT_SECRET is required for PostService App");
    }
    this.tokenService = new TokenService(jwtSecret, logger); // Initialize TokenService
    this.config();
    this.routes();
    this.errorHandling();
  }

  private config(): void {
    this.app.use(assignRequestId);
    // REMOVE: this.app.use(extractAuthUserMiddleware);

    const allowedOrigins = [ /* ... */ ];
    const corsOptions: cors.CorsOptions = { /* ... */ };
    this.app.use(cors(corsOptions));
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use(requestLogger);
  }

  private routes(): void {
    // Pass logger AND tokenService to setupPostRoutes
    this.app.use('/', setupPostRoutes(logger, this.tokenService));
  }

  private errorHandling(): void { // Ensure this uses RequestWithId correctly
    this.app.use((req: ExpressRequest, res: Response, next: NextFunction) => {
      const err: any = new Error('Not Found');
      err.status = 404;
      next(err);
    });

    this.app.use((err: any, req: ExpressRequest, res: Response, next: NextFunction) => {
      const typedReq = req as RequestWithId; // Cast to access .id and potentially .authUserId
      logError(err, req, 'Unhandled error in Express request lifecycle');
      res.status(err.status || 500).json({
        message: err.message || 'Internal Server Error',
        correlationId: typedReq.id,
        ...(typedReq.authUserId && { authUserId: typedReq.authUserId }), // Include authUserId if available
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    });
  }
}