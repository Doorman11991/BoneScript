/**
 * BoneScript Deploy Target Emitter
 * Generates Dockerfile, k8s manifests, and GitHub Actions CI/CD.
 */
import * as IR from "./ir";
export declare function emitDockerfile(system: IR.IRSystem): string;
export declare function emitDockerignore(): string;
export declare function emitK8sDeployment(system: IR.IRSystem): string;
export declare function emitGithubActions(system: IR.IRSystem): string;
