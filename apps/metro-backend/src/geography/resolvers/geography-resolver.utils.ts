import { BadRequestException } from '@nestjs/common';
import {
  FragmentDefinitionNode,
  GraphQLResolveInfo,
  Kind,
  SelectionSetNode,
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
  return {
    includeTrips: info.fieldNodes.some((fieldNode) =>
      selectionSetHasAnyField(
        fieldNode.selectionSet,
        new Set(['trips']),
        info.fragments,
      ),
    ),
    includeShapes: info.fieldNodes.some((fieldNode) =>
      selectionSetHasAnyField(
        fieldNode.selectionSet,
        new Set(['shapes']),
        info.fragments,
      ),
    ),
    includeStops: info.fieldNodes.some((fieldNode) =>
      selectionSetHasAnyField(
        fieldNode.selectionSet,
        new Set(['stops']),
        info.fragments,
      ),
    ),
  };
}

export function requestsRouteDetails(info: GraphQLResolveInfo): boolean {
  const routeSelectionSets = info.fieldNodes.flatMap((fieldNode) =>
    findFieldSelectionSets(fieldNode.selectionSet, 'routes', info.fragments),
  );
  return routeSelectionSets.some((selectionSet) =>
    selectionSetHasAnyField(
      selectionSet,
      new Set(['trips', 'shapes', 'stops']),
      info.fragments,
    ),
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

function findFieldSelectionSets(
  selectionSet: SelectionSetNode | undefined,
  fieldName: string,
  fragments: Record<string, FragmentDefinitionNode>,
  visitedFragments = new Set<string>(),
): SelectionSetNode[] {
  if (!selectionSet) {
    return [];
  }

  const matches: SelectionSetNode[] = [];
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value === fieldName && selection.selectionSet) {
        matches.push(selection.selectionSet);
      }
      continue;
    }
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      if (visitedFragments.has(selection.name.value)) {
        continue;
      }

      const fragment = fragments[selection.name.value];
      if (!fragment) {
        continue;
      }

      const fragmentVisited = new Set(visitedFragments).add(
        selection.name.value,
      );
      matches.push(
        ...findFieldSelectionSets(
          fragment.selectionSet,
          fieldName,
          fragments,
          fragmentVisited,
        ),
      );
      continue;
    }

    matches.push(
      ...findFieldSelectionSets(
        selection.selectionSet,
        fieldName,
        fragments,
        visitedFragments,
      ),
    );
  }
  return matches;
}

function selectionSetHasAnyField(
  selectionSet: SelectionSetNode | undefined,
  fieldNames: Set<string>,
  fragments: Record<string, FragmentDefinitionNode>,
  visitedFragments = new Set<string>(),
): boolean {
  if (!selectionSet) {
    return false;
  }

  return selectionSet.selections.some((selection) => {
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
        fragmentVisited,
      );
    }

    return selectionSetHasAnyField(
      selection.selectionSet,
      fieldNames,
      fragments,
      visitedFragments,
    );
  });
}
