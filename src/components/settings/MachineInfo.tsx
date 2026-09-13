import type { NetworkProfile } from "../../lib/network/lan";

export function MachineInfo({
  lanIp,
  networkProfile,
}: {
  lanIp: string | null;
  networkProfile: NetworkProfile;
}) {
  return (
    <dl className="machine-info">
      <div>
        <dt>LAN-IP</dt>
        <dd>{lanIp ?? "нет"}</dd>
      </div>
      <div>
        <dt>Профиль сети</dt>
        <dd>{networkProfile}</dd>
      </div>
    </dl>
  );
}
