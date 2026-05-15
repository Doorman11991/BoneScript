/**
 * BoneScript VS Code Extension
 * Provides LSP integration + CLI command wrappers for .bone files.
 */

import * as path from "path";
import * as cp from "child_process";
import {
  workspace, window, commands, ExtensionContext,
  OutputChannel, StatusBarItem, StatusBarAlignment,
  Uri, QuickPickItem,
} from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;
let outputChannel: OutputChannel;
let statusBar: StatusBarItem;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBonecPath(): string {
  return workspace.getConfiguration("bonescript").get<string>("compilerPath") || "bonec";
}

function getActiveFile(): string | undefined {
  return window.activeTextEditor?.document.uri.fsPath;
}

function runBonec(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise(resolve => {
    const bonec = getBonecPath();
    outputChannel.show(true);
    outputChannel.appendLine(`\n$ ${bonec} ${args.join(" ")}`);

    const proc = cp.spawn(bonec, args, {
      cwd: cwd || workspace.workspaceFolders?.[0]?.uri.fsPath,
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => {
      const text = d.toString();
      stdout += text;
      outputChannel.append(text);
    });
    proc.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      outputChannel.append(text);
    });
    proc.on("close", code => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    proc.on("error", err => {
      outputChannel.appendLine(`Error: ${err.message}`);
      outputChannel.appendLine(`Make sure 'bonec' is installed: npm install -g bonescript-compiler`);
      resolve({ stdout, stderr: err.message, code: 1 });
    });
  });
}

function setStatus(text: string, tooltip?: string, color?: string) {
  statusBar.text = text;
  statusBar.tooltip = tooltip || text;
  statusBar.color = color;
  statusBar.show();
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdCompile() {
  const file = getActiveFile();
  if (!file || !file.endsWith(".bone")) {
    window.showErrorMessage("Open a .bone file to compile.");
    return;
  }

  setStatus("$(sync~spin) Compiling…", "BoneScript: compiling");
  const outDir = workspace.getConfiguration("bonescript").get<string>("outputDir") || "";
  const args = ["compile", file, ...(outDir ? ["--out", outDir] : [])];
  const result = await runBonec(args, path.dirname(file));

  if (result.code === 0) {
    setStatus("$(check) Compiled", "BoneScript: last compile succeeded");
    window.showInformationMessage("BoneScript: compiled successfully.");
  } else {
    setStatus("$(error) Compile failed", "BoneScript: last compile failed", "red");
    window.showErrorMessage("BoneScript: compilation failed. See output for details.");
  }
}

async function cmdCheck() {
  const file = getActiveFile();
  if (!file || !file.endsWith(".bone")) {
    window.showErrorMessage("Open a .bone file to check.");
    return;
  }

  setStatus("$(sync~spin) Checking…", "BoneScript: checking");
  const result = await runBonec(["check", file], path.dirname(file));

  if (result.code === 0) {
    setStatus("$(check) No errors", "BoneScript: check passed");
    window.showInformationMessage("BoneScript: no errors found.");
  } else {
    setStatus("$(warning) Check failed", "BoneScript: check found errors", "yellow");
    window.showWarningMessage("BoneScript: check found errors. See output for details.");
  }
}

async function cmdFmt() {
  const file = getActiveFile();
  if (!file || !file.endsWith(".bone")) {
    window.showErrorMessage("Open a .bone file to format.");
    return;
  }

  const result = await runBonec(["fmt", file], path.dirname(file));
  if (result.code === 0) {
    window.showInformationMessage("BoneScript: file formatted.");
  } else {
    window.showErrorMessage("BoneScript: format failed. See output for details.");
  }
}

async function cmdInit() {
  const name = await window.showInputBox({
    prompt: "Project name",
    placeHolder: "my-project",
    validateInput: v => v && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v) ? null : "Use letters, numbers, hyphens, underscores. Must start with a letter.",
  });
  if (!name) return;

  const domains: QuickPickItem[] = [
    { label: "saas_platform",          description: "OAuth2 · PostgreSQL · eventual" },
    { label: "marketplace",            description: "OAuth2 · PostgreSQL · transactional" },
    { label: "multiplayer_game",       description: "JWT · PostgreSQL + Redis · realtime" },
    { label: "social_network",         description: "OAuth2 · PostgreSQL + Redis · eventual" },
    { label: "realtime_collaboration", description: "JWT · PostgreSQL + Redis · realtime" },
    { label: "iot_system",             description: "API key · DynamoDB · eventual" },
  ];

  const picked = await window.showQuickPick(domains, {
    placeHolder: "Select a domain template",
    title: "BoneScript: Init New Project",
  });
  if (!picked) return;

  const folder = workspace.workspaceFolders?.[0]?.uri.fsPath;
  const result = await runBonec(["init", name, "--domain", picked.label], folder);

  if (result.code === 0) {
    window.showInformationMessage(`BoneScript: project '${name}' created.`);
    // Open the generated .bone file
    const bonePath = path.join(folder || ".", name, `${name}.bone`);
    try {
      const doc = await workspace.openTextDocument(Uri.file(bonePath));
      await window.showTextDocument(doc);
    } catch {
      // File may be in a different location — that's fine
    }
  } else {
    window.showErrorMessage(`BoneScript: init failed. See output for details.`);
  }
}

async function cmdShowOutput() {
  outputChannel.show();
}

// ─── Auto-format on save ──────────────────────────────────────────────────────

function setupAutoFormat(context: ExtensionContext) {
  context.subscriptions.push(
    workspace.onWillSaveTextDocument(async event => {
      const doc = event.document;
      if (doc.languageId !== "bone") return;
      if (!workspace.getConfiguration("bonescript").get<boolean>("autoFormat")) return;
      // Trigger format — the LSP handles the actual edits
      await commands.executeCommand("editor.action.formatDocument");
    })
  );
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: ExtensionContext) {
  // Output channel
  outputChannel = window.createOutputChannel("BoneScript");
  context.subscriptions.push(outputChannel);

  // Status bar
  statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 100);
  statusBar.command = "bone.showOutput";
  statusBar.text = "$(symbol-misc) BoneScript";
  statusBar.tooltip = "BoneScript — click to show output";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Register commands
  context.subscriptions.push(
    commands.registerCommand("bone.compile",    cmdCompile),
    commands.registerCommand("bone.check",      cmdCheck),
    commands.registerCommand("bone.fmt",        cmdFmt),
    commands.registerCommand("bone.init",       cmdInit),
    commands.registerCommand("bone.showOutput", cmdShowOutput),
  );

  // Auto-format on save
  setupAutoFormat(context);

  // Update status bar when active editor changes
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document.languageId === "bone") {
        statusBar.show();
      }
    })
  );

  // ─── LSP client ─────────────────────────────────────────────────────────────
  const serverModule = context.asAbsolutePath(
    path.join("..", "lsp", "dist", "server.js")
  );

  const serverOptions: ServerOptions = {
    run:   { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "bone" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.bone"),
    },
    outputChannel,
  };

  client = new LanguageClient(
    "bonescriptLSP",
    "BoneScript Language Server",
    serverOptions,
    clientOptions
  );

  client.start();
  outputChannel.appendLine("BoneScript Language Server started.");
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
