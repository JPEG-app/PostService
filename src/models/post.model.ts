export interface Post {
    postId?: string;
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
    title?: string;
    content?: string;
  }

/*
models/post.model.ts
repositories/post.repository.ts
services/post.service.ts
controllers/post.controller.ts
routes/post.routes.ts
middlewares/auth.middleware.ts (if needed)
app.ts
index.ts
utils/ (as needed during implementation)
*/