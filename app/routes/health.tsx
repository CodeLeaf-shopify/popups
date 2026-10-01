import db from "../db.server";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
};

export async function loader() {
  try {
    await db.$queryRaw`SELECT 1`;
    return new Response("ok", { headers });
  } catch {
    return new Response("unavailable", { status: 503, headers });
  }
}
