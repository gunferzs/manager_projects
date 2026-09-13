import Link from "next/link";
import { AppHeader } from "../components/layout/AppHeader";
import { AuditList } from "../components/settings/AuditList";
import { ChangeKeyForm } from "../components/settings/ChangeKeyForm";
import { MachineInfo } from "../components/settings/MachineInfo";
import { ScanRootsForm } from "../components/settings/ScanRootsForm";
import { TotpEnrollForm } from "../components/settings/TotpEnrollForm";
import type { SettingsPageData } from "../lib/auth/settings";

export function SettingsScreen({
  lanIp,
  totpEnabled,
  networkProfile,
  scanRoots,
  auditEvents,
}: SettingsPageData) {
  return (
    <main className="wide">
      <AppHeader lanIp={lanIp} totpEnabled={totpEnabled} />
      <p>
        <Link href="/">К списку</Link>
      </p>
      <section className="settings-section">
        <h2>Безопасность</h2>
        <ChangeKeyForm totpEnabled={totpEnabled} />
        <TotpEnrollForm totpEnabled={totpEnabled} />
      </section>
      <section className="settings-section">
        <h2>Машина</h2>
        <MachineInfo lanIp={lanIp} networkProfile={networkProfile} />
        <ScanRootsForm roots={scanRoots} />
      </section>
      <section className="settings-section">
        <h2>Аудит</h2>
        <AuditList events={auditEvents} />
      </section>
    </main>
  );
}
