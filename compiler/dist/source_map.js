"use strict";
/**
 * BoneScript Source Map Generator
 *
 * Tracks every IR node and generated code line back to its origin in the .bone source.
 * Output format: a simple JSON map of {generated_file:line â†’ source_file:line}
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceMapBuilder = void 0;
class SourceMapBuilder {
    constructor() {
        this.mappings = [];
    }
    add(mapping) {
        this.mappings.push(mapping);
    }
    /**
     * Build source map for a generated TypeScript service file.
     * Maps each method to its capability declaration in the source.
     */
    buildForService(generatedFile, sourcePath, sourceHash, mod) {
        const mappings = [];
        // Each method maps to its IR module
        for (const iface of mod.interfaces) {
            for (const method of iface.methods) {
                mappings.push({
                    generated_file: generatedFile,
                    generated_line: 0, // would be computed during emission
                    source_file: sourcePath,
                    source_line: 0, // would come from AST loc tracking
                    source_column: 0,
                    ir_node_id: mod.id,
                    description: `Method '${method.name}' of ${mod.name}`,
                });
            }
        }
        // Each model maps to its entity declaration
        for (const model of mod.models) {
            mappings.push({
                generated_file: generatedFile,
                generated_line: 0,
                source_file: sourcePath,
                source_line: 0,
                source_column: 0,
                ir_node_id: mod.id,
                description: `Model '${model.name}'`,
            });
        }
        return {
            version: 1,
            source: sourcePath,
            source_hash: sourceHash,
            mappings,
        };
    }
    build(sourcePath, sourceHash) {
        return {
            version: 1,
            source: sourcePath,
            source_hash: sourceHash,
            mappings: this.mappings,
        };
    }
}
exports.SourceMapBuilder = SourceMapBuilder;
//# sourceMappingURL=source_map.js.map