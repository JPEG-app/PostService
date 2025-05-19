import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import TestAgent from 'supertest/lib/agent';

jest.mock(
  '../../kafka/producer',
  () => {
    const mockSend = jest.fn().mockResolvedValue(undefined);
    const mockConnect = jest.fn().mockResolvedValue(undefined);
    const mockDisconnect = jest.fn().mockResolvedValue(undefined);
    const mockProducerInstance = {
      send: mockSend,
      connect: mockConnect,
      disconnect: mockDisconnect,
    };
    return {
      __esModule: true,
      _mockSendFn: mockSend,
      _mockConnectFn: mockConnect,
      _mockDisconnectFn: mockDisconnect,
      getKafkaProducer: jest.fn().mockResolvedValue(mockProducerInstance),
      disconnectProducer: jest.fn().mockResolvedValue(undefined),
    };
  }
);
import * as KafkaProducerMock from '../../kafka/producer';

dotenv.config({ path: process.env.ENV_FILE || '.env' });

const TEST_DB_HOST = process.env.DB_HOST_TEST || process.env.DB_HOST || 'localhost';
const TEST_DB_PORT = parseInt(process.env.DB_PORT_TEST || process.env.DB_PORT || '5433');
const TEST_DB_USER = process.env.DB_USER_TEST || process.env.DB_USER;
const TEST_DB_PASSWORD = process.env.DB_PASSWORD_TEST || process.env.DB_PASSWORD;
const TEST_DB_NAME = process.env.DB_NAME_TEST || process.env.DB_NAME;

if (!TEST_DB_HOST || !TEST_DB_PORT || !TEST_DB_USER || !TEST_DB_PASSWORD || !TEST_DB_NAME) {
  throw new Error('Test database configuration missing. Set DB_HOST_TEST, etc. in your .env or environment.');
}

let appModule: any;
let appInstance: any;
let expressApp: express.Application;
let agent: TestAgent;
let dbPool: Pool; 

