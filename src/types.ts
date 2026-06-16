export type NoteType = "session" | "learning" | "decision" | "concept" | "project" | "reference" | "index";

export interface NoteFrontmatter {
  id: string;
  type: NoteType;
  title: string;
  created: string;
  updated: string;
  tags: string[];
  related: string[];
  source?: string;
  project?: string;
  importance?: 1 | 2 | 3 | 4 | 5;
  status?: "draft" | "active" | "archived";
}

export interface Note {
  id: string;
  type: NoteType;
  title: string;
  path: string;
  frontmatter: NoteFrontmatter;
  content: string;
  body: string;
  created: Date;
  updated: Date;
  tags: string[];
  related: string[];
  wikilinks: string[];
  backlinks: string[];
  wordCount: number;
}

export interface MemoryQuery {
  query: string;
  type?: NoteType;
  tags?: string[];
  project?: string;
  limit?: number;
  offset?: number;
  semantic?: boolean;
}

export interface MemoryResult {
  note: Note;
  score: number;
  matchType: "keyword" | "semantic" | "tag" | "exact";
}

export interface SessionContext {
  sessionId: string;
  project: string;
  startTime: string;
  relevantNotes: Note[];
  recentSessions: Note[];
  openDecisions: Note[];
  projectBrief: Note | null;
}

export interface SessionEndInput {
  sessionId: string;
  summary: string;
  learnings: string[];
  decisions: string[];
  duration?: number;
  toolCalls?: number;
}

export interface HealthReport {
  timestamp: string;
  totalNotes: number;
  totalWikilinks: number;
  orphans: { path: string; title: string }[];
  brokenLinks: { source: string; target: string }[];
  stalePages: { path: string; title: string; daysSinceUpdate: number }[];
  missingMetadata: { path: string; missing: string[] }[];
  stats: {
    byType: Record<NoteType, number>;
    byTag: Record<string, number>;
    totalBacklinks: number;
    avgWordCount: number;
  };
}

export interface VaultConfig {
  path: string;
  port: number;
  host: string;
  embeddingModel?: string;
}

export interface KnowledgeEdge {
  source: string;
  target: string;
  kind: "wikilink" | "related" | "tag" | "same-project";
}

export interface KnowledgeGraph {
  nodes: Map<string, Note>;
  edges: KnowledgeEdge[];
}

export type ChatMode = "ollama" | "opencode";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  mode: ChatMode;
  model?: string;
  sessionId?: string;
  stream?: boolean;
  temperature?: number;
}

export interface ChatConfig {
  mode: ChatMode;
  ollama: {
    endpoint: string;
    defaultModel: string;
    models: string[];
  };
  opencode: {
    command: string;
    agent: string;
  };
}

export interface ContextInjection {
  notes: Note[];
  sessionContext: string;
  systemPrompt: string;
}
