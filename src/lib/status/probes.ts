import net from "node:net";

const PROBE_TIMEOUT_MS = 800;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function probeHttp(port: number, path: string): Promise<boolean> {
  const url = `http://127.0.0.1:${port}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    // Do not follow redirects: apps often redirect to NEXTAUTH_URL on another host/port.
    const response = await withTimeout(fetch(url, { redirect: "manual" }), PROBE_TIMEOUT_MS);
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

export async function probeTcp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });

    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timer);
      finish(true);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      finish(false);
    });
  });
}
