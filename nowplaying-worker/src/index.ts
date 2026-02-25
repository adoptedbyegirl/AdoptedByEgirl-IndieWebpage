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
	  // Public: GET /now
if (req.method === "GET" && url.pathname === "/now") {
	const raw = await env.NOWPLAYING.get(KEY); // string
	if (!raw) {
	  return new Response(null, {
		status: 204,
		headers: { ...corsHeaders(req, env), "Cache-Control": "no-store" },
	  });
	}
  
	// simple ETag (stable if content unchanged)
	const etag = `"${raw.length}-${raw.charCodeAt(0) || 0}-${raw.charCodeAt(raw.length - 1) || 0}"`;
	const inm = req.headers.get("If-None-Match");
	if (inm && inm === etag) {
	  return new Response(null, {
		status: 304,
		headers: {
		  ...corsHeaders(req, env),
		  "ETag": etag,
		  "Cache-Control": "public, max-age=10",
		},
	  });
	}
  
	return new Response(raw, {
	  status: 200,
	  headers: {
		...corsHeaders(req, env),
		"content-type": "application/json; charset=utf-8",
		"ETag": etag,
		// short cache is fine; you’re polling anyway
		"Cache-Control": "public, max-age=10",
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