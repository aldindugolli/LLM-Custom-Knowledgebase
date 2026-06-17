import type { Vault } from "../core/vault.js";
import type { Note } from "../types.js";
import { v4 as uuid } from "uuid";

interface Theme {
  tag: string;
  count: number;
  notes: string[];
}

interface ReflectionResult {
  id: string;
  period: string;
  periodType: "weekly" | "monthly";
  sessions: number;
  themes: Theme[];
  topTags: string[];
  topProjects: string[];
  created: string;
}

export function createReflectionEngine(vault: Vault) {
  async function generateReflection(periodType: "weekly" | "monthly"): Promise<ReflectionResult> {
    const sessions = await vault.readAllNotes("session");
    const endDate = new Date();
    const startDate = new Date();
    if (periodType === "weekly") {
      startDate.setDate(endDate.getDate() - 7);
    } else {
      startDate.setMonth(endDate.getMonth() - 1);
    }

    const inPeriod = sessions.filter((s) => {
      const d = new Date(s.created);
      return d >= startDate && d <= endDate;
    });

    const tagCounts = new Map<string, { count: number; notes: string[] }>();
    const projectCounts = new Map<string, number>();

    for (const session of inPeriod) {
      for (const tag of session.tags) {
        const entry = tagCounts.get(tag) || { count: 0, notes: [] };
        entry.count++;
        entry.notes.push(session.title);
        tagCounts.set(tag, entry);
      }
      if (session.frontmatter.project) {
        const key = session.frontmatter.project;
        projectCounts.set(key, (projectCounts.get(key) || 0) + 1);
      }
    }

    const themes: Theme[] = Array.from(tagCounts.entries())
      .map(([tag, { count, notes }]) => ({ tag, count, notes }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topTags = themes.slice(0, 5).map((t) => t.tag);
    const topProjects = Array.from(projectCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p]) => p);

    const id = uuid();
    const now = new Date().toISOString();
    const weekNum = getWeekNumber(endDate);
    const periodLabel = `${endDate.getFullYear()}-W${weekNum}`;
    const periodKey = periodType === "weekly" ? `${endDate.getFullYear()}-W${weekNum}` : `${endDate.getFullYear()}-${endDate.getMonth() + 1}`;

    const body = [
      `# Reflection — ${periodType === "weekly" ? `Week ${getWeekNumber(endDate)}` : `${endDate.getFullYear()}-${endDate.getMonth() + 1}`}`,
      "",
      `**Period:** ${periodType} (${startDate.toISOString().slice(0, 10)} — ${endDate.toISOString().slice(0, 10)})`,
      `**Sessions Covered:** ${inPeriod.length}`,
      "",
      "## Key Themes",
      ...themes.map((t) => `- **${t.tag}** (${t.count}x) — ${t.notes.join(", ")}`),
      "",
      "## Top Tags",
      ...topTags.map((t) => `- ${t}`),
      "",
      "## Top Projects",
      ...topProjects.map((p) => `- ${p}`),
      "",
      "## Decisions Made",
      "",
      "## Open Questions",
      "",
      "## Action Items",
      "",
    ].join("\n");

    const fm = `---\nid: ${id}\ntype: reflection\ntitle: "Reflection — ${periodLabel}"\ncreated: ${now}\nupdated: ${now}\ntags: ["reflection", "${periodType}"]\nrelated: []\nperiod: ${periodType}\nstatus: draft\n---\n\n`;

    await vault.writeNote("reflection", periodKey, fm + body);

    return { id, period: periodLabel, periodType, sessions: inPeriod.length, themes, topTags, topProjects, created: now };
  }

  return { generateReflection };
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}
