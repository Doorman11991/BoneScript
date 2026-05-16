"use strict";
/**
 * BoneScript Admin Panel Emitter
 * Generates a self-contained HTML admin UI from an IRSystem.
 * No build step — single HTML file with Tailwind CDN + vanilla JS.
 *
 * Security note: the rendering layer uses textContent / setAttribute exclusively
 * for any value that might come from API responses. innerHTML is reserved for
 * static markup composed within this file. This prevents stored-XSS payloads
 * (e.g. a malicious record `name`) from executing when an admin views the panel.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitAdminPanel = void 0;
function toSnakeCase(s) {
    return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}
function toDashCase(s) {
    return toSnakeCase(s).replace(/_/g, "-");
}
function irTypeToDisplay(irType) {
    if (irType === "bool")
        return "boolean";
    if (irType === "timestamp")
        return "datetime";
    if (irType === "uuid")
        return "uuid";
    if (irType === "json")
        return "json";
    if (irType.startsWith("list<") || irType.startsWith("set<"))
        return "array";
    return "text";
}
/**
 * HTML-escape a string for safe interpolation into static markup we control.
 * Used for system.name in the title and similar trusted-but-defensive cases.
 */
function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function emitAdminPanel(system) {
    const apiModules = system.modules.filter(m => m.kind === "api_service" && m.models.length > 0);
    const entityConfigs = apiModules.map(mod => {
        const model = mod.models[0];
        const tableName = toSnakeCase(model.name) + "s";
        const capabilities = mod.interfaces.flatMap(i => i.methods)
            .filter(m => !["create", "read", "update", "delete", "list"].includes(m.name));
        const columns = model.fields.map(f => ({
            key: f.name,
            label: f.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            type: irTypeToDisplay(f.type),
            nullable: f.nullable,
        }));
        const formFields = model.fields
            .filter(f => !["id", "created_at", "updated_at"].includes(f.name))
            .map(f => ({
            key: f.name,
            label: f.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            type: irTypeToDisplay(f.type),
            nullable: f.nullable,
        }));
        return {
            name: model.name,
            tableName,
            apiPath: "/" + tableName,
            columns,
            formFields,
            capabilities: capabilities.map(c => ({
                name: c.name,
                label: c.name.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
                endpoint: "/" + tableName + "/" + toDashCase(c.name),
            })),
        };
    });
    const configJson = JSON.stringify(entityConfigs, null, 2);
    const titleEsc = escHtml(system.name);
    // Build static nav (entity names come from the IR, so they're trusted —
    // they were already validated by the parser/lexer).
    const navHtml = apiModules.map(mod => {
        const t = toSnakeCase(mod.models[0].name) + "s";
        const n = escHtml(mod.models[0].name);
        return '<button data-entity="' + t + '" id="nav-' + t + '" ' +
            'class="w-full text-left px-3 py-2 rounded text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors mb-1">' +
            n + '</button>';
    }).join("\n      ");
    // Embedded runtime JS. This is the security boundary for the admin panel.
    // - All API-derived values flow through el.textContent or setAttribute.
    // - innerHTML is only used for static structure (icons, fixed copy).
    // - Event handlers are bound via addEventListener, never inline onclick=.
    const embeddedJs = ADMIN_RUNTIME_JS.replace("__ENTITIES_JSON__", configJson);
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '<meta name="bonescript-api-url" content="http://localhost:3000" />',
        '<title>' + titleEsc + ' Admin</title>',
        '<script src="https://cdn.tailwindcss.com"><\/script>',
        '<style>.loading{opacity:.5;pointer-events:none}.toast{animation:fadeout 3s forwards}@keyframes fadeout{0%,70%{opacity:1}100%{opacity:0}}</style>',
        '</head>',
        '<body class="bg-gray-50 min-h-screen">',
        '<div class="flex h-screen overflow-hidden">',
        '<aside class="w-64 bg-gray-900 text-white flex flex-col">',
        '<div class="p-4 border-b border-gray-700"><h1 class="text-lg font-bold">' + titleEsc + '</h1><p class="text-xs text-gray-400 mt-1">Admin Panel</p></div>',
        '<nav class="flex-1 overflow-y-auto p-2" id="nav">' + navHtml + '</nav>',
        '<div class="p-4 border-t border-gray-700"><div class="text-xs text-gray-500"><div id="auth-status">Not authenticated</div>',
        '<input id="token-input" type="password" placeholder="Bearer token" class="mt-2 w-full bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600" /></div></div>',
        '</aside>',
        '<main class="flex-1 overflow-y-auto">',
        '<div class="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">',
        '<div><h2 class="text-xl font-semibold text-gray-800" id="page-title">Select an entity</h2><p class="text-sm text-gray-500" id="page-subtitle"></p></div>',
        '<div class="flex gap-2">',
        '<button id="create-btn" class="hidden bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">+ Create</button>',
        '<button id="refresh-btn" class="hidden bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-200">&#8635; Refresh</button>',
        '</div></div>',
        '<div id="toast-container" class="fixed top-4 right-4 z-50 flex flex-col gap-2"></div>',
        '<div class="p-6" id="content-area"><div class="text-center text-gray-400 mt-20"><div class="text-5xl mb-4">&#9889;</div><p class="text-lg">Select an entity from the sidebar</p><p class="text-sm mt-2">Generated by BoneScript compiler</p></div></div>',
        '</main></div>',
        '<div id="modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"><div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-screen overflow-y-auto"><div class="p-6"><div class="flex items-center justify-between mb-4"><h3 class="text-lg font-semibold" id="modal-title">Create</h3><button id="modal-close" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div><form id="modal-form" class="space-y-4"><div id="form-fields"></div><div class="flex gap-2 pt-2"><button type="submit" class="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Save</button><button type="button" id="modal-cancel" class="flex-1 bg-gray-100 text-gray-700 py-2 rounded hover:bg-gray-200">Cancel</button></div></form></div></div></div>',
        '<div id="cap-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"><div class="bg-white rounded-lg shadow-xl w-full max-w-md"><div class="p-6"><div class="flex items-center justify-between mb-4"><h3 class="text-lg font-semibold" id="cap-modal-title">Run Capability</h3><button id="cap-modal-close" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div><p class="text-sm text-gray-500 mb-4" id="cap-modal-desc"></p><div class="flex gap-2"><button id="cap-modal-confirm" class="flex-1 bg-orange-500 text-white py-2 rounded hover:bg-orange-600">Run</button><button id="cap-modal-cancel" class="flex-1 bg-gray-100 text-gray-700 py-2 rounded hover:bg-gray-200">Cancel</button></div></div></div></div>',
        '<script>' + embeddedJs + '<\/script>',
        '</body></html>',
    ].join("\n");
}
exports.emitAdminPanel = emitAdminPanel;
// ─── Embedded admin runtime ───────────────────────────────────────────────────
// This is plain JS that gets injected into the generated HTML. It is the
// exclusive renderer for entity rows, forms, and toasts. Every value that
// could come from the API uses textContent / setAttribute. innerHTML is only
// used to swap large structural blocks where the contents are also assembled
// via DOM nodes (never via string concatenation of API data).
const ADMIN_RUNTIME_JS = `
(function() {
  "use strict";
  var BASE_URL = (document.querySelector('meta[name="bonescript-api-url"]') || {}).content || "http://localhost:3000";
  var ENTITIES = __ENTITIES_JSON__;
  var currentEntity = null, currentPage = 1, editingId = null, pendingCapability = null;
  var authToken = localStorage.getItem("admin_token") || "";

  function $(id) { return document.getElementById(id); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "class") n.className = attrs[k];
        else if (k === "dataset") {
          for (var d in attrs[k]) n.dataset[d] = attrs[k][d];
        } else n.setAttribute(k, attrs[k]);
      }
    }
    if (text != null) n.textContent = String(text);
    return n;
  }

  if (authToken) {
    $("token-input").value = authToken;
    $("auth-status").textContent = "Token set";
  }
  function setToken(v) {
    authToken = v;
    localStorage.setItem("admin_token", v);
    $("auth-status").textContent = v ? "Token set" : "Not authenticated";
  }
  function headers() {
    var h = { "Content-Type": "application/json" };
    if (authToken) h["Authorization"] = "Bearer " + authToken;
    return h;
  }
  function toast(msg, type) {
    var t = el("div", { class: "toast px-4 py-2 rounded shadow text-sm text-white " + (type === "error" ? "bg-red-500" : "bg-green-500") }, msg);
    $("toast-container").appendChild(t);
    setTimeout(function() { t.remove(); }, 3500);
  }
  function showError(area, msg) {
    clear(area);
    area.appendChild(el("p", { class: "text-red-600" }, msg));
  }

  function loadEntity(t) {
    currentEntity = ENTITIES.find(function(e) { return e.tableName === t; });
    if (!currentEntity) return;
    currentPage = 1;
    var navs = document.querySelectorAll("[id^=nav-]");
    for (var i = 0; i < navs.length; i++) {
      navs[i].classList.remove("bg-gray-700", "text-white");
      navs[i].classList.add("text-gray-300");
    }
    var n = $("nav-" + t);
    if (n) {
      n.classList.add("bg-gray-700", "text-white");
      n.classList.remove("text-gray-300");
    }
    $("page-title").textContent = currentEntity.name;
    $("page-subtitle").textContent = currentEntity.apiPath;
    $("create-btn").classList.remove("hidden");
    $("refresh-btn").classList.remove("hidden");
    refreshTable();
  }

  function formatCell(val, type) {
    if (val === null || val === undefined) {
      return el("span", { class: "text-gray-300 italic" }, "null");
    }
    if (type === "boolean") {
      return el("span", { class: val ? "text-green-600" : "text-red-400" }, val ? "Yes" : "No");
    }
    if (type === "datetime") {
      return el("span", { class: "text-gray-600" }, new Date(val).toLocaleString());
    }
    if (type === "uuid") {
      return el("span", { class: "font-mono text-xs text-gray-500" }, String(val).slice(0, 8) + "...");
    }
    if (type === "json" || type === "array") {
      return el("span", { class: "font-mono text-xs text-gray-500" }, JSON.stringify(val).slice(0, 40));
    }
    return el("span", { class: "text-gray-800" }, String(val).slice(0, 60));
  }

  function buildCapabilityBar(caps) {
    var bar = el("div", { class: "flex gap-2" });
    for (var i = 0; i < caps.length; i++) {
      (function(cap) {
        var btn = el("button", { class: "text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded" }, cap.label);
        btn.addEventListener("click", function() { runCapability(cap.endpoint, cap.label); });
        bar.appendChild(btn);
      })(caps[i]);
    }
    return bar;
  }

  function buildRow(item, cols) {
    var tr = el("tr", { class: "hover:bg-gray-50" });
    for (var i = 0; i < cols.length; i++) {
      var td = el("td", { class: "px-4 py-3" });
      td.appendChild(formatCell(item[cols[i].key], cols[i].type));
      tr.appendChild(td);
    }
    var actions = el("td", { class: "px-4 py-3 text-right" });
    var editBtn = el("button", { class: "text-blue-600 hover:text-blue-800 text-xs mr-2" }, "Edit");
    editBtn.addEventListener("click", function() { openEditModal(item.id); });
    var delBtn = el("button", { class: "text-red-500 hover:text-red-700 text-xs" }, "Delete");
    delBtn.addEventListener("click", function() { deleteRecord(item.id); });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    tr.appendChild(actions);
    return tr;
  }

  function buildTable(items, cols, caps, total) {
    var card = el("div", { class: "bg-white rounded-lg shadow overflow-hidden" });
    var head = el("div", { class: "px-4 py-3 border-b flex items-center justify-between" });
    head.appendChild(el("span", { class: "text-sm text-gray-500" }, total + " total"));
    if (caps.length > 0) head.appendChild(buildCapabilityBar(caps));
    card.appendChild(head);

    var wrap = el("div", { class: "overflow-x-auto" });
    var table = el("table", { class: "w-full text-sm" });
    var thead = el("thead", { class: "bg-gray-50 border-b" });
    var headerRow = el("tr");
    for (var j = 0; j < cols.length; j++) {
      headerRow.appendChild(el("th", { class: "text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase" }, cols[j].label));
    }
    headerRow.appendChild(el("th", { class: "text-right px-4 py-3 text-xs" }, "Actions"));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    var tbody = el("tbody", { class: "divide-y divide-gray-100" });
    if (items.length === 0) {
      var emptyRow = el("tr");
      var emptyCell = el("td", { class: "px-4 py-8 text-center text-gray-400" }, "No records");
      emptyCell.setAttribute("colspan", String(cols.length + 1));
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    } else {
      for (var k = 0; k < items.length; k++) tbody.appendChild(buildRow(items[k], cols));
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
    return card;
  }

  async function refreshTable() {
    if (!currentEntity) return;
    var area = $("content-area");
    area.classList.add("loading");
    try {
      var res = await fetch(BASE_URL + currentEntity.apiPath + "?page=" + currentPage + "&page_size=50", { headers: headers() });
      var data = await res.json();
      if (!res.ok) {
        showError(area, (data.error && data.error.message) || "Error");
        return;
      }
      clear(area);
      area.appendChild(buildTable(data.items || [], currentEntity.columns, currentEntity.capabilities, data.total || 0));
    } catch (e) {
      showError(area, "Error: " + e.message);
    } finally {
      area.classList.remove("loading");
    }
  }

  function openCreateModal() {
    if (!currentEntity) return;
    editingId = null;
    $("modal-title").textContent = "Create " + currentEntity.name;
    renderFormFields(null);
    $("modal").classList.remove("hidden");
  }
  async function openEditModal(id) {
    if (!currentEntity) return;
    editingId = id;
    $("modal-title").textContent = "Edit " + currentEntity.name;
    try {
      var res = await fetch(BASE_URL + currentEntity.apiPath + "/" + encodeURIComponent(id), { headers: headers() });
      var data = await res.json();
      renderFormFields(data);
      $("modal").classList.remove("hidden");
    } catch (e) {
      toast("Failed to load: " + e.message, "error");
    }
  }
  function renderFormFields(data) {
    var fields = currentEntity.formFields;
    var container = $("form-fields");
    clear(container);
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var val = data ? (data[f.key] !== undefined ? data[f.key] : "") : "";
      var wrap = el("div");
      wrap.appendChild(el("label", { class: "block text-sm font-medium text-gray-700 mb-1" }, f.label + (f.nullable ? "" : " *")));
      var input;
      if (f.type === "boolean") {
        input = el("input", { type: "checkbox", name: f.key, class: "h-4 w-4 text-blue-600 rounded border-gray-300" });
        input.checked = !!val;
      } else if (f.type === "json" || f.type === "array") {
        input = el("textarea", { name: f.key, rows: "3", class: "w-full border border-gray-300 rounded px-3 py-2 text-sm" });
        input.value = typeof val === "object" ? JSON.stringify(val, null, 2) : (val == null ? "" : String(val));
      } else {
        var t = f.type === "datetime" ? "datetime-local" : "text";
        input = el("input", { type: t, name: f.key, class: "w-full border border-gray-300 rounded px-3 py-2 text-sm" });
        input.value = val == null ? "" : String(val);
      }
      wrap.appendChild(input);
      container.appendChild(wrap);
    }
  }
  async function submitForm(e) {
    e.preventDefault();
    if (!currentEntity) return;
    var form = $("modal-form");
    var body = {};
    for (var i = 0; i < currentEntity.formFields.length; i++) {
      var f = currentEntity.formFields[i];
      var elx = form.elements[f.key];
      if (!elx) continue;
      if (f.type === "boolean") {
        body[f.key] = elx.checked;
      } else if (f.type === "json" || f.type === "array") {
        try { body[f.key] = JSON.parse(elx.value); } catch (ex) { body[f.key] = elx.value; }
      } else {
        body[f.key] = elx.value;
      }
    }
    try {
      var url = editingId ? BASE_URL + currentEntity.apiPath + "/" + encodeURIComponent(editingId) : BASE_URL + currentEntity.apiPath;
      var method = editingId ? "PUT" : "POST";
      var res = await fetch(url, { method: method, headers: headers(), body: JSON.stringify(body) });
      var data = await res.json();
      if (!res.ok) throw new Error((data.error && data.error.message) || "Request failed");
      toast(editingId ? "Updated" : "Created");
      closeModal();
      refreshTable();
    } catch (e) {
      toast(e.message, "error");
    }
  }
  async function deleteRecord(id) {
    if (!confirm("Delete this record?")) return;
    try {
      var res = await fetch(BASE_URL + currentEntity.apiPath + "/" + encodeURIComponent(id), { method: "DELETE", headers: headers() });
      if (!res.ok) {
        var d = await res.json().catch(function() { return {}; });
        throw new Error((d.error && d.error.message) || "Delete failed");
      }
      toast("Deleted");
      refreshTable();
    } catch (e) {
      toast(e.message, "error");
    }
  }
  function runCapability(endpoint, label) {
    pendingCapability = { endpoint: endpoint, label: label };
    $("cap-modal-title").textContent = label;
    $("cap-modal-desc").textContent = "Run this capability?";
    $("cap-modal").classList.remove("hidden");
  }
  async function confirmCapability() {
    if (!pendingCapability) return;
    closeCapModal();
    try {
      var res = await fetch(BASE_URL + pendingCapability.endpoint, { method: "POST", headers: headers(), body: JSON.stringify({}) });
      var data = await res.json().catch(function() { return {}; });
      if (!res.ok) throw new Error((data.error && data.error.message) || "Failed");
      toast(pendingCapability.label + " completed");
      refreshTable();
    } catch (e) {
      toast(e.message, "error");
    }
  }
  function closeModal() { $("modal").classList.add("hidden"); editingId = null; }
  function closeCapModal() { $("cap-modal").classList.add("hidden"); pendingCapability = null; }

  // Wire up buttons (no inline onclick anywhere — addEventListener only).
  $("token-input").addEventListener("change", function(e) { setToken(e.target.value); });
  $("create-btn").addEventListener("click", openCreateModal);
  $("refresh-btn").addEventListener("click", refreshTable);
  $("modal-form").addEventListener("submit", submitForm);
  $("modal-close").addEventListener("click", closeModal);
  $("modal-cancel").addEventListener("click", closeModal);
  $("cap-modal-close").addEventListener("click", closeCapModal);
  $("cap-modal-cancel").addEventListener("click", closeCapModal);
  $("cap-modal-confirm").addEventListener("click", confirmCapability);
  $("modal").addEventListener("click", function(e) { if (e.target === e.currentTarget) closeModal(); });
  $("cap-modal").addEventListener("click", function(e) { if (e.target === e.currentTarget) closeCapModal(); });

  var navButtons = document.querySelectorAll("[id^=nav-]");
  for (var i = 0; i < navButtons.length; i++) {
    (function(btn) {
      btn.addEventListener("click", function() { loadEntity(btn.dataset.entity); });
    })(navButtons[i]);
  }
})();
`;
//# sourceMappingURL=emit_admin.js.map