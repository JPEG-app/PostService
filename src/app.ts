import express, { Application } from 'express';
import bodyParser from 'body-parser';
import { setupPostRoutes } from './routes/post.routes';

export class App {
  public app: Application;
  private userServiceUrl: string;

  constructor(userServiceUrl: string) {
    this.app = express();
    this.userServiceUrl = userServiceUrl;
    this.config();
    this.routes();
  }

  private config(): void {
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
  }

  private routes(): void {
    this.app.use('/', setupPostRoutes(this.userServiceUrl));
  }
}