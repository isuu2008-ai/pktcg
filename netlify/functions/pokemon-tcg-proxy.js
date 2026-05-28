const API_ORIGIN = "https://api.pokemontcg.io";
const ALLOWED_PATH_PREFIX = "/v2/";
const ALLOWED_QUERY_KEYS = new Set(["q", "page", "pageSize", "select", "orderBy"]);
const MAX_PAGE_SIZE = 250;
const FETCH_TIMEOUT_MS = 30000;

const SECURITY_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" }, { Allow: "GET" });
  }

  try {
    const targetUrl = buildPokemonTcgUrl(event.queryStringParameters || {});
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const headers = { Accept: "application/json" };
      const apiKey = process.env.POKEMON_TCG_API_KEY || "";
      if (apiKey) {
        headers["X-Api-Key"] = apiKey;
      }

      const response = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      const body = await response.text();
      const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

      return {
        statusCode: response.status,
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type": contentType.includes("application/json")
            ? contentType
            : SECURITY_HEADERS["Content-Type"]
        },
        body: contentType.includes("application/json")
          ? body
          : JSON.stringify({ error: "Upstream did not return JSON" })
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const statusCode = error.statusCode || (error.name === "AbortError" ? 504 : 400);
    return jsonResponse(statusCode, { error: error.name === "AbortError" ? "Pokemon TCG API request timed out" : error.message });
  }
};

function buildPokemonTcgUrl(params) {
  const path = normalizePath(params.path);
  const targetUrl = new URL(path, API_ORIGIN);
  const rawQuery = String(params.query || "");
  const queryParams = new URLSearchParams(rawQuery);

  for (const [key, value] of queryParams.entries()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      continue;
    }

    if (key === "pageSize") {
      const boundedPageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(value) || MAX_PAGE_SIZE));
      targetUrl.searchParams.set(key, String(boundedPageSize));
      continue;
    }

    targetUrl.searchParams.append(key, value);
  }

  return targetUrl.toString();
}

function normalizePath(pathValue) {
  const path = `/${String(pathValue || "").replace(/^\/+/, "")}`;

  if (!path.startsWith(ALLOWED_PATH_PREFIX) || path.includes("..") || path.includes("//")) {
    const error = new Error("Invalid Pokemon TCG API path");
    error.statusCode = 400;
    throw error;
  }

  return path;
}

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...SECURITY_HEADERS, ...extraHeaders },
    body: JSON.stringify(payload)
  };
}
