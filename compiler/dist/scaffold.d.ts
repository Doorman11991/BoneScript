/**
 * BoneScript Project Scaffolder â€” `bone init`
 * Creates a new BoneScript project with sensible defaults for a chosen domain.
 */
export type ScaffoldDomain = "multiplayer_game" | "saas_platform" | "iot_system" | "social_network" | "marketplace" | "realtime_collaboration";
export interface ScaffoldOptions {
    name: string;
    domain: ScaffoldDomain;
    outDir: string;
}
export declare function scaffold(opts: ScaffoldOptions): {
    created: string[];
};
