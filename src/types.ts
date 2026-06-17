export type NoteType = "session" | "learning" | "decision" | "concept" | "project" | "reference" | "index" | "entity" | "task" | "reflection";

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
  entityType?: EntityType;
  priority?: "low" | "medium" | "high" | "critical";
  period?: "weekly" | "monthly";
  date?: string;
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
}

export interface MemoryResult {
  note: Note;
  score: number;
  matchType: "keyword" | "tag" | "exact";
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
  images?: string[];
}

export interface ChatFile {
  name: string;
  content: string;
  mimeType?: string;
  encoding?: string;
}

export interface ExcelCellEdit {
  cell: string;
  value: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  mode: ChatMode;
  model?: string;
  sessionId?: string;
  stream?: boolean;
  temperature?: number;
  files?: ChatFile[];
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

// ── Phase 1: Entity Types & Core Types ──

export type EntityType =
  | "project" | "decision" | "task" | "goal"
  | "learning" | "concept" | "reference"
  | "technology" | "person" | "reflection";

export interface EntityNote extends Note {
  entityType: EntityType;
  confidence: number;
  retrievalCount: number;
  referenceCount: number;
  lastReferenced: string;
  importance: number;
}

export type MemoryTier = "knowledge" | "working" | "project";

export interface TypedEdge {
  source: string;
  target: string;
  kind:
    | "uses" | "depends_on" | "implements"
    | "references" | "derived_from"
    | "supersedes" | "related_to"
    | "blocks" | "enables";
  weight: number;
  created: string;
}

export interface KnowledgeGraphV2 {
  nodes: Map<string, EntityNote>;
  edges: TypedEdge[];
}

export interface DecisionRecord {
  title: string;
  rationale: string;
  alternativesConsidered: string[];
  consequences: string;
  date: string;
  project: string;
  status: "proposed" | "accepted" | "superseded";
}

export interface ProjectState {
  name: string;
  summary: string;
  currentGoal: string;
  currentPhase: string;
  currentTasks: TaskSummary[];
  openProblems: string[];
  recentDecisions: DecisionRecord[];
  recentLearnings: string[];
  relatedKnowledge: string[];
  suggestedNextActions: string[];
}

export interface TaskSummary {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  priority: "low" | "medium" | "high" | "critical";
  assignee?: string;
  dependsOn?: string[];
}

export interface ImportanceFactors {
  retrievalFrequency: number;
  projectRelevance: number;
  recency: number;
  decisionStatus: number;
  crossLinkDensity: number;
  userEmphasis: number;
}

export interface RetrievalEvalResult {
  query: string;
  expected: string[];
  results: string[];
  recall5: number;
  recall10: number;
  mrr: number;
  precision: number;
}

export interface MaintenanceJob {
  name: string;
  interval: number;
  lastRun: number | null;
  run(): Promise<MaintenanceResult>;
}

export interface MaintenanceResult {
  ok: boolean;
  job: string;
  duration: number;
  itemsProcessed: number;
  errors: string[];
}
