export interface Env {
  DB: D1Database;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "freedom-arena-api" });
    }

    if (request.method === "GET" && url.pathname === "/player") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "missing id" }, 400);

      const row = await env.DB.prepare(
        "SELECT * FROM players WHERE id = ?"
      ).bind(id).first();

      return json({ player: row ?? null });
    }

    return json({ error: "not_found" }, 404);
  },
};
