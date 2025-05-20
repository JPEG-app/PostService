import winston from 'winston';
import { NextFunction, Request as ExpressRequest, Response } from 'express';
import addRequestId from 'express-request-id';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithId extends ExpressRequest {
  id?: string;
  authUserId?: string;
  startTime?: number;
}

export const assignRequestId = addRequestId({
    setHeader: true,
    headerName: 'X-Correlation-ID',
    generator: (req: ExpressRequest) => {
        const incomingId = req.headers['x-correlation-id'] || req.headers['X-Correlation-ID'];
        if (incomingId && typeof incomingId === 'string') {
            return incomingId;
        }
        return uuidv4();
    }
});

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format; // Add splat

const serviceName = process.env.SERVICE_NAME || 'post-service';

const baseFormat = combine(
  timestamp(),
  errors({ stack: true }), 
  splat(), 
  winston.format(info => { 
    info.service = serviceName;
    return info;
  })()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: baseFormat,
  transports: [],
  defaultMeta: { service: serviceName }, 
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      printf(({ level, message, timestamp, service, correlationId, authUserId, type, stack, ...rest }) => {
        let log = `${timestamp} [${service}] ${level}`;
        if (correlationId) log += ` [correlationId: ${correlationId}]`;
        if (authUserId) log += ` [authUserId: ${authUserId}]`; 
        if (type) log += ` [type: ${type}]`;
        log += `: ${message}`;

        const remainingMeta = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
        log += remainingMeta;

        if (stack) log += `\n${stack}`;
        return log;
      })
    ),
  }));
} else {
  logger.add(new winston.transports.Console({
    format: json(),
  }));
}

export const requestLogger = (req: ExpressRequest, res: Response, next: NextFunction) => {
  const typedReq = req as RequestWithId;
  typedReq.startTime = Date.now();

  let correlationId = typedReq.id;
  if (!correlationId) {
      correlationId = req.headers['x-correlation-id']?.toString() || uuidv4();
      typedReq.id = correlationId;
  }

  const commonLogMeta: any = {
    correlationId, 
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    type: 'RequestLog.Start'
  };
  if (typedReq.authUserId) {
    commonLogMeta.authUserId = typedReq.authUserId;
  }
  logger.info(`Incoming request`, commonLogMeta);

  res.on('finish', () => {
    const duration = Date.now() - (typedReq.startTime || Date.now());
    const finishLogMeta: any = {
      correlationId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      status: res.statusCode,
      durationMs: duration,
      type: 'RequestLog.Finish',
    };
    if (typedReq.authUserId) { 
        finishLogMeta.authUserId = typedReq.authUserId;
    }
    logger.info(`Request finished`, finishLogMeta);
  });

  res.on('error', (err) => {
    const errorLogMeta: any = {
        correlationId,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        error: err.message, 
        type: 'RequestErrorLog'
    };
    if (typedReq.authUserId) {
        errorLogMeta.authUserId = typedReq.authUserId;
    }
    logger.error(`Error in response stream: ${err.message}`, { ...errorLogMeta, errorObject: err });
  });

  next();
};

export const logError = (err: any, req?: ExpressRequest, messagePrefix?: string) => {
    const typedReq = req as RequestWithId | undefined;
    const correlationId = typedReq?.id || (err.isAxiosError && err.config?.headers?.['X-Correlation-ID']) || uuidv4();
    
    const errorMeta: any = { 
        correlationId,
        type: 'ApplicationErrorLog',
    };

    if (typedReq?.authUserId) {
        errorMeta.authUserId = typedReq.authUserId;
    }

    if (req) {
        errorMeta.request = {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
        };
    }
    if (err.status) errorMeta.status = err.status;
    if (err.code) errorMeta.errorCode = err.code; 

    const finalMessage = messagePrefix ? `${messagePrefix}: ${err.message}` : err.message;
    logger.error(finalMessage, { ...errorMeta, errorObject: err });
};

export default logger;