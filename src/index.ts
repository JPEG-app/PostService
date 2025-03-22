import { App } from './app';
import * as dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT;
const userServiceUrl = process.env.USER_SERVICE_URL;

if (!userServiceUrl) {
  console.error('USER_SERVICE_URL environment variable is not set.');
  process.exit(1);
}

const app = new App(userServiceUrl).app;

app.listen(port, () => {
  console.log(`Post Service is running on port ${port}`);
});