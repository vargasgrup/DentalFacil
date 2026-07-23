import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function backendBase(): string {
  const raw =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8001";
  return raw.replace(/\/$/, "");
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const incoming = new URL(req.url);
  const target = `${backendBase()}/api/${pathSegments.join("/")}${incoming.search}`;

  const headers = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream fetch failed";
    console.error("[api-proxy]", target, message);
    return NextResponse.json(
      { detail: `No se pudo conectar al backend (${backendBase()}). Revisa BACKEND_URL.` },
      { status: 502 }
    );
  }

  const outHeaders = new Headers();
  const pass = ["content-type", "content-disposition", "cache-control", "content-length", "accept-ranges"];
  for (const key of pass) {
    const value = upstream.headers.get(key);
    if (!value) continue;
    // Headers must be ByteString; skip invalid unicode to avoid proxy crashes
    try {
      outHeaders.set(key, value);
    } catch {
      if (key === "content-disposition") {
        outHeaders.set(key, 'inline; filename="archivo"');
      }
    }
  }

  // Prefer buffering binary media so the browser always receives a complete body
  const upstreamContentType = (upstream.headers.get("content-type") || "").toLowerCase();
  const isBinary =
    upstreamContentType.startsWith("image/") ||
    upstreamContentType === "application/pdf" ||
    upstreamContentType.includes("octet-stream");

  if (isBinary) {
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: upstream.status,
      headers: outHeaders,
    });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

type Ctx = { params: { path: string[] } };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
