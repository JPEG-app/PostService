export interface Post {
  postId: string;
  userId: string;
  title: string;
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PostCreationAttributes {
  userId: string;
  title: string;
  content: string;
}

export interface PostUpdateAttributes {
  title: string;
  content: string;
}