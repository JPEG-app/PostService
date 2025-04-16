import http from 'k6/http';
import { check, group } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  vus: 1000,
  duration: '10s',
  thresholds: {
    'http_req_duration{name:CreatePost}': ['p(95)<800'],
    'http_req_failed{name:CreatePost}': ['rate<0.02'],
  },
};

const email = 'testuser@example.com';
const password = 'password123';

export default function () {
  group('Create Post', () => {
    // const loginRes = http.post('http://localhost:8000/auth/login', JSON.stringify({ email, password }), {
    //   headers: { 'Content-Type': 'application/json' },
    //   tags: { name: 'Login' },
    // });

    // const loginCheck = check(loginRes, { 'Login: status is 200': (r) => r.status === 200 });
    // if (!loginCheck) {
    //   return;
    // }

    // const token = JSON.parse(loginRes.body).token;

    const postPayload = JSON.stringify({
      userId: '1',
      title: `New Post ${randomString(8)}`,
      content: `This is the post content: ${randomString(200)}`,
    });

    const postRes = http.post('http://localhost:8000/posts', postPayload, {
      headers: {
        'Content-Type': 'application/json',
        // Authorization: `Bearer ${token}`,
      },
      tags: { name: 'CreatePost' },
    });

    check(postRes, { 'Create Post: status is 201': (r) => r.status === 201 });
     check(postRes, { 'Create Post: response time is acceptable': (r) => r.timings.duration < 800 });
  });
}