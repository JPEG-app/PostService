export interface Post {
  postId: string;
  userId: string;
  title: string;
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
  likeCount?: number;
  hasUserLiked?: boolean;
}

export interface PostCreationAttributes {
  userId: string;
  title: string;
  content: string;
}

export interface PostUpdateAttributes {
  title?: string;
  content?: string;
}

export interface Like {
  likeId?: string; 
  userId: string;
  postId: string;
  createdAt?: Date;
}