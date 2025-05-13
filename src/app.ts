import express, { Application } from 'express';
import bodyParser from 'body-parser';
import { setupPostRoutes } from './routes/post.routes';
// import cors from 'cors'; // If you need CORS in post-service, add it

export class App {
  public app: Application;
  // private userServiceUrl: string; // May not be needed

  // constructor(userServiceUrl: string) {
  constructor() {
    this.app = express();
    // this.userServiceUrl = userServiceUrl;
    this.config();
    this.routes();
  }

  private config(): void {
    // If you need CORS:
    // const corsOptions = { /* ... your cors options ... */ };
    // this.app.use(cors(corsOptions));
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
  }

  private routes(): void {
    // this.app.use('/', setupPostRoutes(this.userServiceUrl));
    this.app.use('/', setupPostRoutes());
  }
}