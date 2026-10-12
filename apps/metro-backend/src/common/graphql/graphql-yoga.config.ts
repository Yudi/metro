import { join } from 'node:path';
import { createFetch } from '@whatwg-node/fetch';
import { NoSchemaIntrospectionCustomRule } from 'graphql';
import { useDeferStream } from '@graphql-yoga/plugin-defer-stream';
import { useExecutionCancellation } from 'graphql-yoga';
import type {
  YogaDriverConfig,
  YogaDriverServerContext,
} from '@graphql-yoga/nestjs';
import type { Plugin, YogaInitialContext } from 'graphql-yoga';
import { LoadersService } from './loaders.service';
import { graphqlOperationLimitsRule } from './graphql-operation-limits.rule';
import {
  createGraphQLYogaErrorPlugin,
  maskGraphQLError,
} from './graphql-yoga-error.plugin';
import { createGraphQLTimingPlugin } from '../../observability/graphql-timing.plugin';

type ExpressYogaInitialContext = YogaDriverServerContext<'express'> &
  YogaInitialContext;

function createGraphQLValidationPlugin(isProduction: boolean): Plugin {
  return {
    onValidate({ addValidationRule }) {
      if (isProduction) {
        addValidationRule(graphqlOperationLimitsRule);
        addValidationRule(NoSchemaIntrospectionCustomRule);
      }
    },
  };
}

/** Bound native multipart parsing before resolver authorization/conversion. */
export function createGraphQLFetchAPI() {
  return createFetch({
    useNodeFetch: true,
    formDataLimits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 2,
      parts: 3,
      fieldSize: 128 * 1024,
      headerSize: 16 * 1024,
    },
  });
}

export function createGraphQLYogaConfig(
  loadersService: LoadersService,
  isProduction = process.env.NODE_ENV === 'production',
): YogaDriverConfig {
  return {
    path: '/api/graphql',
    autoSchemaFile: isProduction ? true : join(__dirname, 'schema.gql'),
    sortSchema: true,
    graphiql: !isProduction,
    cors: false,
    fetchAPI: createGraphQLFetchAPI(),
    maskedErrors: {
      errorMessage: 'Unexpected error.',
      isDev: false,
      maskError: maskGraphQLError,
    },
    plugins: [
      useExecutionCancellation(),
      useDeferStream(),
      createGraphQLValidationPlugin(isProduction),
      createGraphQLYogaErrorPlugin(),
      createGraphQLTimingPlugin(),
    ],
    context: ({ req, res, request }: ExpressYogaInitialContext) => ({
      req,
      res,
      request,
      requestId: req.headers['x-request-id'],
      loaders: loadersService.createLoaders(),
    }),
  };
}
