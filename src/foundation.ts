export const LOCAL_SERVICE_ORIGIN =
  import.meta.env.VITE_EVORACER_SERVICE_ORIGIN ?? "http://127.0.0.1:8765";

export function isLoopbackOrigin(origin: string): boolean {
  const url = new URL(origin);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  );
}
