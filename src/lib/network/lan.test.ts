import assert from "node:assert/strict";
import { test } from "node:test";
import { pickLanIpv4, profileFromCategories } from "./lan";

test("pickLanIpv4 skips loopback and APIPA", () => {
  assert.equal(pickLanIpv4(["127.0.0.1", "169.254.12.3", "192.168.1.89"]), "192.168.1.89");
  assert.equal(pickLanIpv4(["127.0.0.1", "169.254.1.1"]), null);
});

test("pickLanIpv4 prefers home ethernet over hyper-v and vmware", () => {
  assert.equal(pickLanIpv4(["172.17.80.1", "192.168.1.89"]), "192.168.1.89");
  assert.equal(
    pickLanIpv4([
      { ip: "172.17.80.1", alias: "vEthernet (WSL (Hyper-V firewall))" },
      { ip: "192.168.75.1", alias: "VMware Network Adapter VMnet8" },
      { ip: "10.8.1.1", alias: "AmneziaVPN" },
      { ip: "192.168.1.89", alias: "Ethernet" },
    ]),
    "192.168.1.89",
  );
});

test("profileFromCategories prefers Public then Domain", () => {
  assert.equal(profileFromCategories(["Private", "Public"]), "Public");
  assert.equal(profileFromCategories(["DomainAuthenticated"]), "Domain");
  assert.equal(profileFromCategories(["Private"]), "Private");
  assert.equal(profileFromCategories([]), "unknown");
});
