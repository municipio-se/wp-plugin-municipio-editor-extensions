(function (root) {
  "use strict";

  const attribute = "data-mee-heading-warning";
  const selector = "h1,h2,h3,h4,h5,h6";

  function warnings(levels, parent) {
    parent =
      Number.isInteger(parent) && parent >= 1 && parent <= 6 ? parent : null;
    let previous = Number.isInteger(parent) ? parent : null;
    return levels.map((level) => {
      let warning = null;
      if (parent !== null && level <= parent) {
        warning = { type: "parent", level, expected: parent + 1 };
      } else if (previous !== null && level > previous + 1) {
        warning = { type: "skip", level, expected: previous + 1 };
      }
      previous = level;
      return warning;
    });
  }

  function sameSelection(left, right) {
    return !!left && !!right && left.every((value, i) => value === right[i]);
  }

  function selectionSnapshot(selection) {
    return [
      selection.anchorNode,
      selection.anchorOffset,
      selection.focusNode,
      selection.focusOffset,
    ];
  }

  function selectedHeading(range, headings) {
    if (!range) return null;
    if (range.collapsed) {
      const node = range.startContainer;
      const element = node.nodeType === 1 ? node : node.parentElement;
      const heading = element && element.closest(selector);
      return headings.includes(heading) ? heading : null;
    }
    return (
      headings.find((heading) => {
        // selectNode also accepts a range with boundaries immediately around
        // the heading, without accepting any adjacent text or another heading.
        const bounds = heading.ownerDocument.createRange();
        bounds.selectNode(heading);
        return (
          range.compareBoundaryPoints(0, bounds) >= 0 &&
          range.compareBoundaryPoints(2, bounds) <= 0
        );
      }) || null
    );
  }

  function readField(scope, key) {
    const field = scope.querySelector(`[data-key="${key}"]`);
    if (!field) return null;
    const input = field.querySelector(
      'input:checked, select, input[type="hidden"], input[type="text"]',
    );
    return input ? input.value : null;
  }

  function parentLevel(editor, context) {
    const element = editor.getElement();
    if (!element) return null;
    const field = element.closest(".acf-field");
    if (field) {
      const rule = (context.fields || {})[field.dataset.key];
      if (!rule) return null;
      const scope =
        field.closest(".acf-block-fields, .acf-fields") ||
        element.ownerDocument;
      if (rule.when && readField(scope, rule.when.key) !== rule.when.value) {
        // Repeater content needs the module's controls, outside the row.
        const moduleScope =
          field.closest(".acf-block-fields, form") || element.ownerDocument;
        if (readField(moduleScope, rule.when.key) !== rule.when.value) {
          return null;
        }
      }
      return rule.level;
    }
    if (editor.id !== "content") return null;
    if (context.postType === "mod-text") {
      const document = element.ownerDocument;
      const title = document.querySelector("#title");
      const hidden = document.querySelector(
        '[name="modularity-module-hide-title"]',
      );
      return title && title.value.trim() && hidden && !hidden.checked
        ? context.textLevel
        : null;
    }
    const title = element.ownerDocument.querySelector("#title");
    if (!title || !title.value.trim()) return null;
    if (context.pageLevels) {
      const document = element.ownerDocument;
      const template =
        document.querySelector("#page_template")?.value || context.template;
      if (template === "one-page.blade.php" && !context.onePageAlwaysTitle) {
        const control = document.querySelector(
          '[data-name="post_one_page_show_title"] input[type="checkbox"]',
        );
        if (!(control ? control.checked : context.onePageShowTitle))
          return null;
      }
      return context.pageLevels[template] ?? null;
    }
    return context.parentLevel ?? null;
  }

  const api = {
    warnings,
    sameSelection,
    selectionSnapshot,
    selectedHeading,
    parentLevel,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!root || !root.tinymce || root.MunicipioEditorExtensions) return;
  root.MunicipioEditorExtensions = api;

  function attach(editor) {
    if (editor.municipioEditorExtensions) return;
    editor.municipioEditorExtensions = true;
    let context = editor.settings.mee_context || root.meeEditorContext || {};
    if (typeof context === "string") context = JSON.parse(context);
    const messages = context.messages || {
      parent:
        "H{level} is outside this field's heading hierarchy. Use H{expected} or lower.",
      skip: "H{level} skips a heading level. Use H{expected} before going deeper.",
    };
    let invalid = new Map();
    let dismissed = null;
    let frame = null;
    let disposed = false;
    let popover;
    let status;
    let observer;
    let activeHeading;
    const document = editor.getElement().ownerDocument;
    const window = document.defaultView;

    function hide() {
      activeHeading = null;
      if (!popover) return;
      if (
        typeof popover.hidePopover === "function" &&
        popover.matches(":popover-open")
      )
        popover.hidePopover();
      popover.hidden = true;
      status.textContent = "";
    }

    function position() {
      if (!activeHeading || !popover || popover.hidden) return;
      const rect = activeHeading.getBoundingClientRect();
      const iframe = editor.iframeElement;
      const offset = iframe
        ? iframe.getBoundingClientRect()
        : { top: 0, left: 0 };
      const width = popover.getBoundingClientRect().width;
      const height = popover.getBoundingClientRect().height;
      popover.style.left = `${Math.max(8, Math.min(offset.left + rect.left, window.innerWidth - width - 8))}px`;
      popover.style.top = `${Math.max(8, Math.min(offset.top + rect.bottom + 6, window.innerHeight - height - 8))}px`;
    }

    function explain() {
      if (!popover || editor.isHidden() || !editor.hasFocus()) {
        hide();
        return;
      }
      const selection = editor.getDoc().getSelection();
      if (!selection || !selection.rangeCount) {
        hide();
        return;
      }
      const snapshot = selectionSnapshot(selection);
      if (sameSelection(snapshot, dismissed)) {
        hide();
        return;
      }
      dismissed = null;
      const heading = selectedHeading(
        selection.getRangeAt(0),
        Array.from(invalid.keys()),
      );
      if (!heading) {
        hide();
        return;
      }
      activeHeading = heading;
      const warning = invalid.get(heading);
      const text = messages[warning.type]
        .replace("{level}", warning.level)
        .replace("{expected}", warning.expected);
      popover.textContent = text;
      popover.hidden = false;
      // Popover is Newly Available; fixed positioning remains the fallback.
      if (
        typeof popover.showPopover === "function" &&
        !popover.matches(":popover-open")
      ) {
        popover.showPopover();
      }
      if (status.textContent !== text) status.textContent = text;
      position();
    }

    function check() {
      frame = null;
      if (disposed || !editor.getBody()) return;
      const headings = Array.from(editor.getBody().querySelectorAll(selector));
      const results = warnings(
        headings.map((heading) => Number(heading.tagName.slice(1))),
        parentLevel(editor, context),
      );
      invalid = new Map();
      // TinyMCE's serializer excludes this attribute from content and undo
      // snapshots; ignore prevents our decorations from creating undo levels.
      editor.undoManager.ignore(() => {
        // FormatBlock copies attributes when a heading becomes a paragraph.
        editor
          .getBody()
          .querySelectorAll(`[${attribute}]`)
          .forEach((element) => {
            if (!element.matches(selector)) element.removeAttribute(attribute);
          });
        headings.forEach((heading, i) => {
          if (results[i]) {
            invalid.set(heading, results[i]);
            // TinyMCE 4's undo sanitizer only strips nonempty temp attributes.
            heading.setAttribute(attribute, "true");
          } else {
            heading.removeAttribute(attribute);
          }
        });
      });
      explain();
    }

    function schedule() {
      if (!disposed && frame === null)
        frame = window.requestAnimationFrame(check);
    }

    function escape(event) {
      if (event.key !== "Escape" && event.keyCode !== 27) return;
      if (!popover || popover.hidden) return;
      dismissed = selectionSnapshot(editor.getDoc().getSelection());
      hide();
      event.preventDefault();
      event.stopPropagation();
    }

    function init() {
      editor.serializer.addTempAttr(attribute);
      if (context.stylesheet) editor.dom.loadCSS(context.stylesheet);
      popover = document.createElement("div");
      popover.className = "mee-heading-popover";
      popover.setAttribute("role", "tooltip");
      popover.setAttribute("popover", "manual");
      popover.hidden = true;
      status = document.createElement("div");
      status.className = "mee-heading-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.setAttribute("aria-atomic", "true");
      document.body.append(popover, status);
      document.addEventListener("input", schedule);
      document.addEventListener("change", schedule);
      document.addEventListener("scroll", position, true);
      window.addEventListener("resize", position);
      editor.getDoc().addEventListener("selectionchange", schedule);
      editor.getDoc().addEventListener("scroll", position, true);
      editor.getDoc().addEventListener("keydown", escape, true);
      observer = new ResizeObserver(position);
      observer.observe(editor.getContainer());
      editor.on(
        "input change SetContent Undo Redo NodeChange SelectionChange focus",
        schedule,
      );
      editor.on("blur hide", hide);
      check();
    }

    editor.on("remove", () => {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.removeEventListener("input", schedule);
      document.removeEventListener("change", schedule);
      document.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      const editorDocument = editor.getDoc();
      if (editorDocument) {
        editorDocument.removeEventListener("selectionchange", schedule);
        editorDocument.removeEventListener("scroll", position, true);
        editorDocument.removeEventListener("keydown", escape, true);
      }
      if (observer) observer.disconnect();
      if (popover) popover.remove();
      if (status) status.remove();
    });
    if (editor.initialized) init();
    else editor.on("init", init);
  }

  root.tinymce.PluginManager.add("municipio_editor_extensions", attach);
  root.tinymce.on("AddEditor", (event) => attach(event.editor));
  root.tinymce.editors.forEach(attach);
})(typeof window === "undefined" ? null : window);
