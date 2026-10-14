import { composeStop, composeUp, listComposeContainers } from "../docker/cli";
import { runFirewall } from "../firewall/client";
import { ruleName } from "../firewall/names";
import { getLanIpv4 } from "../network/lan";
import type { ProjectRow } from "../projects/types";
import { listListeningPorts } from "./ports";
import type { JobDeps } from "./types";

export function createJobDeps(project: ProjectRow): JobDeps {
  return {
    composeUp,
    composeStop,
    listPorts: listListeningPorts,
    listContainers: () => listComposeContainers(project),
    async resolvePublicHost(access) {
      if (access === "lan") {
        return (await getLanIpv4()) ?? "127.0.0.1";
      }
      return "127.0.0.1";
    },
    async firewallAllow(ports) {
      for (const port of ports) {
        const result = await runFirewall({
          action: "allow",
          name: ruleName(project.slug, port),
          port,
        });
        if (!result.ok) {
          return { ok: false, message: result.message ?? "Ошибка фаервола" };
        }
      }
      return { ok: true };
    },
  };
}
