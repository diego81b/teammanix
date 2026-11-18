/** Modules on in at least one of the given teams, sorted: what the menu needs to decide which personal pages to show. */
export function activeModules(teamModules: string[][]): string[] {
  return [...new Set(teamModules.flat())].sort();
}
