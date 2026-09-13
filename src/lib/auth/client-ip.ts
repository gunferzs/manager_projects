function stripIpv4Mapped(address: string): string {
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function isLoopback(remoteAddress?: string): boolean {
  if (!remoteAddress) {
    return false;
  }
  if (remoteAddress === "::1") {
    return true;
  }
  return stripIpv4Mapped(remoteAddress) === "127.0.0.1";
}

export function readClientIp(input: { remoteAddress?: string; forwardedFor?: string }): string {
  if (isLoopback(input.remoteAddress) && input.forwardedFor) {
    const first = input.forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return stripIpv4Mapped(input.remoteAddress ?? "");
}

export function readRequestIp(headers: { get(name: string): string | null }): string {
  return (
    readClientIp({
      remoteAddress: headers.get("x-real-ip") ?? "127.0.0.1",
      forwardedFor: headers.get("x-forwarded-for") ?? undefined,
    }) || "127.0.0.1"
  );
}
