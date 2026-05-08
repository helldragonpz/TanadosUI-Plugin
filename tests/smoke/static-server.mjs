import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);

const routeTable = [
  { prefix: "/slider/", dir: path.join(repoRoot, "Resources", "slider") },
  { prefix: "/Plugins/TanadosUI/runtime/", dir: path.join(repoRoot, "RuntimeModules") },
  { prefix: "/Web/", dir: path.join(repoRoot, "Web") },
  { prefix: "/tests/", dir: path.join(repoRoot, "tests") },
  { exact: "/Plugins/TanadosUI/assets/WebSettingsJs", file: path.join(repoRoot, "Web", "settings.js") },
  { exact: "/Plugins/TanadosUI/assets/WebUiJs", file: path.join(repoRoot, "Web", "ui.js") }
];

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function normalizeRequestPath(urlValue = "/") {
  try {
    return decodeURIComponent(new URL(urlValue, `http://${host}:${port}`).pathname);
  } catch {
    return "/";
  }
}

function resolvePathname(pathname) {
  for (const route of routeTable) {
    if (route.exact && pathname === route.exact) {
      return route.file;
    }

    if (route.prefix && pathname.startsWith(route.prefix)) {
      const relativePath = pathname.slice(route.prefix.length);
      return path.join(route.dir, relativePath);
    }
  }

  return null;
}

function isSafeChildPath(candidatePath, routePath) {
  const relative = path.relative(routePath, candidatePath);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

const server = createServer(async (req, res) => {
  const pathname = normalizeRequestPath(req.url);

  if (pathname === "/favicon.ico") {
    send(res, 204, "");
    return;
  }

  const resolved = resolvePathname(pathname);
  if (!resolved) {
    send(res, 404, `Not found: ${pathname}`);
    return;
  }

  const route = routeTable.find((entry) => (
    (entry.exact && entry.file === resolved) ||
    (entry.prefix && resolved.startsWith(entry.dir))
  ));

  if (!route) {
    send(res, 404, `Route not mapped: ${pathname}`);
    return;
  }

  if (route.dir && !isSafeChildPath(resolved, route.dir)) {
    send(res, 403, "Forbidden");
    return;
  }

  try {
    const buffer = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    send(res, 200, buffer, mimeTypes[ext] || "application/octet-stream");
  } catch (error) {
    const statusCode = error?.code === "ENOENT" ? 404 : 500;
    send(res, statusCode, `${statusCode === 404 ? "Not found" : "Server error"}: ${pathname}`);
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Smoke server listening on http://${host}:${port}\n`);
});

function shutdown(code = 0) {
  server.close(() => process.exit(code));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
