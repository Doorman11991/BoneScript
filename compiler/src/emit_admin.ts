/**
 * BoneScript Admin Panel Emitter
 * Generates a self-contained HTML admin UI from an IRSystem.
 * No build step — single HTML file with Tailwind CDN + vanilla JS.
 */

import * as IR from "./ir";

function toSnakeCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function toDashCase(s: string): string {
  return toSnakeCase(s).replace(/_/g, "-");
}

function irTypeToDisplay(irType: string): string {
  if (irType === "bool") return "boolean";
  if (irType === "timestamp") return "datetime";
  if (irType === "uuid") return "uuid";
  if (irType === "json") return "json";
  if (irType.startsWith("list<") || irType.startsWith("set<")) return "array";
  return "text";
}

export function emitAdminPanel(system: IR.IRSystem): string {
  const apiModules = system.modules.filter(m => m.kind === "api_service" && m.models.length > 0);

  const entityConfigs = apiModules.map(mod => {
    const model = mod.models[0];
    const tableName = toSnakeCase(model.name) + "s";
    const capabilities = mod.interfaces.flatMap(i => i.methods)
      .filter(m => !["create","read","update","delete","list"].includes(m.name));
    const columns = model.fields.map(f => ({
      key: f.name,
      label: f.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      type: irTypeToDisplay(f.type),
      nullable: f.nullable,
    }));
    const formFields = model.fields
      .filter(f => !["id", "created_at", "updated_at"].includes(f.name))
      .map(f => ({
        key: f.name,
        label: f.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
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
        label: c.name.replace(/_/g, " ").replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
        endpoint: "/" + tableName + "/" + toDashCase(c.name),
      })),
    };
  });

  const configJson = JSON.stringify(entityConfigs, null, 2);

  // Build nav buttons using string concatenation (no template literals in generated JS)
  const navHtml = apiModules.map(mod => {
    const t = toSnakeCase(mod.models[0].name) + "s";
    const n = mod.models[0].name;
    return '<button onclick="loadEntity(\'' + t + '\')" id="nav-' + t + '" ' +
      'class="w-full text-left px-3 py-2 rounded text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors mb-1">' +
      n + '</button>';
  }).join("\n      ");

  // The embedded JS uses only regular strings (no backticks) to avoid escaping issues
  const embeddedJs = [
    'const BASE_URL = "http://localhost:3000";',
    'const ENTITIES = ' + configJson + ';',
    'let currentEntity = null, currentPage = 1, editingId = null, pendingCapability = null;',
    'let authToken = localStorage.getItem("admin_token") || "";',
    'if (authToken) { document.getElementById("token-input").value = authToken; document.getElementById("auth-status").textContent = "Token set"; }',
    'function setToken(v) { authToken = v; localStorage.setItem("admin_token", v); document.getElementById("auth-status").textContent = v ? "Token set" : "Not authenticated"; }',
    'function headers() { const h = { "Content-Type": "application/json" }; if (authToken) h["Authorization"] = "Bearer " + authToken; return h; }',
    'function toast(msg, type) { const el = document.createElement("div"); el.className = "toast px-4 py-2 rounded shadow text-sm text-white " + (type === "error" ? "bg-red-500" : "bg-green-500"); el.textContent = msg; document.getElementById("toast-container").appendChild(el); setTimeout(function() { el.remove(); }, 3500); }',
    'function loadEntity(t) { currentEntity = ENTITIES.find(function(e) { return e.tableName === t; }); if (!currentEntity) return; currentPage = 1; document.querySelectorAll("[id^=nav-]").forEach(function(el) { el.classList.remove("bg-gray-700", "text-white"); el.classList.add("text-gray-300"); }); var n = document.getElementById("nav-" + t); if (n) { n.classList.add("bg-gray-700", "text-white"); n.classList.remove("text-gray-300"); } document.getElementById("page-title").textContent = currentEntity.name; document.getElementById("page-subtitle").textContent = currentEntity.apiPath; document.getElementById("create-btn").classList.remove("hidden"); document.getElementById("refresh-btn").classList.remove("hidden"); refreshTable(); }',
    'async function refreshTable() { if (!currentEntity) return; var area = document.getElementById("content-area"); area.classList.add("loading"); try { var res = await fetch(BASE_URL + currentEntity.apiPath + "?page=" + currentPage + "&page_size=50", { headers: headers() }); var data = await res.json(); if (!res.ok) { area.innerHTML = "<p class=\\"text-red-600\\">" + (data.error && data.error.message || "Error") + "</p>"; return; } var items = data.items || []; var total = data.total || 0; var cols = currentEntity.columns; var caps = currentEntity.capabilities; var html = "<div class=\\"bg-white rounded-lg shadow overflow-hidden\\"><div class=\\"px-4 py-3 border-b flex items-center justify-between\\"><span class=\\"text-sm text-gray-500\\">" + total + " total</span>"; if (caps.length > 0) { html += "<div class=\\"flex gap-2\\">"; for (var i = 0; i < caps.length; i++) { html += "<button onclick=\\"runCapability(\'" + caps[i].endpoint + "\',\'" + caps[i].label + "\')\\" class=\\"text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded\\">" + caps[i].label + "</button>"; } html += "</div>"; } html += "</div><div class=\\"overflow-x-auto\\"><table class=\\"w-full text-sm\\"><thead class=\\"bg-gray-50 border-b\\"><tr>"; for (var j = 0; j < cols.length; j++) { html += "<th class=\\"text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase\\">" + cols[j].label + "</th>"; } html += "<th class=\\"text-right px-4 py-3 text-xs\\">Actions</th></tr></thead><tbody class=\\"divide-y divide-gray-100\\">"; if (items.length === 0) { html += "<tr><td colspan=\\"" + (cols.length + 1) + "\\" class=\\"px-4 py-8 text-center text-gray-400\\">No records</td></tr>"; } for (var k = 0; k < items.length; k++) { var item = items[k]; html += "<tr class=\\"hover:bg-gray-50\\">"; for (var l = 0; l < cols.length; l++) { var col = cols[l]; var val = item[col.key]; var d = ""; if (val === null || val === undefined) { d = "<span class=\\"text-gray-300 italic\\">null</span>"; } else if (col.type === "boolean") { d = val ? "<span class=\\"text-green-600\\">Yes</span>" : "<span class=\\"text-red-400\\">No</span>"; } else if (col.type === "datetime") { d = "<span class=\\"text-gray-600\\">" + new Date(val).toLocaleString() + "</span>"; } else if (col.type === "uuid") { d = "<span class=\\"font-mono text-xs text-gray-500\\">" + String(val).slice(0, 8) + "...</span>"; } else if (col.type === "json" || col.type === "array") { d = "<span class=\\"font-mono text-xs text-gray-500\\">" + JSON.stringify(val).slice(0, 40) + "</span>"; } else { d = "<span class=\\"text-gray-800\\">" + String(val).slice(0, 60) + "</span>"; } html += "<td class=\\"px-4 py-3\\">" + d + "</td>"; } html += "<td class=\\"px-4 py-3 text-right\\"><button onclick=\\"openEditModal(\'" + item.id + "\')\\" class=\\"text-blue-600 hover:text-blue-800 text-xs mr-2\\">Edit</button><button onclick=\\"deleteRecord(\'" + item.id + "\')\\" class=\\"text-red-500 hover:text-red-700 text-xs\\">Delete</button></td></tr>"; } html += "</tbody></table></div></div>"; area.innerHTML = html; } catch(e) { area.innerHTML = "<p class=\\"text-red-600\\">Error: " + e.message + "</p>"; } finally { area.classList.remove("loading"); } }',
    'function openCreateModal() { if (!currentEntity) return; editingId = null; document.getElementById("modal-title").textContent = "Create " + currentEntity.name; renderFormFields(null); document.getElementById("modal").classList.remove("hidden"); }',
    'async function openEditModal(id) { if (!currentEntity) return; editingId = id; document.getElementById("modal-title").textContent = "Edit " + currentEntity.name; try { var res = await fetch(BASE_URL + currentEntity.apiPath + "/" + id, { headers: headers() }); var data = await res.json(); renderFormFields(data); document.getElementById("modal").classList.remove("hidden"); } catch(e) { toast("Failed to load: " + e.message, "error"); } }',
    'function renderFormFields(data) { var fields = currentEntity.formFields; var html = ""; for (var i = 0; i < fields.length; i++) { var f = fields[i]; var val = data ? (data[f.key] !== undefined ? data[f.key] : "") : ""; var it = f.type === "boolean" ? "checkbox" : f.type === "datetime" ? "datetime-local" : f.type === "json" || f.type === "array" ? "textarea" : "text"; html += "<div><label class=\\"block text-sm font-medium text-gray-700 mb-1\\">" + f.label + (f.nullable ? "" : " *") + "</label>"; if (it === "checkbox") { html += "<input type=\\"checkbox\\" name=\\"" + f.key + "\\" " + (val ? "checked" : "") + " class=\\"h-4 w-4 text-blue-600 rounded border-gray-300\\" />"; } else if (it === "textarea") { html += "<textarea name=\\"" + f.key + "\\" rows=\\"3\\" class=\\"w-full border border-gray-300 rounded px-3 py-2 text-sm\\">" + (typeof val === "object" ? JSON.stringify(val, null, 2) : val) + "</textarea>"; } else { html += "<input type=\\"" + it + "\\" name=\\"" + f.key + "\\" value=\\"" + val + "\\" class=\\"w-full border border-gray-300 rounded px-3 py-2 text-sm\\" />"; } html += "</div>"; } document.getElementById("form-fields").innerHTML = html; }',
    'async function submitForm(e) { e.preventDefault(); if (!currentEntity) return; var form = document.getElementById("modal-form"); var body = {}; for (var i = 0; i < currentEntity.formFields.length; i++) { var f = currentEntity.formFields[i]; var el = form.elements[f.key]; if (!el) continue; if (f.type === "boolean") { body[f.key] = el.checked; } else if (f.type === "json" || f.type === "array") { try { body[f.key] = JSON.parse(el.value); } catch(ex) { body[f.key] = el.value; } } else { body[f.key] = el.value; } } try { var url = editingId ? BASE_URL + currentEntity.apiPath + "/" + editingId : BASE_URL + currentEntity.apiPath; var method = editingId ? "PUT" : "POST"; var res = await fetch(url, { method: method, headers: headers(), body: JSON.stringify(body) }); var data = await res.json(); if (!res.ok) throw new Error(data.error && data.error.message || "Request failed"); toast(editingId ? "Updated" : "Created"); closeModal(); refreshTable(); } catch(e) { toast(e.message, "error"); } }',
    'async function deleteRecord(id) { if (!confirm("Delete this record?")) return; try { var res = await fetch(BASE_URL + currentEntity.apiPath + "/" + id, { method: "DELETE", headers: headers() }); if (!res.ok) { var d = await res.json().catch(function() { return {}; }); throw new Error(d.error && d.error.message || "Delete failed"); } toast("Deleted"); refreshTable(); } catch(e) { toast(e.message, "error"); } }',
    'function runCapability(endpoint, label) { pendingCapability = { endpoint: endpoint, label: label }; document.getElementById("cap-modal-title").textContent = label; document.getElementById("cap-modal-desc").textContent = "Run this capability?"; document.getElementById("cap-modal").classList.remove("hidden"); }',
    'async function confirmCapability() { if (!pendingCapability) return; closeCapModal(); try { var res = await fetch(BASE_URL + pendingCapability.endpoint, { method: "POST", headers: headers(), body: JSON.stringify({}) }); var data = await res.json().catch(function() { return {}; }); if (!res.ok) throw new Error(data.error && data.error.message || "Failed"); toast(pendingCapability.label + " completed"); refreshTable(); } catch(e) { toast(e.message, "error"); } }',
    'function closeModal() { document.getElementById("modal").classList.add("hidden"); editingId = null; }',
    'function closeCapModal() { document.getElementById("cap-modal").classList.add("hidden"); pendingCapability = null; }',
    'document.getElementById("modal").addEventListener("click", function(e) { if (e.target === e.currentTarget) closeModal(); });',
    'document.getElementById("cap-modal").addEventListener("click", function(e) { if (e.target === e.currentTarget) closeCapModal(); });',
  ].join("\n");

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<title>' + system.name + ' Admin</title>',
    '<script src="https://cdn.tailwindcss.com"><\/script>',
    '<style>.loading{opacity:.5;pointer-events:none}.toast{animation:fadeout 3s forwards}@keyframes fadeout{0%,70%{opacity:1}100%{opacity:0}}<\/style>',
    '</head>',
    '<body class="bg-gray-50 min-h-screen">',
    '<div class="flex h-screen overflow-hidden">',
    '<aside class="w-64 bg-gray-900 text-white flex flex-col">',
    '<div class="p-4 border-b border-gray-700"><h1 class="text-lg font-bold">' + system.name + '</h1><p class="text-xs text-gray-400 mt-1">Admin Panel</p></div>',
    '<nav class="flex-1 overflow-y-auto p-2" id="nav">' + navHtml + '</nav>',
    '<div class="p-4 border-t border-gray-700"><div class="text-xs text-gray-500"><div id="auth-status">Not authenticated</div>',
    '<input id="token-input" type="password" placeholder="Bearer token" class="mt-2 w-full bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600" onchange="setToken(this.value)" /></div></div>',
    '</aside>',
    '<main class="flex-1 overflow-y-auto">',
    '<div class="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">',
    '<div><h2 class="text-xl font-semibold text-gray-800" id="page-title">Select an entity</h2><p class="text-sm text-gray-500" id="page-subtitle"></p></div>',
    '<div class="flex gap-2">',
    '<button onclick="openCreateModal()" id="create-btn" class="hidden bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">+ Create</button>',
    '<button onclick="refreshTable()" id="refresh-btn" class="hidden bg-gray-100 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-200">&#8635; Refresh</button>',
    '</div></div>',
    '<div id="toast-container" class="fixed top-4 right-4 z-50 flex flex-col gap-2"></div>',
    '<div class="p-6" id="content-area"><div class="text-center text-gray-400 mt-20"><div class="text-5xl mb-4">&#9889;</div><p class="text-lg">Select an entity from the sidebar</p><p class="text-sm mt-2">Generated by BoneScript compiler</p></div></div>',
    '</main></div>',
    '<div id="modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"><div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-screen overflow-y-auto"><div class="p-6"><div class="flex items-center justify-between mb-4"><h3 class="text-lg font-semibold" id="modal-title">Create</h3><button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div><form id="modal-form" onsubmit="submitForm(event)" class="space-y-4"><div id="form-fields"></div><div class="flex gap-2 pt-2"><button type="submit" class="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Save</button><button type="button" onclick="closeModal()" class="flex-1 bg-gray-100 text-gray-700 py-2 rounded hover:bg-gray-200">Cancel</button></div></form></div></div></div>',
    '<div id="cap-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4"><div class="bg-white rounded-lg shadow-xl w-full max-w-md"><div class="p-6"><div class="flex items-center justify-between mb-4"><h3 class="text-lg font-semibold" id="cap-modal-title">Run Capability</h3><button onclick="closeCapModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div><p class="text-sm text-gray-500 mb-4" id="cap-modal-desc"></p><div class="flex gap-2"><button onclick="confirmCapability()" class="flex-1 bg-orange-500 text-white py-2 rounded hover:bg-orange-600">Run</button><button onclick="closeCapModal()" class="flex-1 bg-gray-100 text-gray-700 py-2 rounded hover:bg-gray-200">Cancel</button></div></div></div></div>',
    '<script>' + embeddedJs + '<\/script>',
    '</body></html>',
  ].join("\n");
}
