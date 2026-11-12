/** Public deployment settings only. Never pass provider keys into Vite. */
export function deploymentConfig(mode: string, apiOrigin?: string, basePath = "/") {
  const pages = mode === "github-pages";
  if (!basePath.startsWith("/") || !basePath.endsWith("/") ||
      basePath.startsWith("//") || /[?#\\]|\.\./.test(basePath)) {
    throw new Error("BASE_PATH must be an absolute path with a trailing slash, such as / or /AE-Analytics/.");
  }
  const raw = apiOrigin?.trim();
  if (pages && !raw) {
    throw new Error("GitHub Pages requires VITE_API_ORIGIN: set the repository variable to your separately hosted HTTPS backend origin (without /api).");
  }
  if (!raw) return { pages, apiOrigin: null, basePath };
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error("VITE_API_ORIGIN must be a valid HTTPS origin, such as https://api.example.com."); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash ||
      /(^|\.)localhost$|\.replit\.dev$|\.riker\.replit\.dev$/i.test(url.hostname) ||
      ["127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("VITE_API_ORIGIN must be a production HTTPS origin only: no credentials, /api path, query, fragment, localhost or development preview URL.");
  }
  return { pages, apiOrigin: url.origin, basePath };
}
