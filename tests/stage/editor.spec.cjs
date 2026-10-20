const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const fixture = JSON.parse(
  fs.readFileSync(process.env.MEE_STAGE_FIXTURE, "utf8"),
);

async function open(page, type) {
  await page.goto(
    `${fixture.admin}post.php?post=${fixture.fixture.posts[type]}&action=edit`,
  );
  await page.waitForFunction(() =>
    window.tinymce?.editors?.some((e) => e.initialized),
  );
}

test("editor role receives contextual guidance without configuration", async ({
  page,
}) => {
  await open(page, "page");
  const editors = await page.evaluate(() =>
    tinymce.editors.map((e) => ({ id: e.id, context: e.settings.mee_context })),
  );
  expect(editors.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => !!window.MunicipioEditorExtensions)).toBe(
    true,
  );
  await page.evaluate(() => {
    const editor = tinymce.get("content") || tinymce.editors[0];
    editor.show();
    editor.setContent("<h1>Invalid</h1><h2>Valid</h2><h4>Jump</h4>");
    editor.focus();
    editor.selection.setCursorLocation(
      editor.getBody().querySelector("h1").firstChild,
      2,
    );
  });
  await expect(page.locator(".mee-heading-popover:visible")).toHaveCount(1);
  await expect(page.locator(".mee-heading-popover:visible")).toContainText(
    "H1",
  );
  const decoration = await page.evaluate(() => {
    const editor = tinymce.get("content");
    const heading = editor.getBody().querySelector("h1");
    const style = editor.getWin().getComputedStyle(heading);
    const icon = editor.getWin().getComputedStyle(heading, "::after");
    return {
      line: style.textDecorationStyle,
      color: style.textDecorationColor,
      icon: icon.backgroundImage,
      size: icon.width,
    };
  });
  expect(decoration.line).toBe("wavy");
  expect(decoration.color).toBe("rgb(181, 119, 0)");
  expect(decoration.icon).toContain("warning.svg");
  expect(decoration.size).toBe("16px");
  await expect(
    page.locator(".mee-heading-status[role=status]").filter({ hasText: "H1" }),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".mee-heading-popover:visible")).toHaveCount(0);
  await page.evaluate(() => tinymce.activeEditor.fire("SelectionChange"));
  await page.waitForTimeout(100);
  await expect(page.locator(".mee-heading-popover:visible")).toHaveCount(0);
  await page.evaluate(() => {
    const editor = tinymce.activeEditor;
    editor.selection.setCursorLocation(
      editor.getBody().querySelector("h1").firstChild,
      3,
    );
  });
  await expect(page.locator(".mee-heading-popover:visible")).toHaveCount(1);
  expect(await page.evaluate(() => tinymce.activeEditor.hasFocus())).toBe(true);
  expect(
    await page.evaluate(() => tinymce.activeEditor.getContent()),
  ).not.toContain("data-mee");
});

test("stage heading matrix, selection boundaries and text mode", async ({
  page,
}) => {
  await open(page, "page");
  for (const [levels, count] of [
    [[1], 1],
    [[3], 1],
    [[2, 4], 1],
    [[2], 0],
    [[2, 3], 0],
    [[2, 2], 0],
    [[2, 3, 4, 2], 0],
  ]) {
    await page.evaluate((levels) => {
      const editor = tinymce.get("content");
      editor.show();
      editor.setContent(
        levels.map((level) => `<h${level}>Heading</h${level}>`).join(""),
      );
    }, levels);
    await expect(
      page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
    ).toHaveCount(count);
  }
  await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.setContent(
      '<h3>Invalid <em>nested <a href="#">link</a></em></h3><p>Paragraph</p><h2>Correct</h2>',
    );
    editor.focus();
  });
  for (const [kind, visible] of [
    ["caret", true],
    ["whole", true],
    ["boundaries", true],
    ["nested", true],
    ["backward", true],
    ["paragraph", false],
    ["two", false],
    ["correct", false],
  ]) {
    await page.evaluate((kind) => {
      const editor = tinymce.get("content"),
        doc = editor.getDoc(),
        h = doc.querySelector("h3");
      const range = doc.createRange();
      if (kind === "caret") {
        range.setStart(h.firstChild, 2);
        range.collapse(true);
      }
      if (kind === "whole") range.selectNodeContents(h);
      if (kind === "boundaries") range.selectNode(h);
      if (kind === "nested") range.selectNodeContents(h.querySelector("a"));
      if (kind === "paragraph" || kind === "two") {
        range.setStart(h.firstChild, 2);
        range.setEnd(
          doc.querySelector(kind === "two" ? "h2" : "p").firstChild,
          3,
        );
      }
      if (kind === "correct") range.selectNodeContents(doc.querySelector("h2"));
      editor.selection.setRng(range);
      if (kind === "backward")
        doc
          .getSelection()
          .setBaseAndExtent(
            h.querySelector("a").firstChild,
            3,
            h.firstChild,
            2,
          );
    }, kind);
    await expect(page.locator(".mee-heading-popover:visible")).toHaveCount(
      visible ? 1 : 0,
    );
  }
  await page.evaluate(() => switchEditors.go("content", "html"));
  await page
    .locator("#content")
    .fill("<h2>Valid</h2><h4>Jump from text mode</h4>");
  await page.evaluate(() => switchEditors.go("content", "tmce"));
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
});

