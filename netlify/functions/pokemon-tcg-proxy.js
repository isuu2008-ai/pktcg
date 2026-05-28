const POKEMON_TCG_API_ORIGIN = "https://api.pokemontcg.io";
const ALLOWED_QUERY_KEYS = new Set(["q", "page", "pageSize", "select", "orderBy"]);
const MAX_PAGE_SIZE = 250;
const UPSTREAM_TIMEOUT_MS = 15000;

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, {
      ok: false,
      error: "Method not allowed",
      message: "Only GET requests are supported."
    });
  }

  try {
    if (typeof fetch !== "function") {
      return jsonResponse(500, {
        ok: false,
        error: "Fetch unavailable",
        message: "Netlify runtime fetch is not available. Use Node 18 or newer."
      });
    }

    const targetUrl = buildPokemonTcgApiUrl(event.queryStringParameters || {});
    const headers = { accept: "application/json" };

    if (process.env.POKEMON_TCG_API_KEY) {
      headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
    }

    const upstream = await fetchWithTimeout(targetUrl.toString(), {
      headers,
      timeoutMs: UPSTREAM_TIMEOUT_MS
    });
    const text = await upstream.text();
    const payload = parseJsonBody(text);

    if (!upstream.ok) {
      console.error("Pokemon TCG API error", {
        status: upstream.status,
        statusText: upstream.statusText,
        target: targetUrl.toString(),
        body: payload
      });

      return jsonResponse(upstream.status, {
        ok: false,
        error: "Pokemon TCG API request failed",
        status: upstream.status,
        statusText: upstream.statusText,
        detail: payload
      });
    }

    return jsonResponse(200, payload);
  } catch (error) {
    console.error("pokemon-tcg-proxy failed", {
      name: error && error.name,
      message: error && error.message,
      stack: error && error.stack
    });

    const statusCode = error && error.statusCode ? error.statusCode : error && error.name === "AbortError" ? 504 : 500;

    return jsonResponse(statusCode, {
      ok: false,
      error: "Proxy request failed",
      message: error && error.message ? error.message : "Unknown proxy error"
    });
  }
};

function buildPokemonTcgApiUrl(params) {
  const path = String(params.path || "").trim();

  if (!path.startsWith("/v2/") || path.includes("..") || path.includes("\\") || path.includes("//")) {
    const error = new Error("Blocked API path. path must start with /v2/.");
    error.statusCode = 400;
    throw error;
  }

  const targetUrl = new URL(path, POKEMON_TCG_API_ORIGIN);
  const sourceParams = new URLSearchParams();

  if (params.query) {
    new URLSearchParams(String(params.query)).forEach((value, key) => {
      sourceParams.append(key, value);
    });
  }

  Object.entries(params).forEach(([key, value]) => {
    if (key !== "path" && key !== "query" && value !== undefined && value !== null) {
      sourceParams.append(key, String(value));
    }
  });

  sourceParams.forEach((value, key) => {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      return;
    }

    if (key === "pageSize") {
      const safePageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(value) || MAX_PAGE_SIZE));
      targetUrl.searchParams.set(key, String(safePageSize));
      return;
    }

    targetUrl.searchParams.set(key, value);
  });

  return targetUrl;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    return await fetch(url, {
      headers: options.headers,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseJsonBody(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      raw: String(text).slice(0, 1000)
    };
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
