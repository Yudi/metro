import { Logger } from '@nestjs/common';
import { Client } from 'typesense';
import {
  formatTypesenseError,
  isTypesenseAlreadyExistsError,
  isTypesenseNotFoundError,
} from './typesense-error.utils';

export interface TypesenseCollectionContext {
  getClient: () => Client;
  logger: Logger;
}

/** Groups collection existence and replacement lifecycle operations. */
export class TypesenseCollectionFacade {
  constructor(private readonly context: TypesenseCollectionContext) {}

  async ensureCollectionExists(name: string, schema: unknown): Promise<void> {
    try {
      await this.context.getClient().collections(name).retrieve();
      this.context.logger.debug(
        `Typesense collection '${name}' already exists`,
      );
    } catch (error) {
      if (!isTypesenseNotFoundError(error)) {
        throw error;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.context
          .getClient()
          .collections()
          .create(schema as any);
        this.context.logger.debug(`Created Typesense collection: ${name}`);
      } catch (createError) {
        if (isTypesenseAlreadyExistsError(createError)) {
          this.context.logger.debug(
            `Typesense collection '${name}' was created concurrently`,
          );
          return;
        }

        this.context.logger.error(
          `Failed to create collection ${name}: ${formatTypesenseError(createError)}`,
        );
        throw createError;
      }
    }
  }

  async recreateCollection(name: string, schema: unknown): Promise<void> {
    try {
      await this.context.getClient().collections(name).delete();
    } catch (error) {
      if (!isTypesenseNotFoundError(error)) {
        throw error;
      }
    }

    await this.ensureCollectionExists(name, schema);
  }
}
