import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export const Loaders = createParamDecorator(
  (data, ctx: ExecutionContext) =>
    GqlExecutionContext.create(ctx).getContext().loaders,
);
