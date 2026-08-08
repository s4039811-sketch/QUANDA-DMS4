import assert from "node:assert/strict";
import test from "node:test";
import {
  CALENDAR_STORAGE_KEY,
  COMPLETION_STORAGE_KEY,
  createRoadmapCalendarTasks,
  dateFromKey,
  isCalendarTask,
  readCalendarTasks,
  readCompletion,
  removeRoadmapCalendarTasks,
  syncRoadmapCalendarTasks,
} from "../calendar.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

const milestones = [
  { stageId: "stage-1", title: "Foundation", deadline: "2026-08-10", category: "sage" },
  { stageId: "stage-2", title: "First draft", deadline: "2026-08-12", category: "peach" },
];

test("validates local calendar dates", () => {
  assert.equal(dateFromKey("2026-08-05")?.getDate(), 5);
  assert.equal(dateFromKey("2026-02-31"), null);
  assert.equal(dateFromKey("not-a-date"), null);
});

test("migrates legacy manual tasks without losing user data", () => {
  const storage = memoryStorage({
    [CALENDAR_STORAGE_KEY]: JSON.stringify([
      { title: "Ask for feedback", deadline: "2026-08-07", done: false },
      { title: "Invalid", deadline: "2026-02-31" },
    ]),
  });
  const tasks = readCalendarTasks(storage);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].source, "manual");
  assert.match(tasks[0].id, /^manual:/);
  assert.equal(isCalendarTask(tasks[0]), true);
});

test("creates stable roadmap tasks and reflects completed stages", () => {
  const tasks = createRoadmapCalendarTasks({
    roadmapId: "roadmap-1",
    milestones,
    completedStageIds: ["stage-1"],
    now: new Date("2026-08-05T00:00:00.000Z"),
  });
  assert.deepEqual(tasks.map((task) => task.id), [
    "roadmap:roadmap-1:stage-1",
    "roadmap:roadmap-1:stage-2",
  ]);
  assert.equal(tasks[0].done, true);
  assert.equal(tasks[1].done, false);
});

test("replaces roadmap milestones while preserving manual tasks and creation time", () => {
  const manualTask = {
    id: "manual-1",
    title: "Ask for feedback",
    deadline: "2026-08-07",
    category: "peach",
    source: "manual",
    done: false,
    createdAt: "2026-08-05T00:00:00.000Z",
  };
  const existingRoadmapTask = {
    id: "roadmap:roadmap-1:stage-1",
    title: "Old title",
    deadline: "2026-08-06",
    category: "sage",
    source: "roadmap",
    done: false,
    createdAt: "2026-08-04T00:00:00.000Z",
    roadmapId: "roadmap-1",
    stageId: "stage-1",
  };
  const staleRoadmapTask = { ...existingRoadmapTask, id: "roadmap:old:stage-9", roadmapId: "old" };
  const synced = syncRoadmapCalendarTasks(
    [manualTask, existingRoadmapTask, staleRoadmapTask],
    {
      roadmapId: "roadmap-1",
      milestones,
      completedStageIds: ["stage-2"],
      now: new Date("2026-08-05T00:00:00.000Z"),
    },
  );
  assert.deepEqual(synced[0], manualTask);
  assert.equal(synced.some((task) => task.id === staleRoadmapTask.id), false);
  assert.equal(synced[1].title, "Foundation");
  assert.equal(synced[1].createdAt, existingRoadmapTask.createdAt);
  assert.equal(synced[2].done, true);
  assert.deepEqual(removeRoadmapCalendarTasks(synced), [manualTask]);
});

test("sanitizes persisted completion records", () => {
  const storage = memoryStorage({
    [COMPLETION_STORAGE_KEY]: JSON.stringify({
      "roadmap-1": ["stage-1", "stage-1", "stage-2"],
      invalid: ["stage-1", 2],
    }),
  });
  assert.deepEqual(readCompletion(storage), {
    "roadmap-1": ["stage-1", "stage-2"],
  });
});