test("unknown ACF context checks internal jumps only", async ({ page }) => {
  await open(page, "page");
  for (const [levels, count] of [
    [[3], 0],
    [[3, 3], 0],
    [[4, 2], 0],
    [[2, 4], 1],
  ]) {
    await page.evaluate((levels) => {
      tinymce
        .get("acf_content")
        .setContent(
          levels.map((level) => `<h${level}>Heading</h${level}>`).join(""),
        );
    }, levels);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            tinymce
              .get("acf_content")
              .getBody()
              .querySelectorAll("[data-mee-heading-warning]").length,
        ),
      )
      .toBe(count);
  }
});

test("warnings do not block publishing and never enter saved content", async ({
  page,
}) => {
  await open(page, "page");
  await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.show();
    editor.setContent("<h1>Invalid but publishable</h1><h4>Level jump</h4>");
  });
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(2);
  await page.locator("#publish").click();
  await page.waitForURL(/message=[16]/);
  await page.waitForFunction(() => tinymce.get("content")?.initialized);
  const html = await page.evaluate(() => tinymce.get("content").getContent());
  expect(html).toContain("<h1>Invalid but publishable</h1>");
  expect(html).toContain("<h4>Level jump</h4>");
  expect(html).not.toContain("data-mee");
});

test("text module reacts to hidden title and keeps internal jump checks", async ({
  page,
}) => {
  await open(page, "mod-text");
  await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.show();
    editor.setContent("<h2>Same as module title</h2><h4>Internal jump</h4>");
  });
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(2);
  await page.locator('[name="modularity-module-hide-title"]').check();
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
});

test("manual input initializes its real ACF WYSIWYG editor", async ({
  page,
}) => {
  await open(page, "mod-manualinput");
  const field = page
    .locator('[data-key="field_64ff231ed91b9"]')
    .filter({ has: page.locator("textarea") })
    .first();
  await expect(field).toBeVisible();
  const id = await field.locator("textarea").first().getAttribute("id");
  await page.evaluate((id) => {
    const editor = tinymce.get(id);
    editor.show();
    editor.setContent("<h3>Invalid under row heading</h3><h4>Child</h4>");
    editor.focus();
    editor.selection.setCursorLocation(
      editor.getBody().querySelector("h3").firstChild,
      2,
    );
  }, id);
  await expect(page.locator(".mee-heading-popover:visible")).toHaveCount(1);
  await expect(page.locator(".mee-heading-popover:visible")).toContainText(
    "H4",
  );
  const content = await page.evaluate((id) => tinymce.get(id).getContent(), id);
  expect(content).not.toContain("data-mee");
  const repeater = page.locator('[data-key="field_64ff22b2d91b7"]');
  await repeater.locator('.acf-actions [data-event="add-row"]').last().click();
  const rows = repeater.locator(
    '.acf-row:not(.acf-clone) [data-key="field_64ff231ed91b9"]',
  );
  await expect(rows).toHaveCount(2);
  const dynamicId = await rows.last().locator("textarea").getAttribute("id");
  await page.waitForFunction((id) => tinymce.get(id)?.initialized, dynamicId);
  await page.evaluate((id) => {
    const editor = tinymce.get(id);
    editor.setContent("<h3>Dynamic row</h3>");
    editor.focus();
    editor.selection.setCursorLocation(
      editor.getBody().querySelector("h3").firstChild,
      2,
    );
  }, dynamicId);
  await expect(page.locator(".mee-heading-popover:visible")).toHaveCount(1);
  await expect(page.locator(".mee-heading-popover:visible")).toContainText(
    "H4",
  );
});

test("paste, undo and heading-to-paragraph formatting stay clean on stage", async ({
  page,
}) => {
  await open(page, "page");
  await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.show();
    editor.setContent("<h2>First</h2>");
    editor.focus();
    editor.selection.select(editor.getBody(), true);
    editor.selection.collapse(false);
    editor.undoManager.clear();
    editor.undoManager.add();
    const window = editor.getWin();
    const clipboard = new window.DataTransfer();
    clipboard.setData("text/html", "<h4>Pasted jump</h4>");
    clipboard.setData("text/plain", "Pasted jump");
    editor.getBody().dispatchEvent(
      new window.ClipboardEvent("paste", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
  await page.evaluate(() => tinymce.get("content").undoManager.undo());
  await expect(page.frameLocator("#content_ifr").locator("h4")).toHaveCount(0);
  await page.evaluate(() => tinymce.get("content").undoManager.redo());
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
  await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.selection.setCursorLocation(
      editor.getBody().querySelector("h4").firstChild,
      2,
    );
    editor.execCommand("FormatBlock", false, "p");
  });
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.stringify(tinymce.get("content").undoManager.data),
    ),
  ).not.toContain("data-mee");
});
