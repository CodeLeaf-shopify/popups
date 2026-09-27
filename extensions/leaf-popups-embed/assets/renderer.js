/* Shared popup renderer. The admin preview iframe and the theme app embed both load this file. */
(function () {
  var CONTAINMENT = {
    stack: ["stack", "columns", "text", "image", "button", "spacer", "divider", "form", "coupon", "countdown", "close"],
    columns: ["stack"],
    form: ["field", "button", "text"],
    text: [],
    image: [],
    button: [],
    spacer: [],
    divider: [],
    field: [],
    coupon: [],
    countdown: [],
    close: [],
  };

  function canContain(parent, child, goal) {
    if (child === "coupon" && goal !== "discount") return false;
    return (CONTAINMENT[parent] || []).indexOf(child) !== -1;
  }

  function findNode(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    var children = node.children || [];
    for (var i = 0; i < children.length; i += 1) {
      var found = findNode(children[i], id);
      if (found) return found;
    }
    return null;
  }

  function containsNode(node, id) {
    if (!node || node.id === id) return node && node.id === id;
    var children = node.children || [];
    for (var i = 0; i < children.length; i += 1) {
      if (containsNode(children[i], id)) return true;
    }
    return false;
  }

  function safeUrl(value) {
    if (typeof value !== "string" || !value) return "";
    if (value.indexOf("/") === 0) return value;
    try {
      var url = new URL(value, window.location.origin);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function align(value) {
    if (value === "center") return "center";
    if (value === "start") return "flex-start";
    return "stretch";
  }

  function patchCode(node, code) {
    if (!node) return node;
    var next = {
      id: node.id,
      type: node.type,
      props: node.props,
      style: node.style,
    };
    if (node.type === "coupon") next.props = Object.assign({}, node.props, { code: code });
    if (node.children) next.children = node.children.map(function (child) { return patchCode(child, code); });
    return next;
  }

  function mount(host, payload, options) {
    var shadow = host.attachShadow({ mode: "closed" });
    var current = payload;
    var settings = options || {};
    var statusMessage = "";
    var dragId = null;
    var moved = false;
    var startX = 0;
    var startY = 0;

    function goal() {
      return current && current.behavior ? current.behavior.goal : "none";
    }

    function render() {
      shadow.replaceChildren();
      var style = document.createElement("style");
      style.textContent = [
        ":host { all: initial; }",
        "* { box-sizing: border-box; }",
        ".overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2147483646; }",
        ".bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646; }",
        ".panel { position: relative; max-width: calc(100% - 32px); }",
        ".node { position: relative; }",
        ".node.selected { outline: 2px solid #2c6ecb; outline-offset: 2px; }",
        ".node.drop { outline: 2px dashed #2c6ecb; }",
        ".handle { position: absolute; top: 4px; left: 4px; z-index: 2; border: 0; border-radius: 4px; padding: 2px 6px; cursor: grab; background: #2c6ecb; color: #fff; font: 11px/1 sans-serif; }",
        ".edit .content { pointer-events: none; }",
        "button, input { font: inherit; }",
        ".field { display: flex; flex-direction: column; gap: 6px; }",
        ".message { margin: 0; font-size: 14px; }",
      ].join("\n");
      shadow.appendChild(style);

      if (!current || !current.document || !current.document.root) {
        var empty = document.createElement("p");
        empty.textContent = "This popup cannot be previewed.";
        shadow.appendChild(empty);
        return;
      }

      var tokens = current.document.tokens;
      var kind = current.document.kind;
      var shell = document.createElement("div");
      shell.className = kind === "bar" ? "bar" : "overlay";
      if (kind !== "bar") shell.style.background = tokens.overlay;
      var panel = document.createElement("div");
      panel.className = "panel" + (settings.mode === "edit" ? " edit" : "");
      panel.style.width = kind === "bar" ? "100%" : tokens.width + "px";
      panel.style.background = tokens.background;
      panel.style.color = tokens.text;
      panel.style.fontFamily = tokens.font;
      panel.style.borderRadius = kind === "bar" ? "0" : tokens.radius + "px";
      panel.dataset.leafId = current.document.root.id;
      shell.appendChild(panel);
      shadow.appendChild(shell);
      renderNode(current.document.root, panel, true);

      if (kind !== "bar" && settings.mode === "interact") {
        shell.addEventListener("click", function (event) {
          if (event.target === shell) closePopup();
        });
      }
      if (settings.mode === "edit") {
        shell.addEventListener("click", function (event) {
          if (event.target === shell && settings.onSelect) settings.onSelect(null);
        });
      }
    }

    function renderNode(node, parent, isRoot) {
      var el = isRoot ? parent : document.createElement("div");
      if (!isRoot) {
        el.className = "node" + (settings.selectedId === node.id ? " selected" : "");
        el.dataset.leafId = node.id;
        el.dataset.leafType = node.type;
        parent.appendChild(el);
      } else if (settings.selectedId === node.id && settings.mode === "edit") {
        el.classList.add("selected");
      }

      if (settings.mode === "edit" && !isRoot) {
        var handle = document.createElement("button");
        handle.type = "button";
        handle.className = "handle";
        handle.textContent = "Move";
        handle.dataset.drag = "true";
        handle.addEventListener("pointerdown", onPointerDown);
        el.appendChild(handle);
      }

      var content = document.createElement("div");
      content.className = "content";
      el.appendChild(content);
      paint(node, content);

      if (settings.mode === "edit") {
        el.addEventListener("click", function (event) {
          event.stopPropagation();
          if (settings.onSelect) settings.onSelect(node.id);
        });
      }
      return el;
    }

    function paint(node, content) {
      var tokens = current.document.tokens;
      var style = node.style || {};
      var props = node.props || {};
      if (node.type === "stack" || node.type === "form" || node.type === "columns") {
        content.style.display = node.type === "columns" ? "grid" : "flex";
        if (node.type === "columns") {
          var count = (node.children || []).length || 1;
          content.style.gridTemplateColumns = "repeat(" + count + ", minmax(0, 1fr))";
          content.style.gap = (style.gap || 12) + "px";
        } else {
          content.style.flexDirection = style.direction === "row" ? "row" : "column";
          content.style.gap = (style.gap ?? 12) + "px";
          content.style.alignItems = align(style.align);
          content.style.padding = (style.padding || 0) + "px";
        }
        if (node.type === "form" && props.consentLabel) content.dataset.consent = String(props.consentLabel);
        (node.children || []).forEach(function (child) { renderNode(child, content, false); });
        if (node.type === "form") bindForm(content);
        return;
      }

      if (node.type === "text") {
        var text = document.createElement(props.variant === "heading" ? "h2" : "p");
        text.textContent = String(props.content || "");
        text.style.margin = "0";
        text.style.font = "inherit";
        text.style.fontSize = props.variant === "heading" ? "28px" : "16px";
        text.style.fontWeight = props.variant === "heading" ? "700" : "400";
        text.style.lineHeight = props.variant === "heading" ? "1.2" : "1.5";
        content.appendChild(text);
        return;
      }

      if (node.type === "image") {
        var src = safeUrl(String(props.src || ""));
        if (!src) {
          var placeholder = document.createElement("div");
          placeholder.textContent = "Image";
          placeholder.style.padding = "24px";
          placeholder.style.textAlign = "center";
          placeholder.style.background = "rgba(0,0,0,0.06)";
          content.appendChild(placeholder);
          return;
        }
        var image = document.createElement("img");
        image.src = src;
        image.alt = String(props.alt || "");
        image.style.maxWidth = "100%";
        image.style.height = "auto";
        image.style.display = "block";
        content.appendChild(image);
        return;
      }

      if (node.type === "button") {
        var button = document.createElement("button");
        button.type = node.parentId ? "submit" : "button";
        button.textContent = String(props.label || "Button");
        button.style.background = tokens.accent;
        button.style.color = tokens.background;
        button.style.border = "0";
        button.style.borderRadius = Math.max(0, tokens.radius - 4) + "px";
        button.style.padding = "12px 16px";
        button.style.cursor = "pointer";
        var href = safeUrl(String(props.href || ""));
        if (href && settings.mode === "interact") {
          button.type = "button";
          button.addEventListener("click", function () { window.location.href = href; });
        }
        content.appendChild(button);
        return;
      }

      if (node.type === "field") {
        var wrap = document.createElement("label");
        wrap.className = "field";
        var label = document.createElement("span");
        label.textContent = String(props.label || "Email");
        var input = document.createElement("input");
        input.type = "email";
        input.name = String(props.name || "email");
        input.placeholder = String(props.placeholder || "");
        input.required = true;
        input.style.width = "100%";
        input.style.border = "1px solid rgba(0,0,0,0.15)";
        input.style.borderRadius = "8px";
        input.style.padding = "10px 12px";
        input.style.color = tokens.text;
        input.style.background = "#fff";
        if (settings.mode === "edit") input.disabled = true;
        wrap.appendChild(label);
        wrap.appendChild(input);
        content.appendChild(wrap);
        return;
      }

      if (node.type === "coupon") {
        var coupon = document.createElement("div");
        coupon.style.border = "1px dashed currentColor";
        coupon.style.borderRadius = "8px";
        coupon.style.padding = "12px";
        coupon.style.textAlign = "center";
        var couponLabel = document.createElement("div");
        couponLabel.textContent = String(props.label || "Your code");
        couponLabel.style.fontSize = "13px";
        var code = document.createElement("div");
        var value = String(props.code || "");
        code.textContent = value || "CODE";
        code.style.fontSize = "22px";
        code.style.fontWeight = "700";
        code.style.letterSpacing = "0.08em";
        coupon.appendChild(couponLabel);
        coupon.appendChild(code);
        content.appendChild(coupon);
        if (!value && current.behavior && current.behavior.discount && current.behavior.discount.mode === "unique" && settings.mode === "interact") {
          var reveal = document.createElement("button");
          reveal.type = "button";
          reveal.textContent = "Reveal code";
          reveal.style.marginTop = "8px";
          reveal.addEventListener("click", function () { submitForm(null, false, true); });
          content.appendChild(reveal);
        }
        return;
      }

      if (node.type === "countdown") {
        var timer = document.createElement("div");
        timer.style.fontVariantNumeric = "tabular-nums";
        timer.style.fontWeight = "700";
        var ends = Date.parse(String(props.endsAt || ""));
        var tick = function () {
          if (!Number.isFinite(ends)) {
            timer.textContent = "Countdown";
            return;
          }
          var remaining = Math.max(0, ends - Date.now());
          var hours = Math.floor(remaining / 3600000);
          var minutes = Math.floor((remaining % 3600000) / 60000);
          var seconds = Math.floor((remaining % 60000) / 1000);
          timer.textContent = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
        };
        tick();
        if (settings.mode === "interact" && Number.isFinite(ends)) {
          var interval = window.setInterval(tick, 1000);
          shadow.addEventListener("leaf-destroy", function () { window.clearInterval(interval); }, { once: true });
        }
        content.appendChild(timer);
        return;
      }

      if (node.type === "spacer") {
        content.style.height = (style.size || 16) + "px";
        return;
      }

      if (node.type === "divider") {
        var rule = document.createElement("hr");
        rule.style.border = "0";
        rule.style.borderTop = "1px solid currentColor";
        rule.style.opacity = "0.2";
        rule.style.width = "100%";
        content.appendChild(rule);
        return;
      }

      if (node.type === "close") {
        if (content.parentElement) {
          content.parentElement.style.position = "absolute";
          content.parentElement.style.top = "8px";
          content.parentElement.style.right = "8px";
          content.parentElement.style.zIndex = "3";
        }
        var close = document.createElement("button");
        close.type = "button";
        close.textContent = "×";
        close.setAttribute("aria-label", "Close");
        close.style.position = "absolute";
        close.style.top = "8px";
        close.style.right = "8px";
        close.style.border = "0";
        close.style.background = "transparent";
        close.style.color = "inherit";
        close.style.fontSize = "22px";
        close.style.cursor = "pointer";
        if (settings.mode === "interact") close.addEventListener("click", closePopup);
        content.appendChild(close);
      }
    }

    function bindForm(content) {
      if (settings.mode !== "interact") return;
      var button = content.querySelector("button");
      if (button) button.type = "button";
      if (!button) return;
      button.addEventListener("click", function (event) {
        event.preventDefault();
        var input = content.querySelector("input[type=email]");
        if (input && !input.value) {
          input.reportValidity();
          return;
        }
        var consent = content.dataset.consent;
        if (consent) {
          var box = content.querySelector("[data-consent-box]");
          if (!box) {
            ensureConsent(content, consent);
            return;
          }
          if (!box.checked) return;
        }
        submitForm(input ? input.value : "", Boolean(consent), false);
      });
    }

    function ensureConsent(content, label) {
      var existing = content.querySelector("[data-consent-box]");
      if (existing) return existing.checked;
      var row = document.createElement("label");
      row.className = "field";
      var box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.consentBox = "true";
      var text = document.createElement("span");
      text.textContent = label;
      row.appendChild(box);
      row.appendChild(text);
      content.insertBefore(row, content.querySelector("button"));
      return false;
    }

    function submitForm(email, consent, claim) {
      if (!settings.onSubmit) return;
      Promise.resolve(settings.onSubmit({ email: email, consent: consent, claim: claim })).then(function (result) {
        statusMessage = result && result.message ? result.message : result && result.ok ? "Done." : "Something went wrong.";
        if (result && result.code && current.document) {
          current = {
            schemaVersion: current.schemaVersion,
            document: Object.assign({}, current.document, { root: patchCode(current.document.root, result.code) }),
            behavior: current.behavior,
          };
        }
        render();
        var message = document.createElement("p");
        message.className = "message";
        message.textContent = statusMessage;
        var panel = shadow.querySelector(".panel");
        if (panel) panel.appendChild(message);
      }).catch(function () {
        statusMessage = "Something went wrong.";
        render();
      });
    }

    function closePopup() {
      shadow.replaceChildren();
      if (settings.onDismiss) settings.onDismiss();
    }

    function onPointerDown(event) {
      var handle = event.currentTarget;
      var wrapper = handle.closest("[data-leaf-id]");
      if (!wrapper) return;
      dragId = wrapper.dataset.leafId;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      event.preventDefault();
      event.stopPropagation();
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }

    function onPointerMove(event) {
      if (!dragId) return;
      if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > 4) moved = true;
      clearDrop();
      var drop = resolveDrop(event.clientX, event.clientY);
      if (drop) {
        var target = shadow.querySelector('[data-leaf-id="' + drop.parentId + '"]');
        if (target) target.classList.add("drop");
      }
    }

    function onPointerUp(event) {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      var drop = moved ? resolveDrop(event.clientX, event.clientY) : null;
      clearDrop();
      if (drop && settings.onCommand && dragId) {
        settings.onCommand({ type: "move", nodeId: dragId, parentId: drop.parentId, index: drop.index });
      }
      dragId = null;
    }

    function clearDrop() {
      shadow.querySelectorAll(".drop").forEach(function (element) { element.classList.remove("drop"); });
    }

    function resolveDrop(x, y) {
      if (!dragId || !current.document) return null;
      var dragged = findNode(current.document.root, dragId);
      if (!dragged) return null;
      var stack = shadow.elementsFromPoint(x, y);
      for (var i = 0; i < stack.length; i += 1) {
        var match = stack[i].closest ? stack[i].closest("[data-leaf-id]") : null;
        if (!match || match.dataset.leafId === dragId) continue;
        var targetId = match.dataset.leafId;
        if (containsNode(dragged, targetId)) continue;
        var target = findNode(current.document.root, targetId);
        if (!target) continue;
        if (canContain(target.type, dragged.type, goal())) {
          return { parentId: target.id, index: childIndex(match, y, dragId) };
        }
        var parentEl = match.parentElement ? match.parentElement.closest("[data-leaf-id]") : null;
        if (!parentEl) continue;
        var parentNode = findNode(current.document.root, parentEl.dataset.leafId);
        if (!parentNode || !canContain(parentNode.type, dragged.type, goal())) continue;
        return { parentId: parentNode.id, index: siblingIndex(parentEl, match, y, dragId) };
      }
      return null;
    }

    function directNodes(parentEl, ignoreId) {
      return Array.prototype.filter.call(parentEl.children, function (child) {
        return child.dataset && child.dataset.leafId && child.dataset.leafId !== ignoreId;
      });
    }

    function childIndex(parentEl, y, ignoreId) {
      var content = parentEl.querySelector(":scope > .content") || parentEl;
      var children = directNodes(content, ignoreId);
      for (var i = 0; i < children.length; i += 1) {
        var rect = children[i].getBoundingClientRect();
        if (y < rect.top + rect.height / 2) return i;
      }
      return children.length;
    }

    function siblingIndex(parentEl, sibling, y, ignoreId) {
      var content = parentEl.querySelector(":scope > .content") || parentEl;
      var children = directNodes(content, ignoreId);
      var index = children.indexOf(sibling);
      if (index < 0) return children.length;
      var rect = sibling.getBoundingClientRect();
      return y > rect.top + rect.height / 2 ? index + 1 : index;
    }

    render();

    return {
      update: function (nextPayload, nextOptions) {
        current = nextPayload;
        settings = nextOptions || settings;
        render();
        if (statusMessage) {
          var message = document.createElement("p");
          message.className = "message";
          message.textContent = statusMessage;
          var panel = shadow.querySelector(".panel");
          if (panel) panel.appendChild(message);
        }
      },
      destroy: function () {
        shadow.dispatchEvent(new Event("leaf-destroy"));
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        shadow.replaceChildren();
      },
    };
  }

  window.LeafPopups = { mount: mount };
})();
