import { readFileSync } from "node:fs";

export interface ParsedMarkdown {
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
}

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseMarkdownFile(filePath: string): ParsedMarkdown {
  const content = readFileSync(filePath, "utf-8");
  return parseMarkdownString(content);
}

export function parseMarkdownString(content: string): ParsedMarkdown {
  const match = FRONTMATTER_REGEX.exec(content);

  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  const [, rawFrontmatter, body] = match;
  const frontmatter = parseSimpleYaml(rawFrontmatter ?? "");

  return {
    frontmatter,
    body: (body ?? "").trim(),
  };
}

function parseSimpleYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const inner = rawValue.slice(1, -1);
      result[key] = inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (rawValue === "true") {
      result[key] = true;
    } else if (rawValue === "false") {
      result[key] = false;
    } else if (/^\d+$/.test(rawValue)) {
      result[key] = parseInt(rawValue, 10);
    } else {
      result[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }

  return result;
}
