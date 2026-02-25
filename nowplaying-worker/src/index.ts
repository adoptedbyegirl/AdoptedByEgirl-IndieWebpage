export interface Env {
	NOWPLAYING: KVNamespace;
	UPLOAD_TOKEN: string;
	ALLOWED_ORIGIN: string; // e.g. https://your-site.pages.dev
  }
  
  const KEY = "now";
  
  function corsHeaders(req: Request, env: Env) {
	const configured = (env.ALLOWED_ORIGIN || "*").trim();
	const origin = (req.headers.get("Origin") || "").trim();
  
	const allow =
	  configured === "*" ? "*" :
	  origin && origin === configured ? origin :
	  configured;
  
	return {
	  "Access-Control-Allow-Origin": allow,      // ALWAYS a string
	  "Access-Control-Allow-Methods": "GET, OPTIONS",
	  "Access-Control-Allow-Headers": "Content-Type, Authorization",
	  "Vary": "Origin",
	};
  }
  
  function isAuthorized(req: Request, env: Env) {
	const auth = req.headers.get("Authorization") || "";
	const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth; // accept both
	return token && token === env.UPLOAD_TOKEN;
  }
  
  export default {
	async fetch(req: Request, env: Env): Promise<Response> {
	  const url = new URL(req.url);
  
	  // Preflight for browser GETs
	  if (req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders(req, env) });
	  }
  
	  // Public: GET /now
	  if (req.method === "GET" && url.pathname === "/now") {
		const data = await env.NOWPLAYING.get(KEY, { type: "json" });
		if (!data) {
		  return new Response(null, {
			status: 204,
			headers: { ...corsHeaders(req, env), "Cache-Control": "no-store" },
		  });
		}
  
		return new Response(JSON.stringify(data), {
		  status: 200,
		  headers: {
			...corsHeaders(req, env),
			"content-type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		  },
		});
	  }
  
	  // Private: POST /now (bridge pushes updates)
	  if (req.method === "POST" && url.pathname === "/now") {
		if (!isAuthorized(req, env)) return new Response("Unauthorized", { status: 401 });
  
		const bodyText = await req.text();
		let parsed: unknown;
  
		try {
		  parsed = JSON.parse(bodyText);
		} catch {
		  return new Response("Bad JSON", { status: 400 });
		}
  
		// KV: 1 write per key per second limit; keep updates low-frequency :contentReference[oaicite:10]{index=10}
		await env.NOWPLAYING.put(KEY, JSON.stringify(parsed), { expirationTtl: 600 }); // 10 min :contentReference[oaicite:11]{index=11}
		return new Response(null, { status: 204 });
	  }
  
	  return new Response("Not found", { status: 404 });
	},
  };