import { Sequelize, DataTypes, Model, Optional, UniqueConstraintError } from 'sequelize';
import * as dotenv from 'dotenv';
import { Post,  PostCreationAttributes, PostUpdateAttributes, Like} from '../models/post.model';
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

interface InternalPostAttributes {
  postId: number;
  userId: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

interface InternalPostCreationAttributes extends Optional<InternalPostAttributes, 'postId' | 'createdAt' | 'updatedAt'> {}

interface InternalLikeAttributes {
  likeId: number;
  userId: number;
  postId: number;
  createdAt: Date;
}

interface InternalLikeCreationAttributes extends Optional<InternalLikeAttributes, 'likeId' | 'createdAt'> {}


class PostModel extends Model<InternalPostAttributes, InternalPostCreationAttributes> implements InternalPostAttributes {
  public postId!: number;
  public userId!: number;
  public title!: string;
  public content!: string;
  public createdAt!: Date;
  public updatedAt!: Date;
}

PostModel.init(
  {
    postId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: 'post_id',
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'updated_at'
    }
  },
  {
    sequelize,
    tableName: 'posts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

class LikeModel extends Model<InternalLikeAttributes, InternalLikeCreationAttributes> implements InternalLikeAttributes {
  public likeId!: number;
  public userId!: number;
  public postId!: number;
  public createdAt!: Date;
}

LikeModel.init(
  {
    likeId: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        field: 'like_id'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id'
    },
    postId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'post_id',
      references: {
        model: PostModel,
        key: 'postId'
      }
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'created_at'
    }
  },
  {
    sequelize,
    tableName: 'likes',
    timestamps: true,
    updatedAt: false,
    createdAt: 'created_at',
    indexes: [
        {
            unique: true,
            fields: ['user_id', 'post_id']
        }
    ]
  }
);

PostModel.hasMany(LikeModel, { foreignKey: 'post_id', as: 'postLikes' });
LikeModel.belongsTo(PostModel, { foreignKey: 'post_id' });

let repositoryLogger: winston.Logger;

export const initializePostRepositoryLogger = (loggerInstance: winston.Logger) => {
    repositoryLogger = loggerInstance;
};

export class PostRepository {
  private logger: winston.Logger;

  constructor(loggerInstance?: winston.Logger) {
    this.logger = loggerInstance || repositoryLogger;
    if (!this.logger) {
        console.warn("PostRepository initialized without a logger instance. Falling back to console.");
        this.logger = console as any;
    }
  }

  private toPost(internalPost: PostModel): Post {
    const json = internalPost.toJSON() as InternalPostAttributes;
    const likeCount = parseInt(internalPost.get('likeCount' as any) || '0', 10);
    const hasUserLiked = !!internalPost.get('hasUserLiked' as any);

    return {
      ...json,
      postId: json.postId.toString(),
      userId: json.userId.toString(),
      likeCount: isNaN(likeCount) ? 0 : likeCount,
      hasUserLiked: hasUserLiked,
    };
  }

  private toPostOptional(internalPost: PostModel | null): Post | undefined {
    return internalPost ? this.toPost(internalPost) : undefined;
  }

  private toLike(internalLike: LikeModel): Like {
    const json = internalLike.toJSON() as InternalLikeAttributes;
    return {
      ...json,
      likeId: json.likeId.toString(),
      userId: json.userId.toString(),
      postId: json.postId.toString(),
    };
  }

  private toLikeOptional(internalLike: LikeModel | null): Like | undefined {
    return internalLike ? this.toLike(internalLike) : undefined;
  }


  private logQuery(details: string, params: any, correlationId?: string, operation?: string) {
    this.logger.debug(`PostRepository: Executing DB operation`, {
        correlationId,
        operation: operation || 'UnknownDBOperation',
        details,
        params: process.env.NODE_ENV !== 'production' ? params : '[values_hidden_in_prod]',
        type: 'DBLog.Query'
    });
  }

  private getPostFindOptions(requestingUserId?: string) {
    const attributes: any = {
      include: [
        [
          Sequelize.fn('COUNT', Sequelize.col('postLikes.like_id')),
          'likeCount'
        ]
      ]
    };

    if (requestingUserId) {
        const numericUserId = parseInt(requestingUserId, 10);
        if (!isNaN(numericUserId)) {
            const hasLikedSubquery = Sequelize.literal(
              `(EXISTS (SELECT 1 FROM likes WHERE likes.post_id = "PostModel".post_id AND likes.user_id = ${numericUserId}))`
            );
            attributes.include.push([hasLikedSubquery, 'hasUserLiked']);
        }
    }

    return {
      attributes,
      include: [{
        model: LikeModel,
        as: 'postLikes',
        attributes: [],
        required: false,
      }],
      group: ['PostModel.post_id'],
      subQuery: false
    };
  }

