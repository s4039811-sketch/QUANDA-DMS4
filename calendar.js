export const CALENDAR_STORAGE_KEY = "quanda-calendar-tasks-v2";
export const COMPLETION_STORAGE_KEY = "quanda-calendar-completion-v1";

export const taskCategories = ["sage", "peach", "lavender", "sky", "butter"];

/**
 * @typedef {"sage" | "peach" | "lavender" | "sky" | "butter"} CalendarTaskCategory
 * @typedef {Object} CalendarTask
 * @property {string} id
 * @property {string} title
 * @property {string} deadline
 * @property {CalendarTaskCategory} category
 * @property {"manual" | "roadmap"} source
 * @property {boolean} done
 * @property {string} createdAt
 * @property {string=} roadmapId
 * @property {string=} stageId
 */

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateFromKey(key) {
  if (typeof key !== "string") return null;
  const match = DATE_KEY_PATTERN.exec(key);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

export function categoryForIndex(index) {
  return taskCategories[index % taskCategories.length];
}

function categoryForTitle(title) {
  const hash = [...title].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return categoryForIndex(hash);
}

function legacyTaskId(task, index) {
  const titlePart = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "task";
  return `manual:${task.deadline}:${index}:${titlePart}`;
}

export function normalizeCalendarTask(value, index = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const deadline = dateFromKey(value.deadline) ? value.deadline : null;
  if (!title || title.length > 160 || !deadline) return null;

  const source = value.source === "roadmap" ? "roadmap" : "manual";
  const category = taskCategories.includes(value.category)
    ? value.category
    : categoryForTitle(title);
  const normalized = {
    id: typeof value.id === "string" && value.id
      ? value.id
      : legacyTaskId({ title, deadline }, index),
    title,
    deadline,
    category,
    source,
    done: Boolean(value.done),
    createdAt: typeof value.createdAt === "string" && value.createdAt
      ? value.createdAt
      : new Date(0).toISOString(),
  };

  if (typeof value.roadmapId === "string" && value.roadmapId) {
    normalized.roadmapId = value.roadmapId;
  }
  if (typeof value.stageId === "string" && value.stageId) {
    normalized.stageId = value.stageId;
  }
  return normalized;
}

export function isCalendarTask(value) {
  const normalized = normalizeCalendarTask(value);
  return normalized !== null &&
    normalized.id === value.id &&
    normalized.title === value.title &&
    normalized.deadline === value.deadline &&
    normalized.category === value.category &&
    normalized.source === value.source &&
    normalized.done === value.done &&
    normalized.createdAt === value.createdAt;
}

export function readCalendarTasks(storage) {
  try {
    const value = JSON.parse(storage.getItem(CALENDAR_STORAGE_KEY) || "[]");
    return Array.isArray(value)
      ? value.map(normalizeCalendarTask).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function writeCalendarTasks(storage, tasks) {
  try {
    storage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Storage is a progressive enhancement; the in-memory calendar still works.
  }
}

export function readCompletion(storage) {
  try {
    const value = JSON.parse(storage.getItem(COMPLETION_STORAGE_KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, stageIds]) =>
          Array.isArray(stageIds) && stageIds.every((id) => typeof id === "string"),
        )
        .map(([roadmapId, stageIds]) => [roadmapId, [...new Set(stageIds)]]),
    );
  } catch {
    return {};
  }
}

export function writeCompletion(storage, completion) {
  try {
    storage.setItem(COMPLETION_STORAGE_KEY, JSON.stringify(completion));
  } catch {
    // Completion remains usable for the current session when storage is unavailable.
  }
}

export function createRoadmapCalendarTasks({
  roadmapId,
  milestones,
  completedStageIds = [],
  now = new Date(),
}) {
  return milestones.map((milestone, index) => ({
    id: `roadmap:${roadmapId}:${milestone.stageId}`,
    title: milestone.title,
    deadline: milestone.deadline,
    category: milestone.category || categoryForIndex(index),
    source: "roadmap",
    done: completedStageIds.includes(milestone.stageId),
    createdAt: now.toISOString(),
    roadmapId,
    stageId: milestone.stageId,
  }));
}

export function syncRoadmapCalendarTasks(
  tasks,
  { roadmapId, milestones, completedStageIds = [], now = new Date() },
) {
  const existingById = new Map(tasks.map((task) => [task.id, task]));
  const manualTasks = tasks.filter((task) => task.source === "manual");
  const roadmapTasks = createRoadmapCalendarTasks({
    roadmapId,
    milestones,
    completedStageIds,
    now,
  }).map((task) => ({
    ...task,
    createdAt: existingById.get(task.id)?.createdAt ?? task.createdAt,
  }));
  return [...manualTasks, ...roadmapTasks];
}

export function removeRoadmapCalendarTasks(tasks) {
  return tasks.filter((task) => task.source === "manual");
}
