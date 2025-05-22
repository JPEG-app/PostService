import { Sequelize, DataTypes, Model, UniqueConstraintError } from 'sequelize';
import * as dotenv from 'dotenv';
import { Post, PostCreationAttributes, PostUpdateAttributes, Like } from '../models/post.model';
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

class PostModel extends Model<Post, PostCreationAttributes> implements Post {
  public postId!: string;
  public userId!: string;
  public title!: string;
  public content!: string;
  public createdAt!: Date;
  public updatedAt!: Date;
}

PostModel.init(
  {
    postId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      field: 'post_id',
    },
    userId: {
      type: DataTypes.UUID,
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
  },
  {
    sequelize,
    tableName: 'posts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

class LikeModel extends Model<Like, { userId: string; postId: string }> implements Like {
  public likeId!: string; // Sequelize adds 'id' by default if no PK is specified, let's use likeId
  public userId!: string;
  public postId!: string;
  public createdAt!: Date;
}

LikeModel.init(
  {
    likeId: { // Using a dedicated primary key for the Like table
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        field: 'like_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'post_id',
      references: {
        model: PostModel,
        key: 'post_id'
      }
    }
  },
  {
    sequelize,
    tableName: 'likes',
    timestamps: true,
    updatedAt: false, // Likes typically only have a createdAt
    createdAt: 'created_at',
    indexes: [ // Ensure a user can only like a post once
        {
            unique: true,
            fields: ['user_id', 'post_id']
        }
    ]
  }
);

PostModel.hasMany(LikeModel, { foreignKey: 'postId', as: 'postLikes' });
LikeModel.belongsTo(PostModel, { foreignKey: 'postId' });
// If you have UserModel defined elsewhere and want to associate, you would add:
// UserModel.hasMany(LikeModel, { foreignKey: 'userId' });
// LikeModel.belongsTo(UserModel, { foreignKey: 'userId' });


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

  private logQuery(details: string, params: any, correlationId?: string, operation?: string) {
    this.logger.debug(`PostRepository: Executing DB operation`, {
        correlationId,
        operation: operation || 'UnknownDBOperation',
        details,
        params: process.env.NODE_ENV !== 'production' ? params : '[values_hidden_in_prod]', 
        type: 'DBLog.Query'
    });
  }

  async createPost(post: PostCreationAttributes, correlationId?: string): Promise<Post> {
    const operation = "createPost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId: post.userId, type: `DBLog.${operation}` });
    try {
      this.logQuery(`PostModel.create`, post, correlationId, operation);
      const newPost = await PostModel.create(post);
      if (!newPost || !newPost.postId) {
        this.logger.error(`PostRepository: ${operation} did not return a valid post with postId.`, { correlationId, resultRow: newPost, type: `DBError.${operation}NoId` });
        throw new Error("Failed to create post or retrieve its ID after creation.");
      }
      this.logger.info(`PostRepository: ${operation} successful`, { correlationId, postId: newPost.postId, type: `DBLog.${operation}Success` });
      return newPost.toJSON() as Post;
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostById(postId: string, correlationId?: string): Promise<Post | undefined> {
    const operation = "findPostById";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, type: `DBLog.${operation}` });
    try {
      this.logQuery(`PostModel.findByPk`, { postId }, correlationId, operation);
      const postInstance = await PostModel.findByPk(postId);
      if (postInstance) {
        this.logger.info(`PostRepository: ${operation} found post`, { correlationId, postId, type: `DBLog.${operation}Found` });
        return postInstance.toJSON() as Post;
      } else {
        this.logger.info(`PostRepository: ${operation} post not found`, { correlationId, postId, type: `DBLog.${operation}NotFound` });
        return undefined;
      }
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async updatePost(postId: string, updatedPost: PostUpdateAttributes, correlationId?: string): Promise<Post | undefined> {
    const operation = "updatePost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, data: updatedPost, type: `DBLog.${operation}` });
    try {
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
      
      this.logQuery(`PostModel.update`, { postId, ...updateData }, correlationId, operation);
      const [numberOfAffectedRows] = await PostModel.update(updateData, {
        where: { postId },
      });

      const postAfterAttempt = await PostModel.findByPk(postId);

      if (postAfterAttempt) {
        if (numberOfAffectedRows > 0) {
            this.logger.info(`PostRepository: ${operation} successful`, { correlationId, postId, type: `DBLog.${operation}Success` });
        } else {
             this.logger.info(`PostRepository: ${operation} - post found, but no data fields were modified by the update.`, { correlationId, postId, type: `DBLog.${operation}NoActualChange` });
        }
        return postAfterAttempt.toJSON() as Post;
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
    try {
      this.logQuery(`PostModel.destroy`, { where: { postId } }, correlationId, operation);
      // Also delete associated likes
      await LikeModel.destroy({ where: { postId } }); // if in a transaction
      const numberOfDeletedRows = await PostModel.destroy({ where: { postId } });
      const success = numberOfDeletedRows > 0;
      this.logger.info(`PostRepository: ${operation} ${success ? 'successful' : 'failed (post not found)'}`, { correlationId, postId, success, type: `DBLog.${operation}Result` });
      return success;
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findPostsByUserId(userId: string, correlationId?: string): Promise<Post[]> {
    const operation = "findPostsByUserId";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId, type: `DBLog.${operation}` });
    try {
      this.logQuery(`PostModel.findAll`, { where: { userId } }, correlationId, operation);
      const posts = await PostModel.findAll({ where: { userId } });
      this.logger.info(`PostRepository: ${operation} found ${posts.length} posts`, { correlationId, userId, count: posts.length, type: `DBLog.${operation}Result` });
      return posts.map(post => post.toJSON() as Post);
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, userId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async findAllPosts(correlationId?: string): Promise<Post[]> {
    const operation = "findAllPosts";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, type: `DBLog.${operation}` });
    try {
      this.logQuery(`PostModel.findAll`, {}, correlationId, operation);
      const posts = await PostModel.findAll();
      this.logger.info(`PostRepository: ${operation} found ${posts.length} posts`, { correlationId, count: posts.length, type: `DBLog.${operation}Result` });
      return posts.map(post => post.toJSON() as Post);
    } catch (error: any) {
      this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
      throw new Error('Database error: ' + error.message);
    }
  }

  async createLike(userId: string, postId: string, correlationId?: string): Promise<Like> {
    const operation = "createLike";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, userId, postId, type: `DBLog.${operation}` });
    try {
        this.logQuery(`LikeModel.create`, { userId, postId }, correlationId, operation);
        const newLike = await LikeModel.create({ userId, postId });
        this.logger.info(`PostRepository: ${operation} successful`, { correlationId, likeId: newLike.likeId, type: `DBLog.${operation}Success`});
        return newLike.toJSON() as Like;
    } catch (error: any) {
        if (error instanceof UniqueConstraintError) {
            this.logger.warn(`PostRepository: ${operation} - Like already exists`, { correlationId, userId, postId, type: `DBLog.${operation}Duplicate` });
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
        this.logQuery(`LikeModel.destroy`, { where: { userId, postId } }, correlationId, operation);
        const affectedRows = await LikeModel.destroy({ where: { userId, postId } });
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
        this.logQuery(`LikeModel.findOne`, { where: { userId, postId } }, correlationId, operation);
        const likeInstance = await LikeModel.findOne({ where: { userId, postId } });
        if (likeInstance) {
            this.logger.info(`PostRepository: ${operation} found like`, { correlationId, userId, postId, type: `DBLog.${operation}Found`});
            return likeInstance.toJSON() as Like;
        } else {
            this.logger.info(`PostRepository: ${operation} like not found`, { correlationId, userId, postId, type: `DBLog.${operation}NotFound`});
            return undefined;
        }
    } catch (error: any) {
        this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, userId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
        throw new Error('Database error: ' + error.message);
    }
  }

  async countLikesForPost(postId: string, correlationId?: string): Promise<number> {
    const operation = "countLikesForPost";
    this.logger.info(`PostRepository: ${operation} initiated`, { correlationId, postId, type: `DBLog.${operation}` });
    try {
        this.logQuery(`LikeModel.count`, { where: { postId } }, correlationId, operation);
        const count = await LikeModel.count({ where: { postId } });
        this.logger.info(`PostRepository: ${operation} successful, count: ${count}`, { correlationId, postId, count, type: `DBLog.${operation}Success`});
        return count;
    } catch (error: any) {
        this.logger.error(`PostRepository: Error in ${operation}`, { correlationId, postId, error: error.message, stack: error.stack, type: `DBError.${operation}` });
        throw new Error('Database error: ' + error.message);
    }
  }
}