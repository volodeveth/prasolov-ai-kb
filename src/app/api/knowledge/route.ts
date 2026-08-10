import { ROLES, type Role } from "@/lib/corpus";
import { createServiceClient } from "@/lib/supabase";

interface KbDocumentRow {
  slug: string;
  title: string;
  category: string;
  roles: string[] | null;
  updated_at: string;
  chunk_count: number;
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function jsonError(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");

  if (!isRole(role)) {
    return jsonError(400, {
      error: "bad_request",
      message: `role must be one of: ${ROLES.join(", ")}`,
    });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("kb_documents")
    .select("slug, title, category, roles, updated_at, chunk_count")
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    console.error("GET /api/knowledge select error", error);
    return jsonError(500, { error: "internal_error", message: "Failed to load documents" });
  }

  const rows = (data ?? []) as KbDocumentRow[];
  const documents = rows.map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    category: doc.category,
    roles: doc.roles,
    updated_at: doc.updated_at,
    chunk_count: doc.chunk_count,
    accessible: doc.roles === null || doc.roles.includes(role),
  }));

  return new Response(JSON.stringify({ documents }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
