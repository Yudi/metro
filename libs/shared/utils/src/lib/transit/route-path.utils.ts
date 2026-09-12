export interface RoutePathTreeNode {
  path?: string;
  children?: readonly RoutePathTreeNode[];
}

export function collectPaths(
  routes: readonly RoutePathTreeNode[],
  parentPath = '',
): string[] {
  const paths = new Set<string>();

  for (const route of routes) {
    if (route.path?.includes('*') || route.path?.includes(':')) continue;

    const path = [parentPath, route.path ?? '']
      .join('/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    if (route.path !== undefined) paths.add(path);
    if (route.children) {
      for (const childPath of collectPaths(route.children, path)) {
        paths.add(childPath);
      }
    }
  }

  return [...paths];
}
