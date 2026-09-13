import Link from "next/link";
import { TotpBanner } from "./TotpBanner";

type AppHeaderProps = {
  lanIp: string | null;
  totpEnabled: boolean;
};

export function AppHeader({ lanIp, totpEnabled }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-row">
        <h1 className="app-title">Проекты</h1>
        <p className="lan-ip">LAN: {lanIp ?? "нет"}</p>
        <Link href="/settings">Настройки</Link>
      </div>
      <TotpBanner totpEnabled={totpEnabled} />
    </header>
  );
}
