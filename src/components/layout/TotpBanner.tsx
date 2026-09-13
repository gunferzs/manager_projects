export function TotpBanner({ totpEnabled }: { totpEnabled: boolean }) {
  if (totpEnabled) return null;
  return <p className="totp-banner">Включите TOTP до публикации в интернет</p>;
}