  async createPost(post: PostCreationAttributes, correlationId?: string): Promise<Post> {
    const operation = "createPost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId: post.userId, type: `DBLog.${operation}` });
    try {
      const numericUserId = parseInt(post.userId, 10);
      if (isNaN(numericUserId)) {
        throw new Error("Invalid userId format for post creation.");
      }
      const creationData = {
        userId: numericUserId,
        title: post.title,
        content: post.content,
      };
      this.logQuery(`PostModel.create`, creationData, correlationId, operation);
      const newPost = await PostModel.create(creationData);
      this.logger.info(`PostRepository: ${operation} successful`, { correlationId, postId: newPost.postId, type: `DBLog.${operation}Success` });
      
      const postWithDefaults = this.toPost(newPost);
      postWithDefaults.likeCount = 0;
      postWithDefaults.hasUserLiked = false;
      return postWithDefaults;

    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostById(postId: string, correlationId?: string, requestingUserId?: string): Promise<Post | undefined> {
    const operation = "findPostById";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, type: `DBLog.${operation}` });
    try {
      const numericPostId = parseInt(postId, 10);
      if (isNaN(numericPostId)) return undefined;

      const findOptions = this.getPostFindOptions(requestingUserId);
      
      this.logQuery(`PostModel.findOne with aggregations`, { where: { postId: numericPostId } }, correlationId, operation);
      const postInstance = await PostModel.findOne({
          ...findOptions,
          where: { postId: numericPostId },
      });

      if (postInstance) {
        this.logger.info(`PostRepository: ${operation} found post`, { correlationId, postId, type: `DBLog.${operation}Found` });
      } else {
        this.logger.info(`PostRepository: ${operation} post not found`, { correlationId, postId, type: `DBLog.${operation}NotFound` });
      }
      return this.toPostOptional(postInstance);
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async updatePost(postId: string, updatedPost: PostUpdateAttributes, correlationId?: string): Promise<Post | undefined> {
    const operation = "updatePost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, data: updatedPost, type: `DBLog.${operation}` });
    try {
      const numericPostId = parseInt(postId, 10);
      if (isNaN(numericPostId)) return undefined;

      const updateData: Partial<PostUpdateAttributes> = {};
      let hasUpdates = false;

      if (updatedPost.title !== undefined) {
        updateData.title = updatedPost.title;
        hasUpdates = true;
      }
      if (updatedPost.content !== undefined) {
        updateData.content = updatedPost.content;
        hasUpdates = true;
      }

      if (!hasUpdates) {
        this.logger.info(`PostRepository: ${operation} - no fields to update, fetching current post.`, { correlationId, postId, type: `DBLog.${operation}NoChanges` });
        return this.findPostById(postId, correlationId);
      }

      this.logQuery(`PostModel.update`, { postId: numericPostId, ...updateData }, correlationId, operation);
      const [numberOfAffectedRows] = await PostModel.update(updateData, {
        where: { postId: numericPostId },
      });

      const postAfterAttempt = await PostModel.findByPk(numericPostId);

      if (postAfterAttempt) {
        if (numberOfAffectedRows > 0) {
            this.logger.info(`PostRepository: ${operation} successful`, { correlationId, postId, type: `DBLog.${operation}Success` });
        } else {
             this.logger.info(`PostRepository: ${operation} - post found, but no data fields were modified by the update.`, { correlationId, postId, type: `DBLog.${operation}NoActualChange` });
        }
        return this.toPost(postAfterAttempt);
      } else {
        this.logger.info(`PostRepository: ${operation} - post not found for update`, { correlationId, postId, type: `DBLog.${operation}NotFoundForUpdate` });
        return undefined;
      }
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async deletePost(postId: string, correlationId?: string): Promise<boolean> {
    const operation = "deletePost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, type: `DBLog.${operation}` });
    const numericPostId = parseInt(postId, 10);
    if (isNaN(numericPostId)) return false;

    const transaction = await sequelize.transaction();
    try {
      this.logQuery(`LikeModel.destroy for post`, { where: { postId: numericPostId } }, correlationId, operation + "DeleteLikes");
      await LikeModel.destroy({ where: { postId: numericPostId }, transaction });

      this.logQuery(`PostModel.destroy`, { where: { postId: numericPostId } }, correlationId, operation);
      const numberOfDeletedRows = await PostModel.destroy({ where: { postId: numericPostId }, transaction });
      
      await transaction.commit();
      const success = numberOfDeletedRows > 0;
      this.logger.info(`PostRepository: ${operation} ${success ? 'successful' : 'failed (post not found)'}`, { correlationId, postId, success, type: `DBLog.${operation}Result` });
      return success;
    } catch (error: any) {
      await transaction.rollback();
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostsByUserId(userId: string, correlationId?: string, requestingUserId?: string): Promise<Post[]> {
    const operation = "findPostsByUserId";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId, type: `DBLog.${operation}` });
    try {
      const numericUserId = parseInt(userId, 10);
      if (isNaN(numericUserId)) return [];

      const findOptions = this.getPostFindOptions(requestingUserId);

      this.logQuery(`PostModel.findAll with aggregations`, { where: { userId: numericUserId } }, correlationId, operation);
      const posts = await PostModel.findAll({
          ...findOptions, 
          where: { userId: numericUserId },
          order: [['createdAt', 'DESC']]
      });
      this.logger.info(`PostRepository: ${operation} found ${posts.length} posts`, { correlationId, userId, count: posts.length, type: `DBLog.${operation}Result` });
      return posts.map(post => this.toPost(post));
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, userId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findAllPosts(correlationId?: string, requestingUserId?: string): Promise<Post[]> {
    const operation = "findAllPosts";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, type: `DBLog.${operation}` });
    try {
      const findOptions = this.getPostFindOptions(requestingUserId);

      this.logQuery(`PostModel.findAll with aggregations`, {}, correlationId, operation);
      const posts = await PostModel.findAll({
          ...findOptions,
          order: [['createdAt', 'DESC']]
      });
      this.logger.info(`PostRepository: ${operation} found ${posts.length} posts`, { correlationId, count: posts.length, type: `DBLog.${operation}Result` });
      return posts.map(post => this.toPost(post));
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async createLike(userId: string, postId: string, correlationId?: string): Promise<Like> {
    const operation = "createLike";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId, postId, type: `DBLog.${operation}` });
    try {
        const numericUserId = parseInt(userId, 10);
        const numericPostId = parseInt(postId, 10);
        if (isNaN(numericUserId) || isNaN(numericPostId)) {
            throw new Error("Invalid userId or postId format for like creation.");
        }
        const creationData = { userId: numericUserId, postId: numericPostId };
        this.logQuery(`LikeModel.create`, creationData, correlationId, operation);
        const newLike = await LikeModel.create(creationData);
        this.logger.info(`PostRepository: ${operation} successful`, { correlationId, likeId: newLike.likeId, type: `DBLog.${operation}Success`});
        return this.toLike(newLike);
    } catch (error: any) {
        if (error instanceof UniqueConstraintError) {
            this.logger.warn(`PostRepository: ${operation} - Like already exists`, { correlationId, userId, postId, type: `DBLog.${operation}Duplicate` });
            const existingLike = await this.findLikeByUserAndPost(userId, postId, correlationId);
            if (existingLike) return existingLike;
            throw new Error('Like already exists');
        }
        this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, userId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
        throw new Error('Database error: ' + error.message);
    }
  }

  async deleteLike(userId: string, postId: string, correlationId?: string): Promise<boolean> {
    const operation = "deleteLike";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId, postId, type: `DBLog.${operation}` });
    try {
        const numericUserId = parseInt(userId, 10);
        const numericPostId = parseInt(postId, 10);
        if (isNaN(numericUserId) || isNaN(numericPostId)) return false;

        const destructionData = { userId: numericUserId, postId: numericPostId };
        this.logQuery(`LikeModel.destroy`, { where: destructionData }, correlationId, operation);
        const affectedRows = await LikeModel.destroy({ where: destructionData });
        const success = affectedRows > 0;
        this.logger.info(`PostRepository: ${operation} ${success ? 'successful' : 'failed (like not found)'}`, { correlationId, userId, postId, success, type: `DBLog.${operation}Result` });
        return success;
    } catch (error: any) {
        this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, userId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
        throw new Error('Database error: ' + error.message);
    }
  }

  async findLikeByUserAndPost(userId: string, postId: string, correlationId?: string): Promise<Like | undefined> {
    const operation = "findLikeByUserAndPost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId, postId, type: `DBLog.${operation}` });
    try {
        const numericUserId = parseInt(userId, 10);
        const numericPostId = parseInt(postId, 10);
        if (isNaN(numericUserId) || isNaN(numericPostId)) return undefined;

        const queryData = { userId: numericUserId, postId: numericPostId };
        this.logQuery(`LikeModel.findOne`, { where: queryData }, correlationId, operation);
        const likeInstance = await LikeModel.findOne({ where: queryData });
        if (likeInstance) {
            this.logger.info(`PostRepository: ${operation} found like`, { correlationId, userId, postId, type: `DBLog.${operation}Found`});
        } else {
            this.logger.info(`PostRepository: ${operation} like not found`, { correlationId, userId, postId, type: `DBLog.${operation}NotFound`});
        }
        return this.toLikeOptional(likeInstance);
    } catch (error: any) {
        this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, userId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
        throw new Error('Database error: ' + error.message);
    }
  }

  async countLikesForPost(postId: string, correlationId?: string): Promise<number> {
    const operation = "countLikesForPost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, type: `DBLog.${operation}` });
    try {
        const numericPostId = parseInt(postId, 10);
        if (isNaN(numericPostId)) return 0;

        this.logQuery(`LikeModel.count`, { where: { postId: numericPostId } }, correlationId, operation);
        const count = await LikeModel.count({ where: { postId: numericPostId } });
        this.logger.info(`PostRepository: ${operation} successful, count: ${count}`, { correlationId, postId, count, type: `DBLog.${operation}Success`});
        return count;
    } catch (error: any) {
        this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
        throw new Error('Database error: ' + error.message);
    }
  }
}