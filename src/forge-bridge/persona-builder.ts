import { parseMarkdownFile, type ParsedMarkdown } from "../utils/markdown-parser.js";
import { getAgentFilePath, type ForgePaths } from "./paths.js";

export interface AgentPersona {
  readonly name: string;
  readonly description: string;
  readonly model: string | undefined;
  readonly tools: readonly string[];
  readonly promptSection: string;
}

export function buildPersona(
  forgePaths: ForgePaths,
  agentName: string
): AgentPersona | null {
  const filePath = getAgentFilePath(forgePaths, agentName);
  if (!filePath) return null;

  const parsed = parseMarkdownFile(filePath);

  return {
    name: String(parsed.frontmatter["name"] ?? agentName),
    description: String(parsed.frontmatter["description"] ?? ""),
    model: parsed.frontmatter["model"] as string | undefined,
    tools: extractTools(parsed),
    promptSection: buildPromptSection(agentName, parsed),
  };
}

function extractTools(parsed: ParsedMarkdown): readonly string[] {
  const raw = parsed.frontmatter["tools"];
  if (Array.isArray(raw)) return raw.map(String);
  return [];
}

function buildPromptSection(agentName: string, parsed: ParsedMarkdown): string {
  const header = `# Specialized Agent: ${agentName}`;
  const body = parsed.body;

  return `${header}\n\n${body}`;
}
