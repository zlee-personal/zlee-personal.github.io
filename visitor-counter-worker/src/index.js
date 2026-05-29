import { DurableObject } from "cloudflare:workers";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: JSON_HEADERS
  });
}

function isCrossSiteWrite(request, url) {
  const fetchSite = request.headers.get("Sec-Fetch-Site");

  if (fetchSite === "cross-site") {
    return true;
  }

  const origin = request.headers.get("Origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).host !== url.host;
  } catch (error) {
    return true;
  }
}

export class VisitCounter extends DurableObject {
  async getCount() {
    return (await this.ctx.storage.get("count")) || 0;
  }

  async increment() {
    const next = (await this.getCount()) + 1;
    await this.ctx.storage.put("count", next);
    return next;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/visit") {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (request.method === "POST" && isCrossSiteWrite(request, url)) {
      return jsonResponse({ error: "Cross-site writes are not allowed" }, 403);
    }

    const counter = env.VISIT_COUNTER.getByName("main-site");

    if (request.method === "POST") {
      const count = await counter.increment();
      return jsonResponse({ count });
    }

    if (request.method === "GET") {
      const count = await counter.getCount();
      return jsonResponse({ count });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  }
};
