import { Sequelize, DataTypes, Model } from 'sequelize';
import * as dotenv from 'dotenv';
import { CachedUser } from '../models/cachedUser.model';
import winston from 'winston';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME!,
  process.env.DB_USER!,
  process.env.DB_PASSWORD!,
  {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || '5432'),
    dialect: 'postgres',
    logging: false,
  }
);

class CachedUserModel extends Model<CachedUser, { user_id: string }> implements CachedUser {
  public user_id!: string;
  public created_at!: Date;
  public updated_at!: Date;
}

CachedUserModel.init(
  {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'cached_valid_users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

let repositoryLogger: winston.Logger;

export const initializeCachedUserRepositoryLogger = (loggerInstance: winston.Logger) => {
    repositoryLogger = loggerInstance;
};

export class CachedUserRepository {
  private logger: winston.Logger;

  constructor(loggerInstance?: winston.Logger) {
    this.logger = loggerInstance || repositoryLogger;
    if (!this.logger) {
        console.warn("CachedUserRepository initialized without a logger instance. Falling back to console.");
        this.logger = console as any;
    }
  }

  private logQuery(details: string, params: any, correlationId?: string, operation?: string) {
    this.logger.debug(`CachedUserRepository: Executing DB operation`, {
        correlationId,
        operation: operation || 'UnknownCachedUserDBOperation',
        details,
        params: process.env.NODE_ENV !== 'production' ? params : '[values_hidden_in_prod]',
        type: 'DBLog.CachedUserQuery'
    });
  }

  async addCachedUser(userId: string, correlationId?: string): Promise<CachedUser | undefined> {
    const operation = 'addCachedUser';
    this.logger.info(`CachedUserRepository: ${operation} initiated`, { correlationId, userId, type: `DBLog.${operation}` });
    try {
      this.logQuery(`CachedUserModel.upsert`, { user_id: userId }, correlationId, operation);
      const [cachedUserInstance] = await CachedUserModel.upsert({ user_id: userId }, { returning: true });
      
      if (cachedUserInstance) {
        this.logger.info(`CachedUserRepository: ${operation} successful`, { correlationId, userId, result: cachedUserInstance.toJSON(), type: `DBLog.${operation}Success` });
        return cachedUserInstance.toJSON() as CachedUser;
      } else {
        // Fallback if upsert with returning doesn't yield instance (should not happen for PG with correct options)
        // or if the record was just updated and not returned by default in some configurations
        const foundUser = await CachedUserModel.findByPk(userId);
        if (foundUser) {
            this.logger.info(`CachedUserRepository: ${operation} successful (found after upsert)`, { correlationId, userId, result: foundUser.toJSON(), type: `DBLog.${operation}SuccessAfterFind` });
            return foundUser.toJSON() as CachedUser;
        }
        this.logger.error(`CachedUserRepository: ${operation} failed to return or find instance post-upsert`, { correlationId, userId, type: `DBError.${operation}UpsertFail` });
        throw new Error('Database error: Failed to retrieve cached user after upsert.');
      }
    } catch (error: any) {
      this.logger.error(`CachedUserRepository: Error in ${operation}`, { correlationId, userId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error while caching user: ' + error.message);
    }
  }

  async removeCachedUser(userId: string, correlationId?: string): Promise<boolean> {
    const operation = 'removeCachedUser';
    this.logger.info(`CachedUserRepository: ${operation} initiated`, { correlationId, userId, type: `DBLog.${operation}` });
    try {
      this.logQuery(`CachedUserModel.destroy`, { where: { user_id: userId } }, correlationId, operation);
      const numberOfDeletedRows = await CachedUserModel.destroy({ where: { user_id: userId } });
      const success = numberOfDeletedRows > 0;
      this.logger.info(`CachedUserRepository: ${operation} ${success ? 'successful' : 'failed (user not found)'}`, { correlationId, userId, success, type: `DBLog.${operation}Result` });
      return success;
    } catch (error: any) {
      this.logger.error(`CachedUserRepository: Error in ${operation}`, { correlationId, userId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error while removing cached user: ' + error.message);
    }
  }

  async findCachedUserById(userId: string, correlationId?: string): Promise<CachedUser | undefined> {
    const operation = 'findCachedUserById';
    this.logger.info(`CachedUserRepository: ${operation} initiated`, { correlationId, userId, type: `DBLog.${operation}` });
    try {
      this.logQuery(`CachedUserModel.findByPk`, { userId }, correlationId, operation);
      const cachedUserInstance = await CachedUserModel.findByPk(userId);
      if (cachedUserInstance) {
        this.logger.info(`CachedUserRepository: ${operation} found user`, { correlationId, userId, type: `DBLog.${operation}Found` });
        return cachedUserInstance.toJSON() as CachedUser;
      } else {
        this.logger.info(`CachedUserRepository: ${operation} user not found`, { correlationId, userId, type: `DBLog.${operation}NotFound` });
        return undefined;
      }
    } catch (error: any) {
      this.logger.error(`CachedUserRepository: Error in ${operation}`, { correlationId, userId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error while finding cached user: ' + error.message);
    }
  }
}