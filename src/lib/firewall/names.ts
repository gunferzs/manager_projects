export const RULE_PREFIX = "mgrproj-";

export function ruleName(slug: string, port: number): string {
  return `${RULE_PREFIX}${slug}-${port}`;
}