interface PostApiResponse {
  postId: number;   
  userId: number;  
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

beforeAll(async () => {
  process.env.DB_HOST = TEST_DB_HOST;
  process.env.DB_PORT = TEST_DB_PORT.toString();
  process.env.DB_USER = TEST_DB_USER;
  process.env.DB_PASSWORD = TEST_DB_PASSWORD;
  process.env.DB_NAME = TEST_DB_NAME;
  
  if (!process.env.POST_EVENTS_TOPIC) {
    process.env.POST_EVENTS_TOPIC = 'post_events_test';
  }

  jest.resetModules(); 
  appModule = await import('../../app');
  appInstance = new appModule.App();
  expressApp = appInstance.app;
  agent = request(expressApp);

  dbPool = new Pool({
    user: TEST_DB_USER,
    host: TEST_DB_HOST,
    database: TEST_DB_NAME,
    password: TEST_DB_PASSWORD,
    port: TEST_DB_PORT,
  });

  try {
    await dbPool.query('SELECT 1 FROM posts LIMIT 1');
    await dbPool.query('SELECT 1 FROM cached_valid_users LIMIT 1');
    console.log(`Successfully connected to existing test database: ${TEST_DB_NAME}`);
  } catch (e: any) {
    console.error(
      `Failed to connect to or find required tables ('posts', 'cached_valid_users') in the existing test database: ${TEST_DB_NAME}. ` +
      `Ensure the database is running and tables are correctly set up. Error: ${e.message}`
    );
    throw e;
  }
});

beforeEach(async () => {
  if (!dbPool) throw new Error("dbPool not initialized in beforeAll.");
  
  await dbPool.query('DELETE FROM posts;');
  await dbPool.query('DELETE FROM cached_valid_users;');

  (KafkaProducerMock.getKafkaProducer as jest.Mock).mockClear();
  (KafkaProducerMock as any)._mockSendFn.mockClear();
  (KafkaProducerMock as any)._mockConnectFn.mockClear();
  (KafkaProducerMock as any)._mockDisconnectFn.mockClear();
  (KafkaProducerMock.disconnectProducer as jest.Mock).mockClear();
});

afterAll(async () => {
  if (dbPool) {
    await dbPool.end();
    console.log('Test DB pool (for cleanup) disconnected.');
  }
});

const addValidUserToCache = async (userId: string) => {
  if (!dbPool) throw new Error("dbPool not initialized.");
  await dbPool.query('INSERT INTO cached_valid_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING;', [userId]);
};


describe('Post Endpoints - /posts', () => {
  const validTestUserId = 1;
  const anotherValidTestUserId = 2;

  const validUserIdCacheString = 'user-cache-1';
  const anotherValidUserIdCacheString = 'user-cache-2';


  beforeEach(async () => {
    await addValidUserToCache(String(validTestUserId));
    await addValidUserToCache(String(anotherValidTestUserId));
    await addValidUserToCache(validUserIdCacheString);
    await addValidUserToCache(anotherValidUserIdCacheString);
  });

  const testPostPayload = {
    userId: '1',
    title: 'My First Test Post',
    content: 'This is the content of the test post.',
  };

  it('POST /posts - should create a new post successfully for a valid user', async () => {
    const response = await agent
      .post('/posts')
      .send(testPostPayload);

    expect(response.status).toBe(201);
    const body = response.body as PostApiResponse;

    expect(body.postId).toBeDefined();
    expect(typeof body.postId).toBe('number');
    expect(String(body.userId)).toBe(String(testPostPayload.userId));
    expect(body.title).toBe(testPostPayload.title);
    expect(body.content).toBe(testPostPayload.content);
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('POST /posts - should return 400 if userId is not found in cache', async () => {
    const nonCachedUserId = 999;
    const invalidUserPostPayload = {
      ...testPostPayload,
      userId: nonCachedUserId,
    };
    const response = await agent
      .post('/posts')
      .send(invalidUserPostPayload);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/User not found/i);
    expect((KafkaProducerMock as any)._mockSendFn).not.toHaveBeenCalled();
  });

  it('POST /posts - should return 400 for missing required fields (e.g., title)', async () => {
    const { title, ...incompletePayload } = testPostPayload;
    const response = await agent
      .post('/posts')
      .send(incompletePayload);
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Missing required fields/i);
  });

  it('GET /posts - should return all posts', async () => {
    await agent.post('/posts').send(testPostPayload);
    await agent.post('/posts').send({ ...testPostPayload, userId: anotherValidTestUserId, title: 'Second Post' });
    (KafkaProducerMock as any)._mockSendFn.mockClear();

    const response = await agent.get('/posts');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(2);
    const posts = response.body as PostApiResponse[];
    expect(posts.some(p => p.title === 'My First Test Post' && p.userId === validTestUserId)).toBe(true);
    expect(posts.some(p => p.title === 'Second Post' && p.userId === anotherValidTestUserId)).toBe(true);
  });

  it('GET /posts/:postId - should return a specific post by ID', async () => {
    const createResponse = await agent.post('/posts').send(testPostPayload);
    const createdPost = createResponse.body as PostApiResponse;
    (KafkaProducerMock as any)._mockSendFn.mockClear();

    const response = await agent.get(`/posts/${createdPost.postId}`);
    expect(response.status).toBe(200);
    const body = response.body as PostApiResponse;
    expect(body.postId).toBe(createdPost.postId);
    expect(body.title).toBe(testPostPayload.title);
    expect(String(body.userId)).toBe(String(testPostPayload.userId));
  });

  it('GET /posts/:postId - should return 404 for a non-existent post ID', async () => {
    const nonExistentPostId = 999999;
    const response = await agent.get(`/posts/${nonExistentPostId}`);
    expect(response.status).toBe(404);
  });

  it('PUT /posts/:postId - should update an existing post', async () => {
    const createResponse = await agent.post('/posts').send(testPostPayload);
    const createdPost = createResponse.body as PostApiResponse;
    (KafkaProducerMock as any)._mockSendFn.mockClear();

    const updatePayload = { title: 'Updated Post Title', content: 'Updated content.' };
    const response = await agent
      .put(`/posts/${createdPost.postId}`)
      .send(updatePayload);

    expect(response.status).toBe(200);
    const body = response.body as PostApiResponse;
    expect(body.postId).toBe(createdPost.postId);
    expect(body.title).toBe(updatePayload.title);
    expect(body.content).toBe(updatePayload.content);
    expect(body.userId).toBe(createdPost.userId);
    expect(body.updatedAt).not.toBe(createdPost.updatedAt);
  });

  it('PUT /posts/:postId - should return 404 if post to update does not exist', async () => {
    const nonExistentPostId = 999998;
    const updatePayload = { title: 'Updated Title' };
    const response = await agent
      .put(`/posts/${nonExistentPostId}`)
      .send(updatePayload);
    expect(response.status).toBe(404);
  });

  it('DELETE /posts/:postId - should delete an existing post', async () => {
    const createResponse = await agent.post('/posts').send(testPostPayload);
    const createdPost = createResponse.body as PostApiResponse;
    (KafkaProducerMock as any)._mockSendFn.mockClear();

    const response = await agent.delete(`/posts/${createdPost.postId}`);
    expect(response.status).toBe(204);

    const verifyResponse = await agent.get(`/posts/${createdPost.postId}`);
    expect(verifyResponse.status).toBe(404);
  });

  it('DELETE /posts/:postId - should return 404 if post to delete does not exist', async () => {
    const nonExistentPostId = 999997;
    const response = await agent.delete(`/posts/${nonExistentPostId}`);
    expect(response.status).toBe(404);
  });

  it('GET /users/:userId/posts - should return all posts for a specific user', async () => {
    await agent.post('/posts').send({ ...testPostPayload, userId: validTestUserId, title: "User1 Post1" });
    await agent.post('/posts').send({ ...testPostPayload, userId: validTestUserId, title: "User1 Post2" });
    await agent.post('/posts').send({ ...testPostPayload, userId: anotherValidTestUserId, title: "User2 Post1" });
    (KafkaProducerMock as any)._mockSendFn.mockClear();

    const response = await agent.get(`/users/${validTestUserId}/posts`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const posts = response.body as PostApiResponse[];
    expect(posts.length).toBe(2);
    expect(posts.every(p => p.userId === validTestUserId)).toBe(true);
    expect(posts.some(p => p.title === "User1 Post1")).toBe(true);
    expect(posts.some(p => p.title === "User1 Post2")).toBe(true);
  });

  it('GET /users/:userId/posts - should return empty array for user with no posts', async () => {
    const userWithNoPostsId = 333;
    await addValidUserToCache(String(userWithNoPostsId));

    const response = await agent.get(`/users/${userWithNoPostsId}/posts`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(0);
  });
});