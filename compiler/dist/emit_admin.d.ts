/**
 * BoneScript Admin Panel Emitter
 * Generates a self-contained HTML admin UI from an IRSystem.
 * No build step — single HTML file with Tailwind CDN + vanilla JS.
 */
import * as IR from "./ir";
export declare function emitAdminPanel(system: IR.IRSystem): string;
