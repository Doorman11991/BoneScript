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
import * as IR from "./ir";
export declare function emitAdminPanel(system: IR.IRSystem): string;
