const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const content =
  '<h3>Invalid <em>nested <a href="#">link</a></em></h3><p>Paragraph</p><h2>Correct</h2><h4>Skip</h4>';

test.beforeEach(async ({ page }) => {
  await page.route("https://editor.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") {
      return route.fulfill({
        contentType: "text/html",
        body: '<input id="title" value="Page title"><textarea id="content"></textarea><script src="/node_modules/tinymce/tinymce.min.js"></script><script src="/assets/editor.js"></script>',
      });
    }
    const file = path.join(root, url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file))
      return route.abort();
    return route.fulfill({ path: file });
  });
  await page.goto("https://editor.test/");
  await page.evaluate(async (content) => {
    await tinymce.init({
      selector: "#content",
      menubar: false,
      toolbar: false,
      mee_context: { parentLevel: 1, stylesheet: "/assets/content.css" },
    });
    const editor = tinymce.get("content");
    editor.setContent(content);
    editor.focus();
  }, content);
  await expect(
    page.frameLocator("iframe").locator("[data-mee-heading-warning]"),
  ).toHaveCount(2);
});

async function select(page, kind) {
  await page.evaluate((kind) => {
    const editor = tinymce.get("content");
    editor.focus();
    const doc = editor.getDoc();
    const h = doc.querySelector("h3");
    const range = doc.createRange();
    if (kind === "caret") {
      range.setStart(h.firstChild, 2);
      range.collapse(true);
    }
    if (kind === "nested") {
      range.selectNodeContents(h.querySelector("a"));
    }
    if (kind === "whole") range.selectNodeContents(h);
    if (kind === "boundaries") range.selectNode(h);
    if (kind === "paragraph") {
      range.setStart(h.firstChild, 1);
      range.setEnd(doc.querySelector("p").firstChild, 3);
    }
    if (kind === "two") {
      range.setStart(h.firstChild, 1);
      range.setEnd(doc.querySelector("h2").firstChild, 3);
    }
    if (kind === "correct") {
      range.selectNodeContents(doc.querySelector("h2"));
      range.collapse(true);
    }
    editor.selection.setRng(range);
    if (kind === "backward") {
      const selection = doc.getSelection();
      selection.setBaseAndExtent(
        h.querySelector("a").firstChild,
        3,
        h.firstChild,
        2,
      );
    }
    editor.fire("SelectionChange");
  }, kind);
}

test("selection containment, nested markup and reversed selection", async ({
  page,
}) => {
  for (const kind of ["caret", "nested", "whole", "boundaries", "backward"]) {
    await select(page, kind);
    await expect(page.locator(".mee-heading-popover")).toBeVisible();
  }
  for (const kind of ["paragraph", "two", "correct"]) {
    await select(page, kind);
    await expect(page.locator(".mee-heading-popover")).toBeHidden();
  }
});

test("Escape remains dismissed until selection really changes", async ({
  page,
}) => {
  await select(page, "caret");
  await expect(page.locator(".mee-heading-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".mee-heading-popover")).toBeHidden();
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) tinymce.get("content").fire("SelectionChange");
  });
  await page.waitForTimeout(100);
  await expect(page.locator(".mee-heading-popover")).toBeHidden();
  await select(page, "nested");
  await expect(page.locator(".mee-heading-popover")).toBeVisible();
  await select(page, "paragraph");
  await expect(page.locator(".mee-heading-popover")).toBeHidden();
});

test("decorations do not serialize, create undo levels or move focus/selection", async ({
  page,
}) => {
  await select(page, "nested");
  const before = await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.undoManager.add();
    return {
      html: editor.getContent(),
      undo: editor.undoManager.data.length,
      selection: editor.selection.getContent(),
    };
  });
  await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.nodeChanged();
    editor.fire("change");
    editor.fire("SelectionChange");
    editor.save();
  });
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => {
    const editor = tinymce.get("content");
    return {
      html: editor.getContent(),
      undo: editor.undoManager.data.length,
      selection: editor.selection.getContent(),
    };
  });
  expect(after).toEqual(before);
  expect(after.html).not.toContain("data-mee");
  expect(
    await page.evaluate(() =>
      JSON.stringify(tinymce.get("content").undoManager.data),
    ),
  ).not.toContain("data-mee");
  await expect(page.locator("#content")).not.toHaveValue(/data-mee/);
  expect(await page.evaluate(() => tinymce.get("content").hasFocus())).toBe(
    true,
  );
});

