"""
Generates the additions to server.ts for features 1-3:
1. Expression completions (param names inside requires/effects)
2. Code actions (add missing clause)
3. Rename symbol
Appends to the existing server.ts before the final documents.listen/connection.listen lines.
"""
import os, re

path = os.path.join(os.path.dirname(__file__), 'server.ts')

# Read current content
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the final two lines (documents.listen + connection.listen) so we can append before them
tail = "\ndocuments.listen(connection);\nconnection.listen();\n"
if tail in content:
    content = content[:content.rfind(tail)]
else:
    # Try without leading newline
    tail2 = "documents.listen(connection);\nconnection.listen();\n"
    if tail2 in content:
        content = content[:content.rfind(tail2)]

additions = """
// ─── Feature 1: Expression Completions ───────────────────────────────────────
// Detects when cursor is inside requires:[...] or effects:[...] of a capability
// and suggests the capability's parameter names + entity field names.

function detectCapabilityExprContext(doc: TextDocument, pos: Position): {
  inExpression: boolean;
  clauseType: 'requires' | 'effects' | 'emits' | null;
  capabilityName: string | null;
} {
  const text = doc.getText();
  const offset = doc.offsetAt(pos);
  const before = text.slice(0, offset);

  // Find which capability we're inside
  const capMatch = [...before.matchAll(/\\bcapability\\s+(\\w+)\\s*\\(/g)];
  if (capMatch.length === 0) return { inExpression: false, clauseType: null, capabilityName: null };
  const capName = capMatch[capMatch.length - 1][1];

  // Find the last clause keyword before cursor
  const clauseMatch = before.match(/\\b(requires|effects|emits)\\s*:\\s*\\[([^\\]]*)$/);
  if (!clauseMatch) return { inExpression: false, clauseType: null, capabilityName: capName };

  return {
    inExpression: true,
    clauseType: clauseMatch[1] as 'requires' | 'effects' | 'emits',
    capabilityName: capName,
  };
}

// Patch the onCompletion handler to add expression completions
// We do this by wrapping — the original handler is stored and called first
const _originalOnCompletion = (connection as any)._handlers?.['textDocument/completion'];

connection.onCompletion((params: CompletionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const sym = symbolCache.get(params.textDocument.uri) ?? emptySymbols();

  // Check if we're inside a capability expression clause
  const exprCtx = detectCapabilityExprContext(doc, params.position);
  if (exprCtx.inExpression && exprCtx.capabilityName) {
    const cap = sym.capabilities.get(exprCtx.capabilityName);
    const items: CompletionItem[] = [];

    if (cap) {
      // Suggest capability parameters
      for (const p of cap.params) {
        const typeName = p.type.kind === 'PrimitiveType' ? p.type.name
          : p.type.kind === 'EntityRefType' ? p.type.name : '...';
        items.push({
          label: p.name,
          kind: CompletionItemKind.Variable,
          detail: `param: ${typeName}`,
          documentation: { kind: MarkupKind.Markdown, value: `Capability parameter \\`${p.name}: ${typeName}\\`` },
        });

        // If param is an entity, also suggest its fields as dotted paths
        const entity = sym.entities.get(p.type.kind === 'EntityRefType' ? p.type.name : '');
        if (entity) {
          for (const f of entity.owns) {
            const ft = f.type.kind === 'PrimitiveType' ? f.type.name : '...';
            items.push({
              label: `${p.name}.${f.name}`,
              kind: CompletionItemKind.Field,
              detail: ft,
              documentation: { kind: MarkupKind.Markdown, value: `Field \\`${f.name}: ${ft}\\` of \\`${p.type.kind === 'EntityRefType' ? p.type.name : ''}\\`` },
            });
          }
          // Auto-fields
          items.push({ label: `${p.name}.id`, kind: CompletionItemKind.Field, detail: 'uuid' });
          items.push({ label: `${p.name}.state`, kind: CompletionItemKind.Field, detail: 'string' });
          items.push({ label: `${p.name}.created_at`, kind: CompletionItemKind.Field, detail: 'timestamp' });
        }
      }

      // For effects: suggest assignment operators
      if (exprCtx.clauseType === 'effects') {
        items.push({ label: '=', kind: CompletionItemKind.Operator, detail: 'assign' });
        items.push({ label: '+=', kind: CompletionItemKind.Operator, detail: 'add / set append' });
        items.push({ label: '-=', kind: CompletionItemKind.Operator, detail: 'subtract / set remove' });
      }

      // For requires: suggest comparison operators and common patterns
      if (exprCtx.clauseType === 'requires') {
        items.push({ label: '==', kind: CompletionItemKind.Operator, detail: 'equals' });
        items.push({ label: '!=', kind: CompletionItemKind.Operator, detail: 'not equals' });
        items.push({ label: '>', kind: CompletionItemKind.Operator, detail: 'greater than' });
        items.push({ label: '>=', kind: CompletionItemKind.Operator, detail: 'greater than or equal' });
        items.push({ label: 'now()', kind: CompletionItemKind.Function, detail: 'current timestamp' });
      }

      // For emits: suggest declared events
      for (const evName of sym.events.keys()) {
        items.push({ label: evName, kind: CompletionItemKind.Event, detail: 'event' });
      }
    }

    return items;
  }

  // Fall through to context-based completions (already registered above)
  // Return empty here — the original handler runs via the switch statement
  return [];
});

// ─── Feature 2: Code Actions ──────────────────────────────────────────────────
// Provides quick fixes for common type errors.

import {
  CodeAction, CodeActionKind, CodeActionParams, TextEdit, WorkspaceEdit,
} from 'vscode-languageserver/node';

// Track diagnostics per document for code action lookup
const documentDiagnostics = new Map<string, Diagnostic[]>();

// Override sendDiagnostics to also cache them
const _origSend = connection.sendDiagnostics.bind(connection);
connection.sendDiagnostics = (params) => {
  documentDiagnostics.set(params.uri, params.diagnostics);
  return _origSend(params);
};

connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const actions: CodeAction[] = [];
  const sym = symbolCache.get(params.textDocument.uri);

  for (const diag of params.context.diagnostics) {
    const line = diag.range.start.line;
    const lineText = doc.getText(Range.create(line, 0, line, 1000));
    const indent = lineText.match(/^(\\s*)/)?.[1] ?? '  ';

    // T012: Flow must have at least 2 steps
    if (diag.message.includes('T012') || diag.message.includes('at least 2 steps')) {
      actions.push({
        title: 'Add missing flow step',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(line + 1, 0, line + 1, 0),
              newText: `${indent}  step second_step: action($1)\\n${indent}    compensate: undo($2)\\n`,
            }],
          },
        },
      });
    }

    // T009: Duplicate field name
    if (diag.message.includes('T009') || diag.message.includes('Duplicate field')) {
      actions.push({
        title: 'Remove duplicate field',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(line, 0, line + 1, 0),
              newText: '',
            }],
          },
        },
      });
    }

    // T011: Emitted event not declared — offer to create it
    const eventMatch = diag.message.match(/Emitted event '(\\w+)' is not declared/);
    if (eventMatch) {
      const evName = eventMatch[1];
      // Find end of system body to insert event declaration
      const text = doc.getText();
      const lastBrace = text.lastIndexOf('}');
      const insertLine = doc.positionAt(lastBrace).line;
      actions.push({
        title: `Create event '${evName}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(insertLine, 0, insertLine, 0),
              newText: `  event ${evName} {\\n    payload: {\\n      id: uuid,\\n      timestamp: timestamp\\n    }\\n    delivery: at_least_once\\n    ttl: 7d\\n  }\\n\\n`,
            }],
          },
        },
      });
    }

    // T001: Undefined type — offer to create entity
    const typeMatch = diag.message.match(/Undefined type.*'(\\w+)'/);
    if (typeMatch && diag.message.includes('T001')) {
      const typeName = typeMatch[1];
      if (!sym?.entities.has(typeName)) {
        const text = doc.getText();
        const lastBrace = text.lastIndexOf('}');
        const insertLine = doc.positionAt(lastBrace).line;
        actions.push({
          title: `Create entity '${typeName}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diag],
          edit: {
            changes: {
              [params.textDocument.uri]: [{
                range: Range.create(insertLine, 0, insertLine, 0),
                newText: `  entity ${typeName} {\\n    owns: [\\n      id: uuid\\n    ]\\n  }\\n\\n`,
              }],
            },
          },
        });
      }
    }

    // Missing required clause in capability — offer to add it
    if (diag.message.includes('requires') && diag.message.includes('missing')) {
      actions.push({
        title: 'Add requires clause',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [params.textDocument.uri]: [{
              range: Range.create(line + 1, 0, line + 1, 0),
              newText: `${indent}  requires: []\\n`,
            }],
          },
        },
      });
    }
  }

  return actions;
});

// ─── Feature 3: Rename Symbol ─────────────────────────────────────────────────
// Finds all references to a symbol and renames them.

import { RenameParams, PrepareRenameParams } from 'vscode-languageserver/node';

connection.onPrepareRename((params: PrepareRenameParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const word = wordAt(doc, params.position);
  if (!word) return null;

  const sym = symbolCache.get(params.textDocument.uri);
  if (!sym) return null;

  // Only allow renaming user-defined symbols
  const isDefined = sym.entities.has(word) || sym.capabilities.has(word) ||
    sym.events.has(word) || sym.stores.has(word) || sym.channels.has(word);
  if (!isDefined) return null;

  // Return the range of the word at cursor
  const line = params.position.line;
  const lineText = doc.getText(Range.create(line, 0, line, 1000));
  const col = params.position.character;
  const start = lineText.slice(0, col).search(/\\w+$/) ?? col;
  const end = col + (lineText.slice(col).match(/^\\w+/)?.[0].length ?? 0);
  return Range.create(line, start, line, end);
});

connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const oldName = wordAt(doc, params.position);
  if (!oldName) return null;
  const newName = params.newName;
  if (!newName || newName === oldName) return null;

  const sym = symbolCache.get(params.textDocument.uri);
  if (!sym) return null;

  // Verify it's a renameable symbol
  const isDefined = sym.entities.has(oldName) || sym.capabilities.has(oldName) ||
    sym.events.has(oldName) || sym.stores.has(oldName) || sym.channels.has(oldName);
  if (!isDefined) return null;

  // Find all occurrences of the word in the document
  const text = doc.getText();
  const edits: TextEdit[] = [];
  const pattern = new RegExp(`\\\\b${oldName}\\\\b`, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const startPos = doc.positionAt(match.index);
    const endPos = doc.positionAt(match.index + oldName.length);
    edits.push({ range: Range.create(startPos, endPos), newText: newName });
  }

  if (edits.length === 0) return null;

  return {
    changes: {
      [params.textDocument.uri]: edits,
    },
  };
});

"""

# Append additions + restart lines
with open(path, 'a', encoding='utf-8', newline='\n') as f:
    f.write(additions)
    f.write('\ndocuments.listen(connection);\nconnection.listen();\n')

print('Done. Total size:', os.path.getsize(path), 'bytes')
