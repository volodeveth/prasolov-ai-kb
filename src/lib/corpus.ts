export const CATEGORIES = [
  "Регламенти",
  "Посадові інструкції",
  "Навчальні матеріали",
  "Скрипти",
  "FAQ",
  "Внутрішні політики",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const ROLES = ["partner", "lawyer", "assistant", "hr"] as const;

export type Role = (typeof ROLES)[number];

export interface CorpusDoc {
  slug: string;
  title: string;
  category: Category;
  roles: Role[] | null;
  updated: string;
  body: string;
}

/**
 * Parse a corpus markdown file: YAML-ish frontmatter delimited by `---` lines,
 * followed by a markdown body. Frontmatter is a flat list of `key: value` lines
 * (no nesting), with `roles` supporting an inline array syntax `[a, b]`.
 */
export function parseCorpusFile(raw: string, filename: string): CorpusDoc {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    throw new Error(`${filename}: не знайдено frontmatter (очікується блок --- ... ---)`);
  }

  const [, frontmatterBlock, body] = match;

  const fields: Record<string, string> = {};
  for (const line of frontmatterBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    fields[key] = value;
  }

  const slug = fields.slug;
  if (!slug) {
    throw new Error(`${filename}: відсутнє поле slug`);
  }

  const title = fields.title;
  if (!title) {
    throw new Error(`${filename}: відсутнє поле title`);
  }

  const category = fields.category;
  if (!category || !(CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(
      `${filename}: невідома category "${category}". Дозволені: ${CATEGORIES.join(", ")}`
    );
  }

  const updated = fields.updated;
  if (!updated) {
    throw new Error(`${filename}: відсутнє поле updated`);
  }

  let roles: Role[] | null = null;
  const rolesRaw = fields.roles;
  if (rolesRaw) {
    const listMatch = rolesRaw.match(/^\[(.*)\]$/);
    const inner = listMatch ? listMatch[1] : rolesRaw;
    roles = inner
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    for (const role of roles) {
      if (!(ROLES as readonly string[]).includes(role)) {
        throw new Error(
          `${filename}: невідома роль "${role}". Дозволені: ${ROLES.join(", ")}`
        );
      }
    }
  }

  return {
    slug,
    title,
    category: category as Category,
    roles: roles as Role[] | null,
    updated,
    body: body.trim(),
  };
}
