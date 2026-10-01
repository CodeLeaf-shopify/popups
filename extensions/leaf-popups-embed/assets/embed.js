(function () {
  var STORAGE_KEY = "leaf_popups_state";
  var ASSIGNMENT_KEY = "leaf_popups_tests";
  var boot = null;
  var running = false;

  function emptyState() {
    return { popups: {}, codes: {} };
  }

  function readLocal() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
      if (!parsed || typeof parsed !== "object") return emptyState();
      parsed.popups = parsed.popups || {};
      parsed.codes = parsed.codes || {};
      return parsed;
    } catch (error) {
      return emptyState();
    }
  }

  function writeLocal(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function mergedState() {
    var local = readLocal();
    var remote = boot.customerState;
    if (!remote || typeof remote !== "object") return local;
    return {
      popups: Object.assign({}, local.popups, remote.popups || {}),
      codes: Object.assign({}, local.codes, remote.codes || {}),
      consent: remote.consent || local.consent,
    };
  }

  function device() {
    return window.matchMedia("(max-width: 749px)").matches ? "mobile" : "desktop";
  }

  function list(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function settings() {
    var value = (boot.manifest && boot.manifest.settings) || {};
    return {
      conflictMode: value.conflictMode === "all" || value.conflictMode === "single" ? value.conflictMode : "queue",
      paused: value.paused === true,
      exclude: list(value.exclude),
      hideForSubscribed: value.hideForSubscribed === true,
      hideForLoggedIn: value.hideForLoggedIn === true,
    };
  }

  function subscribed(state) {
    if (boot.acceptsMarketing || state.consent) return true;
    var popups = state.popups || {};
    return Object.keys(popups).some(function (id) { return Boolean(popups[id] && popups[id].submittedAt); });
  }

  function eligible(campaign, state) {
    var targeting = campaign.targeting || {};
    if (boot.loggedIn && targeting.hideForLoggedIn) return false;
    if (list(targeting.devices).indexOf(device()) === -1) return false;
    var path = boot.path || window.location.pathname;
    var excluded = list(targeting.exclude).some(function (prefix) { return path.indexOf(prefix) === 0; });
    if (excluded) return false;
    var included = list(targeting.include);
    if (included.length && !included.some(function (prefix) { return path.indexOf(prefix) === 0; })) return false;
    var templates = list(targeting.templates);
    if (templates.length && templates.indexOf(boot.template) === -1) return false;
    var now = Date.now();
    var schedule = campaign.schedule || {};
    if (schedule.start && Date.parse(schedule.start) > now) return false;
    if (schedule.end && Date.parse(schedule.end) < now) return false;
    return !suppressed(campaign, state);
  }

  function latestStamp(record) {
    if (!record) return 0;
    return Math.max(Date.parse(record.lastShown || "") || 0, Date.parse(record.dismissedAt || "") || 0, Date.parse(record.submittedAt || "") || 0);
  }

  function suppressed(campaign, state) {
    var frequency = campaign.frequency || { type: "always" };
    if (frequency.type === "always") return false;
    var stamp = latestStamp(state.popups && state.popups[campaign.id]);
    if (!stamp) return false;
    if (frequency.type === "once") return true;
    if (frequency.type === "days") return Date.now() - stamp < frequency.days * 86400000;
    return false;
  }

  function loadRenderer() {
    if (window.LeafPopups) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = boot.renderer;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Leaf Popups renderer failed to load.")); };
      document.head.appendChild(script);
    });
  }

  function host() {
    var element = document.createElement("div");
    element.setAttribute("data-leaf-popups-root", "");
    element.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;";
    document.body.appendChild(element);
    return element;
  }

  function remember(id, eventName) {
    if (eventName === "shown" || eventName === "dismissed") {
      var state = readLocal();
      var now = new Date().toISOString();
      var patch = eventName === "dismissed" ? { dismissedAt: now } : { lastShown: now };
      state.popups[id] = Object.assign({}, state.popups[id], patch);
      writeLocal(state);
    }
    fetch(boot.proxy + "/event", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ popupId: id, event: eventName }),
      keepalive: true,
    }).catch(function () {});
  }

  function showPayload(payload, campaign, onClosed) {
    var element = host();
    var api = window.LeafPopups.mount(element, payload, {
      mode: "interact",
      onDismiss: function () {
        if (campaign) remember(campaign.id, "dismissed");
        api.destroy();
        element.remove();
        if (onClosed) onClosed();
      },
      onClick: function () {
        if (campaign) remember(campaign.id, "clicked");
      },
      onSubmit: function (detail) {
        return fetch(boot.proxy + "/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            popupId: campaign ? campaign.id : payload.popupId,
            email: detail.email,
            consent: detail.consent,
            claim: detail.claim,
          }),
        }).then(function (response) {
          return response.text().then(function (text) {
            var result = null;
            try {
              result = text ? JSON.parse(text) : null;
            } catch (error) {
              result = null;
            }
            if (!result || typeof result !== "object") {
              return { ok: false, error: response.ok ? "Unexpected response. Please try again." : "We couldn't save that (" + response.status + "). Please try again." };
            }
            if (!response.ok && result.ok !== false) result.ok = false;
            if (!result.ok && !result.error) result.error = "We couldn't save that. Please try again.";
            return result;
          });
        }).then(function (result) {
          if (result.ok && result.state) writeLocal(result.state);
          return result;
        }).catch(function () {
          return { ok: false, error: "Network error. Check your connection and try again." };
        });
      },
    });
    if (campaign) remember(campaign.id, "shown");
    return api;
  }

  function whenReady(campaign) {
    var trigger = campaign.trigger || { type: "immediate" };
    return new Promise(function (resolve) {
      if (trigger.type === "delay") {
        window.setTimeout(resolve, Math.max(0, Number(trigger.seconds) || 0) * 1000);
        return;
      }
      if (trigger.type === "scroll") {
        var onScroll = function () {
          var height = document.documentElement.scrollHeight - window.innerHeight;
          var percent = height <= 0 ? 100 : (window.scrollY / height) * 100;
          if (percent >= Number(trigger.percent || 0)) {
            window.removeEventListener("scroll", onScroll);
            resolve();
          }
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return;
      }
      if (trigger.type === "exit") {
        var onOut = function (event) {
          if (event.clientY <= 0) {
            document.documentElement.removeEventListener("mouseout", onOut);
            resolve();
          }
        };
        document.documentElement.addEventListener("mouseout", onOut);
        return;
      }
      resolve();
    });
  }

  var NEXT_POPUP_DELAY_MS = 800;
  var slots = {};

  function slotKey(campaign, payload) {
    var doc = payload && payload.document ? payload.document : {};
    var kind = doc.kind || campaign.kind;
    if (kind !== "bar") return "modal";
    return (doc.position || campaign.position) === "bottom" ? "bar-bottom" : "bar-top";
  }

  function enqueue(campaign, payload) {
    if (settings().conflictMode === "all") {
      showPayload(payload, campaign);
      return;
    }
    var key = slotKey(campaign, payload);
    var slot = slots[key] || (slots[key] = { active: false, ready: [] });
    slot.ready.push({ campaign: campaign, payload: payload });
    slot.ready.sort(function (left, right) { return (right.campaign.priority || 0) - (left.campaign.priority || 0); });
    if (!slot.active) showNext(key);
  }

  function showNext(key) {
    var slot = slots[key];
    if (!slot || slot.active || !slot.ready.length) return;
    var next = slot.ready.shift();
    slot.active = true;
    if (typeof console !== "undefined") console.info("[Leaf Popups] showing", next.campaign.id, key);
    showPayload(next.payload, next.campaign, function () {
      slot.active = false;
      window.setTimeout(function () { showNext(key); }, NEXT_POPUP_DELAY_MS);
    });
  }

  function armCampaign(campaign) {
    whenReady(campaign).then(function () {
      return fetch(campaign.url, { credentials: "omit" });
    }).then(function (response) {
      if (!response.ok) throw new Error("Popup file request failed.");
      return response.json();
    }).then(function (payload) {
      enqueue(campaign, payload);
    }).catch(function (error) {
      if (typeof console !== "undefined") console.warn("[Leaf Popups]", campaign.id, error);
    });
  }

  function preview(token) {
    loadRenderer().then(function () {
      return fetch(boot.proxy + "/draft?token=" + encodeURIComponent(token), {
        headers: { Accept: "application/json" },
      });
    }).then(function (response) {
      if (!response.ok) throw new Error("Draft preview request failed (" + response.status + ").");
      return response.json();
    }).then(function (payload) {
      if (!payload || !payload.document) throw new Error("Draft preview returned no document.");
      showPayload(payload, null);
    }).catch(function (error) {
      if (typeof console !== "undefined") console.warn("[Leaf Popups]", error);
    });
  }

  function normalizeManifest(value) {
    if (!value) return null;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (error) {
        return null;
      }
    }
    if (typeof value !== "object") return null;
    if (!Array.isArray(value.campaigns)) value.campaigns = [];
    return value;
  }

  function readAssignments() {
    try {
      var parsed = JSON.parse(localStorage.getItem(ASSIGNMENT_KEY) || "");
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch (error) {
      return {};
    }
  }

  function writeAssignments(assignments) {
    try {
      localStorage.setItem(ASSIGNMENT_KEY, JSON.stringify(assignments));
    } catch (error) {
      return;
    }
  }

  function splitTests(campaigns) {
    var assignments = readAssignments();
    var groups = {};
    var rest = [];
    var dirty = false;
    campaigns.forEach(function (campaign) {
      if (!campaign.testId || (campaign.variant !== "a" && campaign.variant !== "b")) {
        rest.push(campaign);
        return;
      }
      if (!groups[campaign.testId]) groups[campaign.testId] = [];
      groups[campaign.testId].push(campaign);
    });
    Object.keys(groups).forEach(function (testId) {
      var group = groups[testId];
      var variants = {};
      group.forEach(function (campaign) { variants[campaign.variant] = campaign; });
      if (!variants.a || !variants.b) {
        group.forEach(function (campaign) { rest.push(campaign); });
        return;
      }
      var chosen = assignments[testId];
      if (chosen !== "a" && chosen !== "b") {
        chosen = Math.random() < 0.5 ? "a" : "b";
        assignments[testId] = chosen;
        dirty = true;
      }
      rest.push(variants[chosen]);
    });
    if (dirty) writeAssignments(assignments);
    return rest;
  }

  function loadManifest() {
    var local = normalizeManifest(boot.manifest);
    if (local && local.campaigns.length) return Promise.resolve(local);
    return fetch(boot.proxy + "/manifest", { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("Manifest proxy failed (" + response.status + ").");
        return response.json();
      })
      .then(function (remote) {
        var normalized = normalizeManifest(remote);
        if (!normalized) throw new Error("Manifest proxy returned an invalid payload.");
        return normalized;
      });
  }

  function start() {
    var bootEl = document.getElementById("leaf-popups-boot");
    if (!bootEl || !bootEl.textContent || running) return;
    if (bootEl.getAttribute("data-leaf-started") === "1") return;
    try {
      boot = JSON.parse(bootEl.textContent);
    } catch (error) {
      if (typeof console !== "undefined") console.warn("[Leaf Popups] Invalid boot payload.", error);
      return;
    }
    bootEl.setAttribute("data-leaf-started", "1");
    running = true;

    var params = new URLSearchParams(window.location.search);
    var token = params.get("leaf_preview");
    if (token) {
      preview(token);
      return;
    }

    loadManifest()
      .then(function (manifest) {
        boot.manifest = manifest;
        var shop = settings();
        if (shop.paused) {
          running = false;
          if (typeof console !== "undefined") console.info("[Leaf Popups] Popups are paused in Settings.");
          return null;
        }
        var campaigns = splitTests(manifest.campaigns);
        var state = mergedState();
        var path = boot.path || window.location.pathname;
        var blocked =
          (shop.hideForLoggedIn && boot.loggedIn) ||
          (shop.hideForSubscribed && subscribed(state)) ||
          shop.exclude.some(function (prefix) { return path.indexOf(prefix) === 0; });
        var matched = blocked ? [] : campaigns.filter(function (campaign) { return eligible(campaign, state); });
        matched.sort(function (left, right) { return (right.priority || 0) - (left.priority || 0); });
        if (!matched.length) {
          running = false;
          if (typeof console !== "undefined") {
            console.info("[Leaf Popups] No eligible campaigns.", {
              total: campaigns.length,
              blockedBySettings: Boolean(blocked),
              path: boot.path,
              template: boot.template,
              device: device(),
            });
          }
          return null;
        }
        if (shop.conflictMode === "single") matched = matched.slice(0, 1);
        return loadRenderer().then(function () {
          matched.forEach(armCampaign);
        });
      })
      .catch(function (error) {
        running = false;
        if (typeof console !== "undefined") console.warn("[Leaf Popups]", error);
      });
  }

  function arm() {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  arm();
  document.addEventListener("shopify:section:load", start);
  if (typeof MutationObserver === "function") {
    var observer = new MutationObserver(function () {
      var bootEl = document.getElementById("leaf-popups-boot");
      if (bootEl && bootEl.getAttribute("data-leaf-started") !== "1") start();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
