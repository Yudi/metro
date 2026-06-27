import { Request, Response } from 'express';
import { GraphQLLoaders } from './loaders.service';

export interface GraphQLContext {
  req: Request;
  res: Response;
  loaders: GraphQLLoaders;
}
