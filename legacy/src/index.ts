import { timer } from "./timer";
import { getPlatform } from "./platform";

// Embed static files directly
import indexHtml from "../public/index.html" with { type: "text" };
import stylesCss from "../public/styles.css" with { type: "text" };
import appJs from "../public/app.js" with { type: "text" };

const PORT = parseInt(process.env.PORT || "3000");

// Static file content map (embedded at build time)
const staticFiles: Record<string, { content: string; type: string }> = {
    "/": { content: indexHtml, type: "text/html" },
    "/index.html": { content: indexHtml, type: "text/html" },
    "/styles.css": { content: stylesCss, type: "text/css" },
    "/app.js": { content: appJs, type: "application/javascript" },
};

// Serve static files and handle API routes
const server = Bun.serve({
    port: PORT,
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        // API Routes
        if (path.startsWith("/api/")) {
            return handleApi(request, path);
        }

        // Static file serving (from embedded content)
        return serveStatic(path);
    },
});

async function handleApi(request: Request, path: string): Promise<Response> {
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    };

    try {
        // GET /api/status - Get current timer state
        if (path === "/api/status" && request.method === "GET") {
            const state = timer.getState();
            return new Response(JSON.stringify({
                ...state,
                platform: getPlatform(),
            }), { headers });
        }

        // POST /api/start-timer - Start the timer
        if (path === "/api/start-timer" && request.method === "POST") {
            const body = await request.json() as { minutes?: number };
            const minutes = body.minutes || 30;

            if (minutes <= 0 || minutes > 480) {
                return new Response(JSON.stringify({
                    error: "Duration must be between 1 and 480 minutes"
                }), { status: 400, headers });
            }

            const state = timer.start(minutes);
            return new Response(JSON.stringify(state), { headers });
        }

        // POST /api/cancel-timer - Cancel the timer
        if (path === "/api/cancel-timer" && request.method === "POST") {
            const state = timer.cancel();
            return new Response(JSON.stringify(state), { headers });
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404, headers
        });
    } catch (error) {
        console.error("[API Error]", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500, headers
        });
    }
}

function serveStatic(path: string): Response {
    // Security: prevent directory traversal
    const safePath = path.replace(/\.\./g, "");

    const file = staticFiles[safePath];
    if (file) {
        return new Response(file.content, {
            headers: { "Content-Type": file.type },
        });
    }

    // Fallback to index.html for SPA routing
    const indexFile = staticFiles["/index.html"];
    if (indexFile) {
        return new Response(indexFile.content, {
            headers: { "Content-Type": "text/html" },
        });
    }

    return new Response("Not found", { status: 404 });
}

console.log(`
╔═══════════════════════════════════════════╗
║         🌙 Sleepy Video Timer 🌙          ║
╠═══════════════════════════════════════════╣
║  Server running at:                       ║
║  → http://localhost:${PORT}                   ║
║                                           ║
║  Platform: ${getPlatform().padEnd(30)}║
╚═══════════════════════════════════════════╝
`);
