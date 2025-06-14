import { Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service';
import { RequestWithId } from '../utils/logger';
import winston from 'winston';

export function authMiddleware(tokenService: TokenService, logger: winston.Logger) {
  return async (req: RequestWithId, res: Response, next: NextFunction) => {
    const correlationId = req.id;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('AuthMiddleware (post-service): Unauthorized - Missing or malformed Bearer token', { correlationId, url: req.originalUrl, type: 'AuthMiddleware.PostService.Fail.NoToken' });
      return res.status(401).json({ message: 'Unauthorized: Access token is required.', correlationId });
    }

    const token = authHeader.split(' ')[1];
    const decoded = await tokenService.verifyToken(token, correlationId);

    if (!decoded || !decoded.userId) {
      logger.warn('AuthMiddleware (post-service): Unauthorized - Invalid token', { correlationId, url: req.originalUrl, type: 'AuthMiddleware.PostService.Fail.InvalidToken' });
      return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.', correlationId });
    }

    req.authUserId = decoded.userId;
    logger.info('AuthMiddleware (post-service): Authorized successfully', { correlationId, authUserId: req.authUserId, url: req.originalUrl, type: 'AuthMiddleware.PostService.Success' });
    next();
  };
}

export function tryAuthMiddleware(tokenService: TokenService, logger: winston.Logger) {
  return async (req: RequestWithId, res: Response, next: NextFunction) => {
    const correlationId = req.id;
    const authHeader = req.headers.authorization;
    const internalUserId = req.headers['x-user-id'] as string; 

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = await tokenService.verifyToken(token, correlationId);
      if (decoded && decoded.userId) {
        req.authUserId = decoded.userId;
        logger.info('tryAuthMiddleware (post-service): User identified via Bearer token', { correlationId, authUserId: req.authUserId });
      }
    } else if (internalUserId) {
      req.authUserId = internalUserId;
      logger.info('tryAuthMiddleware (post-service): User identified via internal X-User-ID header', { correlationId, authUserId: req.authUserId });
    }

    next();
  };
}