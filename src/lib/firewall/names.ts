import { RULE_PREFIX } from "./parse-argv.mjs";

export { RULE_PREFIX };

export function ruleName(slug: string, port: number): string {
  return `${RULE_PREFIX}${slug}-${port}`;
}
