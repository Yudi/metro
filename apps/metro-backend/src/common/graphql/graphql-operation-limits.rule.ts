import {
  ASTVisitor,
  DocumentNode,
  FragmentDefinitionNode,
  GraphQLError,
  Kind,
  OperationDefinitionNode,
  SelectionSetNode,
  ValidationRule,
} from 'graphql';

const MAX_OPERATION_DEPTH = 12;
const MAX_OPERATION_FIELDS = 300;
const MAX_OPERATION_ALIASES = 50;

interface OperationMetrics {
  depth: number;
  fields: number;
  aliases: number;
}

export const graphqlOperationLimitsRule: ValidationRule = (context) =>
  ({
    Document: {
      enter(document: DocumentNode) {
        const fragments = new Map<string, FragmentDefinitionNode>();
        for (const definition of document.definitions) {
          if (definition.kind === Kind.FRAGMENT_DEFINITION) {
            fragments.set(definition.name.value, definition);
          }
        }

        for (const definition of document.definitions) {
          if (definition.kind !== Kind.OPERATION_DEFINITION) {
            continue;
          }
          validateOperation(definition, fragments, context.reportError.bind(context));
        }
      },
    },
  }) as ASTVisitor;

function validateOperation(
  operation: OperationDefinitionNode,
  fragments: Map<string, FragmentDefinitionNode>,
  reportError: (error: GraphQLError) => void,
): void {
  const metrics: OperationMetrics = { depth: 0, fields: 0, aliases: 0 };
  inspectSelectionSet(operation.selectionSet, 0, fragments, new Set(), metrics);
  const operationName = operation.name?.value ?? 'anonymous';

  if (metrics.depth > MAX_OPERATION_DEPTH) {
    reportError(
      new GraphQLError(
        `GraphQL operation ${operationName} exceeds maximum depth ${MAX_OPERATION_DEPTH}`,
        { nodes: operation, extensions: { code: 'QUERY_DEPTH_LIMIT_EXCEEDED' } },
      ),
    );
  }
  if (metrics.fields > MAX_OPERATION_FIELDS) {
    reportError(
      new GraphQLError(
        `GraphQL operation ${operationName} exceeds maximum field cost ${MAX_OPERATION_FIELDS}`,
        { nodes: operation, extensions: { code: 'QUERY_COST_LIMIT_EXCEEDED' } },
      ),
    );
  }
  if (metrics.aliases > MAX_OPERATION_ALIASES) {
    reportError(
      new GraphQLError(
        `GraphQL operation ${operationName} exceeds maximum aliases ${MAX_OPERATION_ALIASES}`,
        { nodes: operation, extensions: { code: 'QUERY_ALIAS_LIMIT_EXCEEDED' } },
      ),
    );
  }
}

function inspectSelectionSet(
  selectionSet: SelectionSetNode,
  depth: number,
  fragments: Map<string, FragmentDefinitionNode>,
  activeFragments: Set<string>,
  metrics: OperationMetrics,
): void {
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const fieldDepth = depth + 1;
      metrics.depth = Math.max(metrics.depth, fieldDepth);
      metrics.fields += 1;
      if (selection.alias) {
        metrics.aliases += 1;
      }
      if (selection.selectionSet) {
        inspectSelectionSet(
          selection.selectionSet,
          fieldDepth,
          fragments,
          activeFragments,
          metrics,
        );
      }
      continue;
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      inspectSelectionSet(
        selection.selectionSet,
        depth,
        fragments,
        activeFragments,
        metrics,
      );
      continue;
    }

    const fragmentName = selection.name.value;
    if (activeFragments.has(fragmentName)) {
      continue;
    }
    const fragment = fragments.get(fragmentName);
    if (!fragment) {
      continue;
    }
    const nextActiveFragments = new Set(activeFragments).add(fragmentName);
    inspectSelectionSet(
      fragment.selectionSet,
      depth,
      fragments,
      nextActiveFragments,
      metrics,
    );
  }
}
