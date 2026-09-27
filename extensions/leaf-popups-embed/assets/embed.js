(function () {
  var STORAGE_KEY = "leaf_popups_state";
  var boot = null;

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

  function eligible(campaign, state) {
    var targeting = campaign.targeting || {};
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
    document.body.appendChild(element);
    return element;
  }

  function remember(id, eventName) {
    var state = readLocal();
    var now = new Date().toISOString();
    var patch = eventName === "dismissed" ? { dismissedAt: now } : { lastShown: now };
    state.popups[id] = Object.assign({}, state.popups[id], patch);
    writeLocal(state);
    if (!boot.loggedIn) return;
    fetch(boot.proxy + "/event", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ popupId: id, event: eventName }),
    }).catch(function () {});
  }

  function showPayload(payload, campaign) {
    var element = host();
    var api = window.LeafPopups.mount(element, payload, {
      mode: "interact",
      onDismiss: function () {
        if (campaign) remember(campaign.id, "dismissed");
        api.destroy();
        element.remove();
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
        }).then(function (response) { return response.json(); }).then(function (result) {
          if (result.state) writeLocal(result.state);
          return result;
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

  function showCampaign(campaign) {
    whenReady(campaign).then(function () {
      return fetch(campaign.url, { credentials: "omit" });
    }).then(function (response) {
      if (!response.ok) throw new Error("Popup file request failed.");
      return response.json();
    }).then(function (payload) {
      showPayload(payload, campaign);
    }).catch(function () {});
  }

  function preview(token) {
    loadRenderer().then(function () {
      return fetch(boot.proxy + "/draft?token=" + encodeURIComponent(token), {
        headers: { Accept: "application/json" },
      });
    }).then(function (response) { return response.json(); }).then(function (payload) {
      if (!payload || !payload.document) return;
      payload.popupId = payload.popupId;
      showPayload(payload, null);
    }).catch(function () {});
  }

  function start() {
    var bootEl = document.getElementById("leaf-popups-boot");
    if (!bootEl || !bootEl.textContent) return;
    try {
      boot = JSON.parse(bootEl.textContent);
    } catch (error) {
      return;
    }
    var params = new URLSearchParams(window.location.search);
    var token = params.get("leaf_preview");
    if (token) {
      preview(token);
      return;
    }
    var manifest = boot.manifest;
    var campaigns = manifest && Array.isArray(manifest.campaigns) ? manifest.campaigns : [];
    var state = mergedState();
    var matched = campaigns.filter(function (campaign) { return eligible(campaign, state); });
    matched.sort(function (left, right) { return (right.priority || 0) - (left.priority || 0); });
    var modal = matched.find(function (campaign) { return campaign.kind === "modal"; });
    var bar = matched.find(function (campaign) { return campaign.kind === "bar"; });
    if (!modal && !bar) return;
    loadRenderer().then(function () {
      if (bar) showCampaign(bar);
      if (modal) showCampaign(modal);
    }).catch(function () {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
