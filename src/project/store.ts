import type { Vault } from "../core/vault.js";
import type { Note, ProjectState, TaskSummary, DecisionRecord } from "../types.js";

export function createProjectStore(vault: Vault) {
  async function listProjects(): Promise<ProjectState[]> {
    const notes = await vault.readAllNotes("project");
    return notes.map(toProjectState);
  }

  async function getProject(name: string): Promise<ProjectState | undefined> {
    const notes = await vault.readAllNotes();
    const note = notes.find((n) =>
      (n.title.toLowerCase() === name.toLowerCase() || n.frontmatter.project === name) &&
      n.type === "project"
    );
    if (!note) return undefined;
    return toProjectState(note);
  }

  async function getProjectTasks(project: string): Promise<TaskSummary[]> {
    const notes = await vault.readAllNotes("task");
    return notes
      .filter((n) => n.frontmatter.project === project)
      .map((n) => ({
        id: n.id,
        title: n.title,
        status: (String(n.frontmatter.status) === "completed" ? "completed" : String(n.frontmatter.status) === "active" ? "in_progress" : "pending") as TaskSummary["status"],
        priority: (n.frontmatter.priority || "medium") as TaskSummary["priority"],
      }));
  }

  return { listProjects, getProject, getProjectTasks };
}

function toProjectState(note: Note): ProjectState {
  return {
    name: note.title,
    summary: note.body.slice(0, 200),
    currentGoal: "",
    currentPhase: "",
    currentTasks: [],
    openProblems: [],
    recentDecisions: [],
    recentLearnings: [],
    relatedKnowledge: [],
    suggestedNextActions: [],
  };
}
