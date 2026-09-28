import { BadRequestException } from '@nestjs/common';
import {
  FragmentDefinitionNode,
  GraphQLResolveInfo,
  Kind,
  SelectionNode,
  SelectionSetNode,
  valueFromASTUntyped,
} from 'graphql';

const MAX_BATCH_IDS = 500;
const MAX_IDENTIFIER_LENGTH = 128;

export interface RouteFullDataSelection {
  includeTrips: boolean;
  includeShapes: boolean;
  includeStops: boolean;
}

export function requestedRouteFullDataOptions(
  info: GraphQLResolveInfo,
): RouteFullDataSelection {
  return routeFullDataOptions(
    info.fieldNodes.flatMap((fieldNode) =>
      fieldNode.selectionSet ? [fieldNode.selectionSet] : [],
    ),
    info.fragments,
    info.variableValues,
  );
}

export function validateIdentifiers(
  values: string[],
  argumentName: string,
): string[] {
  if (values.length > MAX_BATCH_IDS) {
    throw new BadRequestException(
      `${argumentName} must contain at most ${MAX_BATCH_IDS} identifiers`,
    );
  }

  const identifiers = values.map((value) => value.trim());
  if (identifiers.some((value) => !isValidIdentifier(value))) {
    throw new BadRequestException(
      `${argumentName} contains an invalid identifier`,
    );
  }

  return Array.from(new Set(identifiers));
}

export function validateIdentifier(
  value: string,
  argumentName: string,
): string {
  const identifier = value.trim();
  if (!isValidIdentifier(identifier)) {
    throw new BadRequestException(
      `${argumentName} contains an invalid identifier`,
    );
  }

  return identifier;
}

function isValidIdentifier(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH &&
    Array.from(value).every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 0x1f && codePoint !== 0x7f;
    })
  );
}

function selectionSetHasAnyField(
  selectionSet: SelectionSetNode | undefined,
  fieldNames: Set<string>,
  fragments: Record<string, FragmentDefinitionNode>,
  variableValues: Record<string, unknown> = {},
  visitedFragments = new Set<string>(),
): boolean {
  if (!selectionSet) {
    return false;
  }

  return selectionSet.selections.some((selection) => {
    if (!selectionIsIncluded(selection, variableValues)) {
      return false;
    }

    if (selection.kind === Kind.FIELD) {
      return fieldNames.has(selection.name.value);
    }

    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      if (visitedFragments.has(selection.name.value)) {
        return false;
      }

      const fragment = fragments[selection.name.value];
      if (!fragment) {
        return false;
      }

      const fragmentVisited = new Set(visitedFragments).add(
        selection.name.value,
      );
      return selectionSetHasAnyField(
        fragment.selectionSet,
        fieldNames,
        fragments,
        variableValues,
        fragmentVisited,
      );
    }

    return selectionSetHasAnyField(
      selection.selectionSet,
      fieldNames,
      fragments,
      variableValues,
      visitedFragments,
    );
  });
}

function routeFullDataOptions(
  selectionSets: SelectionSetNode[],
  fragments: Record<string, FragmentDefinitionNode>,
  variableValues: Record<string, unknown>,
): RouteFullDataSelection {
  return {
    includeTrips: selectionSets.some((selectionSet) =>
      selectionSetHasAnyField(
        selectionSet,
        new Set(['trips']),
        fragments,
        variableValues,
      ),
    ),
    includeShapes: selectionSets.some((selectionSet) =>
      selectionSetHasAnyField(
        selectionSet,
        new Set(['shapes']),
        fragments,
        variableValues,
      ),
    ),
    includeStops: selectionSets.some((selectionSet) =>
      selectionSetHasAnyField(
        selectionSet,
        new Set(['stops']),
        fragments,
        variableValues,
      ),
    ),
  };
}

function selectionIsIncluded(
  selection: SelectionNode,
  variableValues: Record<string, unknown>,
): boolean {
  for (const directive of selection.directives ?? []) {
    if (directive.name.value !== 'include' && directive.name.value !== 'skip') {
      continue;
    }

    const ifArgument = directive.arguments?.find(
      (argument) => argument.name.value === 'if',
    );
    const condition = ifArgument
      ? valueFromASTUntyped(ifArgument.value, variableValues)
      : undefined;

    if (directive.name.value === 'include' && condition !== true) {
      return false;
    }
    if (directive.name.value === 'skip' && condition === true) {
      return false;
    }
  }

  return true;
}