test("paste, undo/redo and text mode round trips preserve clean content", async ({
  page,
}) => {
  await select(page, "correct");
  await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.undoManager.clear();
    editor.undoManager.add();
    editor.execCommand("mceInsertContent", false, "<h5>Pasted heading</h5>");
  });
  await expect(
    page.frameLocator("iframe").locator("[data-mee-heading-warning]"),
  ).toHaveCount(3);
  await page.evaluate(() => tinymce.get("content").undoManager.undo());
  await expect(
    page.frameLocator("iframe").locator("[data-mee-heading-warning]"),
  ).toHaveCount(2);
  await page.evaluate(() => tinymce.get("content").undoManager.redo());
  await expect(
    page.frameLocator("iframe").locator("[data-mee-heading-warning]"),
  ).toHaveCount(3);
  await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.save();
    editor.hide();
    const textarea = document.querySelector("#content");
    textarea.value = "<h2>Valid</h2><h4>Invalid</h4>";
    editor.show();
    editor.setContent(textarea.value);
    editor.focus();
  });
  await expect(
    page.frameLocator("iframe").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
  expect(
    await page.evaluate(() => tinymce.get("content").getContent()),
  ).not.toContain("data-mee");
});

test("manual input follows accordion mode and unknown mode remains advisory", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const form = document.createElement("form");
    form.innerHTML =
      '<div class="acf-field" data-key="display"><select><option value="accordion">Accordion</option><option value="other">Other</option></select></div><div class="acf-fields"><div class="acf-field" data-key="manual"><textarea id="manual"></textarea></div></div>';
    document.body.append(form);
    await tinymce.init({
      selector: "#manual",
      menubar: false,
      toolbar: false,
      mee_context: {
        fields: {
          manual: { level: 3, when: { key: "display", value: "accordion" } },
        },
      },
    });
    tinymce.get("manual").setContent("<h3>Invalid under H3</h3><h4>Child</h4>");
  });
  await expect(
    page.frameLocator("#manual_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
  await page.locator('[data-key="display"] select').selectOption("other");
  await expect(
    page.frameLocator("#manual_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(0);
});

test("fixed position fallback without native popover retains keyboard behavior", async ({
  page,
}) => {
  await page.evaluate(() => {
    delete HTMLElement.prototype.showPopover;
    delete HTMLElement.prototype.hidePopover;
    document.querySelector(".mee-heading-popover").removeAttribute("popover");
  });
  await select(page, "caret");
  await expect(page.locator(".mee-heading-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".mee-heading-popover")).toBeHidden();
});

test("page template and title visibility changes use the live context", async ({
  page,
}) => {
  await page.evaluate(async () => {
    tinymce.get("content").remove();
    const controls = document.createElement("div");
    controls.innerHTML =
      '<select id="page_template"><option value="default">Default</option><option value="one-page.blade.php">One Page</option><option value="custom">Unknown</option></select><div data-name="post_one_page_show_title"><input type="checkbox"></div>';
    document.body.append(controls);
    await tinymce.init({
      selector: "#content",
      menubar: false,
      toolbar: false,
      mee_context: {
        pageLevels: { default: 1, "one-page.blade.php": 1 },
        template: "default",
      },
    });
    tinymce.get("content").setContent("<h3>First heading</h3>");
  });
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
  await page.locator("#page_template").selectOption("one-page.blade.php");
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(0);
  await page.locator('[data-name="post_one_page_show_title"] input').check();
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
  await page.locator("#page_template").selectOption("custom");
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(0);
});

test("unknown dynamic ACF editors and changed module settings", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const field = document.createElement("div");
    field.className = "acf-field";
    field.dataset.key = "unknown";
    field.innerHTML = '<textarea id="dynamic"></textarea>';
    document.body.append(field);
    await tinymce.init({
      selector: "#dynamic",
      menubar: false,
      toolbar: false,
    });
    tinymce.get("dynamic").setContent("<h3>First</h3><h5>Skip</h5>");
  });
  await expect(
    page.frameLocator("#dynamic_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
  await page.evaluate(() => {
    const editor = tinymce.get("content");
    editor.remove();
    const hidden = document.createElement("input");
    hidden.type = "checkbox";
    hidden.name = "modularity-module-hide-title";
    document.body.append(hidden);
    return tinymce
      .init({
        selector: "#content",
        menubar: false,
        toolbar: false,
        mee_context: { postType: "mod-text", textLevel: 2 },
      })
      .then(() =>
        tinymce.get("content").setContent("<h2>Title</h2><h3>Child</h3>"),
      );
  });
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(1);
  await page.locator('[name="modularity-module-hide-title"]').check();
  await expect(
    page.frameLocator("#content_ifr").locator("[data-mee-heading-warning]"),
  ).toHaveCount(0);
});

test("changing a warned heading into a paragraph removes its decoration", async ({
  page,
}) => {
  await select(page, "caret");
  await page.evaluate(() =>
    tinymce.get("content").execCommand("FormatBlock", false, "p"),
  );
  await expect(
    page.frameLocator("iframe").locator("p[data-mee-heading-warning]"),
  ).toHaveCount(0);
  await expect(page.locator(".mee-heading-popover:visible")).toHaveCount(0);
});

test("warnings sit above the heading with an unclipped gutter and scoped focus reset", async ({
  page,
}) => {
  await page.addStyleTag({ url: "/assets/admin.css" });
  await page.evaluate(() => {
    document.body.style.paddingTop = "200px";
    const doc = tinymce.get("content").getDoc();
    const style = doc.createElement("style");
    // The actual Municipio rule also applies to the editable body.
    style.textContent =
      "*:focus-visible:not(input){outline:thick solid #4d90fe;box-shadow:0 0 0 6px white}";
    doc.head.append(style);
  });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await select(page, "caret");
    await expect(page.locator(".mee-heading-popover")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const editor = tinymce.get("content");
      const h = editor.getBody().querySelector("h3");
      const rect = h.getBoundingClientRect();
      const frame = editor.iframeElement.getBoundingClientRect();
      const tip = document
        .querySelector(".mee-heading-popover")
        .getBoundingClientRect();
      const icon = editor.getWin().getComputedStyle(h, "::after");
      const body = editor.getWin().getComputedStyle(editor.getBody());
      return {
        headingLeft: frame.left + rect.left,
        headingTop: frame.top + rect.top,
        tipLeft: tip.left,
        tipBottom: tip.bottom,
        tipRight: tip.right,
        iconLeft: rect.left + parseFloat(icon.left),
        iconRight: parseFloat(icon.left) + parseFloat(icon.width),
        outline: body.outlineStyle,
        shadow: body.boxShadow,
      };
    });
    expect(geometry.tipBottom).toBeLessThan(geometry.headingTop);
    if (width === 1280)
      expect(geometry.tipLeft).toBeCloseTo(geometry.headingLeft, 0);
    expect(geometry.tipRight).toBeLessThanOrEqual(width);
    expect(geometry.iconLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.iconRight).toBeLessThan(0);
    expect(geometry.outline).toBe("none");
    expect(geometry.shadow).toBe("none");
  }
  const linkOutline = await page.evaluate(() => {
    const editor = tinymce.get("content");
    const link = editor.getBody().querySelector("a");
    link.contentEditable = "false";
    link.focus();
    return editor.getWin().getComputedStyle(link).outlineStyle;
  });
  expect(linkOutline).toBe("solid");
});
