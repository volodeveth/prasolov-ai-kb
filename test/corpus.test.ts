import { describe, it, expect } from "vitest";
import { parseCorpusFile } from "../src/lib/corpus";

const raw = `---
slug: test-doc
title: Тестовий документ
category: Регламенти
roles: [partner]
updated: 2026-07-01
---

## Розділ
Текст.`;

describe("parseCorpusFile", () => {
  it("parses frontmatter and body", () => {
    const d = parseCorpusFile(raw, "test-doc.md");
    expect(d.slug).toBe("test-doc");
    expect(d.category).toBe("Регламенти");
    expect(d.roles).toEqual(["partner"]);
    expect(d.body).toContain("## Розділ");
  });
  it("roles is null when absent", () => {
    const noRoles = raw.replace("roles: [partner]\n", "");
    expect(parseCorpusFile(noRoles, "test-doc.md").roles).toBeNull();
  });
  it("throws on unknown category", () => {
    const bad = raw.replace("Регламенти", "Інше");
    expect(() => parseCorpusFile(bad, "test-doc.md")).toThrow();
  });
  it("strips surrounding quotes from a quoted title", () => {
    const quoted = raw.replace(
      "title: Тестовий документ",
      'title: "Тест: з лапками"'
    );
    expect(parseCorpusFile(quoted, "test-doc.md").title).toBe("Тест: з лапками");
  });
});
