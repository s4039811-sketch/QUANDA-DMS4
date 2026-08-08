import { expect, test } from "@playwright/test";

test("keeps manual tasks and synchronizes roadmap stage completion", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/quanda.html");
  await expect(page.locator(".hero")).toHaveCSS("background-image", /hero-vector-garden\.svg/);

  const calendar = page.getByTestId("project-calendar");
  await expect(calendar).toBeVisible();
  await page.getByRole("button", { name: "VI", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nhìn rõ mọi hạn chót." })).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();

  const taskPanel = calendar.locator(".task-panel");
  await taskPanel.getByPlaceholder("What needs to get done?").fill("Ask for feedback");
  await taskPanel.getByTestId("calendar-add-task").click();
  const manualTask = taskPanel.getByTestId("calendar-task").filter({ hasText: "Ask for feedback" });
  await expect(manualTask).toBeVisible();

  await page.locator("#load-example").click();
  await page.getByRole("button", { name: "Generate my roadmap" }).click();
  await expect(page.locator("#roadmap-results")).toBeVisible();

  const roadmapTask = await page.evaluate(() => {
    const tasks = JSON.parse(localStorage.getItem("quanda-calendar-tasks-v2") || "[]");
    return tasks.find((task) => task.source === "roadmap");
  });
  expect(roadmapTask).toBeTruthy();

  const firstStage = page.locator(".stage-card").first();
  await firstStage.getByTestId("stage-completion").check();
  await expect(firstStage).toHaveClass(/stage-card-collapsed/);
  await expect.poll(() => page.evaluate((taskId) => {
    const tasks = JSON.parse(localStorage.getItem("quanda-calendar-tasks-v2") || "[]");
    return tasks.find((task) => task.id === taskId)?.done;
  }, roadmapTask.id)).toBe(true);

  await calendar.locator(`[data-date="${roadmapTask.deadline}"]`).click();
  const syncedTask = calendar.locator('[data-source="roadmap"]').filter({ hasText: roadmapTask.title });
  await expect(syncedTask.locator('input[type="checkbox"]')).toBeChecked();
  await syncedTask.locator('input[type="checkbox"]').uncheck();
  await expect(firstStage.getByTestId("stage-completion")).not.toBeChecked();
  await expect(firstStage).not.toHaveClass(/stage-card-collapsed/);

  await page.getByRole("button", { name: /Start over/ }).click();
  await expect(page.locator("#roadmap-results")).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const tasks = JSON.parse(localStorage.getItem("quanda-calendar-tasks-v2") || "[]");
    return {
      manual: tasks.filter((task) => task.source === "manual").length,
      roadmap: tasks.filter((task) => task.source === "roadmap").length,
    };
  })).toEqual({ manual: 1, roadmap: 0 });

  await page.reload();
  const restoredManualTask = page.locator('.task-item[data-source="manual"]').filter({ hasText: "Ask for feedback" });
  await expect(restoredManualTask).toBeVisible();
  await restoredManualTask.getByRole("button", { name: /Delete task/ }).click();
  await expect(restoredManualTask).toHaveCount(0);

  const layout = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBe(layout.width);
  expect(browserErrors).toEqual([]);
});
