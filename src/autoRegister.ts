import fg from "fast-glob";
import { pathToFileURL } from "url";
import { resolve } from "path";
import chalk from "chalk";
import { container as rootContainer, type DependencyContainer } from "tsyringe";
import { performance } from "node:perf_hooks";
import {
  snapshotContainer,
  type ContainerSnapshot,
  type ProviderKind,
} from "./containerIntrospection.js";

/**
 * Default root directory (relative to process.cwd()) used when
 * no `roots` option is provided to {@link autoRegister}.
 *
 * If you want to scan compiled code, call `autoRegister({ roots: ["dist"] })`.
 *
 * @internal
 */
const defaultRoot = "src";

/**
 * Built-in role labels used by the default role detection.
 *
 * You don't have to use these in your own {@link RoleDetector} or
 * {@link IconRenderer}, but they are handy as a convention.
 *
 * @public
 */
export type Role =
  | "registry"
  | "controller"
  | "service"
  | "repository"
  | "usecase"
  | "other";

/**
 * Function signature used to detect a role string from a file path.
 *
 * You can return any string, for example:
 *
 * - `"controller"`
 * - `"service"`
 * - `"infra"`
 * - `"feature:checkout"`
 * - etc.
 *
 * @public
 */
export type RoleDetector = (file: string) => string;

/**
 * Function signature used to render an icon for a given role and file.
 *
 * This is called for each matched file and is typically used to
 * customize CLI output.
 *
 * @public
 */
export type IconRenderer = (role: string, file: string) => string;

/**
 * Options accepted by {@link autoRegister}.
 *
 * @public
 */
export type ScanOptions = {
  /**
   * Root directories (relative to `process.cwd()`) to scan.
   *
   * @defaultValue `["src"]`
   *
   * Example:
   * - `["src"]` for scanning source files
   * - `["dist"]` for scanning compiled files
   */
  roots?: string[];

  /**
   * Glob patterns passed to `fast-glob`.
   *
   * @defaultValue
   * ```ts
   * [
   *   "**\/*.registrar.[tj]s",
   *   "**\/*.registry.[tj]s",
   *   "**\/*.@(controller|repository|usecases|service).[tj]s",
   * ]
   * ```
   */
  patterns?: string[];

  /**
   * If `true`, throws an error when no files are matched.
   *
   * @defaultValue `false`
   */
  strict?: boolean;

  /**
   * Tsyringe container to observe and mutate.
   *
   * @defaultValue root container exported by `tsyringe`
   */
  container?: DependencyContainer;

  /**
   * Custom role detector used to derive a role string from the file path.
   *
   * If omitted, a built-in detector is used that looks at file name
   * fragments like `.controller.`, `.service.`, etc.
   */
  roleDetector?: RoleDetector;

  /**
   * Custom icon renderer used in CLI logs.
   *
   * If omitted, a built-in icon theme is used, mapping known roles
   * to colored glyphs.
   */
  iconRenderer?: IconRenderer;
};

/**
 * Details about registrations added for a given DI token.
 *
 * @public
 */
export type AutoRegisterAddedInfo = {
  /**
   * DI token that gained one or more registrations.
   */
  token: unknown;

  /**
   * List of provider infos added for that token.
   *
   * Each entry contains the provider kind and a human-readable
   * element label (when one can be guessed).
   */
  infos: {
    providerKind: ProviderKind;
    /**
     * Human-readable label for the underlying implementation
     * (e.g. class name, factory name, etc.).
     */
    element?: string;
  }[];
};

/**
 * Result object returned by {@link autoRegister}.
 *
 * @public
 */
export interface AutoRegisterResult {
  /**
   * First root directory used for the scan.
   *
   * This is simply `options.roots[0]` after defaulting.
   */
  root: string;

  /**
   * List of file paths that matched the glob patterns and were imported.
   */
  files: string[];

  /**
   * Total duration (in milliseconds) of scanning + importing + diffing.
   */
  durationMs: number;

  /**
   * Registrations detected as newly added to the container.
   */
  added: AutoRegisterAddedInfo[];
}

/**
 * Default filename-based role detection.
 *
 * This is only used when no custom {@link RoleDetector} is provided.
 *
 * @param file - File path relative to the working directory.
 * @returns One of the built-in {@link Role} values.
 *
 * @internal
 */
function detectRole(file: string): Role {
  const lower = file.toLowerCase();

  if (lower.includes(".registry.") || lower.includes(".registrar.")) {
    return "registry";
  }
  if (lower.includes(".controller.")) {
    return "controller";
  }
  if (lower.includes(".service.")) {
    return "service";
  }
  if (lower.includes(".repository.")) {
    return "repository";
  }
  if (lower.includes(".usecase.") || lower.includes(".usecases.")) {
    return "usecase";
  }
  return "other";
}

/**
 * Default CLI icon theme used when no custom {@link IconRenderer} is provided.
 *
 * Known roles use colored glyphs; any unknown role receives a white bullet.
 *
 * @param role - Role string (built-in or custom).
 *
 * @internal
 */
function defaultIcon(role: string): string {
  switch (role as Role) {
    case "controller":
      return chalk.blue("◎");
    case "service":
      return chalk.green("◆");
    case "repository":
      return chalk.magenta("◈");
    case "registry":
      return chalk.cyan("⬢");
    case "usecase":
      return chalk.yellow("⬡");
    case "other":
      return chalk.white("•");
    default:
      return chalk.white("•");
  }
}

/**
 * Formats a token into a human-readable label for logging purposes.
 *
 * @param token - DI token value.
 *
 * @internal
 */
function formatToken(token: unknown): string {
  if (typeof token === "string") return `token "${token}"`;
  if (typeof token === "symbol") return token.toString();
  if (typeof token === "function" && token.name) return `class ${token.name}`;
  return String(token);
}

/**
 * Formats a {@link ProviderKind} into a label similar to tsyringe's options
 * (`useClass`, `useValue`, etc.).
 *
 * @param kind - Provider kind.
 *
 * @internal
 */
function formatProviderKind(kind: ProviderKind): string {
  switch (kind) {
    case "class":
      return "useClass";
    case "value":
      return "useValue";
    case "factory":
      return "useFactory";
    case "token":
      return "useToken";
    default:
      return "unknown";
  }
}

/**
 * Computes a diff between two container snapshots to determine which
 * registrations were added between `before` and `after`.
 *
 * @param before - Snapshot taken before file imports.
 * @param after - Snapshot taken after file imports.
 * @param container - Container used to resolve factory deps (for introspection).
 *
 * @internal
 */
function diffSnapshots(
  before: ContainerSnapshot,
  after: ContainerSnapshot,
  container?: DependencyContainer
): AutoRegisterAddedInfo[] {
  const added: AutoRegisterAddedInfo[] = [];

  for (const [token, infosAfter] of after.byToken.entries()) {
    const infosBefore = before.byToken.get(token) ?? [];
    if (infosAfter.length > infosBefore.length) {
      added.push({
        token,
        infos: infosAfter.slice(infosBefore.length).map((i) => ({
          providerKind: i.providerKind,
          element: getClassName(i.provider, container),
        })),
      });
    }
  }

  return added;
}

/**
 * Attempts to derive a human-readable name for a provider implementation:
 *
 * - useClass → class name
 * - useValue → constructor name / primitive type
 * - useFactory → name or return type name (in dev)
 * - useToken → formatted token reference
 *
 * @param element - Provider object as stored by tsyringe.
 * @param container - Container used for factory execution in dev.
 *
 * @internal
 */
function getClassName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: any,
  container?: DependencyContainer
): string | undefined {
  if (element.useClass) {
    return element.useClass.name || "(anonymous class)";
  }

  if (Object.prototype.hasOwnProperty.call(element, "useValue")) {
    const v = element.useValue;
    if (v === null) return "null";
    if (typeof v === "object" && v?.constructor?.name) {
      return v.constructor.name;
    }
    return typeof v;
  }

  if (element.useFactory) {
    if (process.env.NODE_ENV === "production") {
      return `factory(${element.useFactory.name || "anonymous"})`;
    }
    return introspectFactoryReturnTypeName(element.useFactory, container);
  }

  if (element.useToken) {
    const t = element.useToken;
    if (typeof t === "string") return `token("${t}")`;
    if (typeof t === "function" && t.name) return `token(class ${t.name})`;
    if (typeof t === "symbol") return `token(${t.toString()})`;
    return "token";
  }

  return undefined;
}

/**
 * Attempts to introspect the name of the value returned by a factory.
 *
 * ⚠️ This is only used in non-production environments and may execute the factory.
 *
 * @param factory - Factory function as stored in the registration.
 * @param container - Container passed to the factory when it expects arguments.
 *
 * @internal
 */
function introspectFactoryReturnTypeName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  factory: any,
  container?: DependencyContainer
): string | undefined {
  try {
    const result =
      factory.length > 0 && container ? factory(container) : factory();

    if (result?.constructor?.name) {
      return result.constructor.name;
    }

    return `factory(${factory.name || "anonymous"})`;
  } catch {
    return `factory(${factory.name || "anonymous"})`;
  }
}

/**
 * Scans your project for DI-related files, imports them for their side-effects,
 * and prints a diff of tsyringe container registrations.
 *
 * Steps:
 * 1. Take a snapshot of the container.
 * 2. Resolve glob patterns and import each matching file.
 * 3. Take another snapshot of the container.
 * 4. Compute and log the diff (new registrations only).
 *
 * @param options - {@link ScanOptions} controlling scan roots, patterns, etc.
 * @returns A {@link AutoRegisterResult} with scan metrics and added registrations.
 *
 * @public
 */
export async function autoRegister({
  roots = [defaultRoot],
  patterns = [
    "**/*.registrar.[tj]s",
    "**/*.registry.[tj]s",
    "**/*.@(controller|repository|usecases|service).[tj]s",
  ],
  strict = false,
  container = rootContainer,
  roleDetector,
  iconRenderer,
}: ScanOptions = {}): Promise<AutoRegisterResult> {
  const globs = roots.flatMap((r) => patterns.map((p) => `${r}/${p}`));
  const start = performance.now();

  // Snapshot container before imports
  const before = snapshotContainer(container);

  // Find matching files
  const files = await fg(globs, { dot: false, ignore: ["**/*.d.ts"] });
  if (!files.length && strict) {
    throw new Error(`autoRegister: no files matched: ${globs.join(", ")}`);
  }

  // Import each file to trigger its registration side-effects
  const projectRoot = process.cwd();
  await Promise.all(
    files.map(async (f) => {
      const full = resolve(projectRoot, f);
      await import(pathToFileURL(full).href);
    })
  );

  // Snapshot after imports
  const after = snapshotContainer(container);
  const durationMs = performance.now() - start;
  const added = diffSnapshots(before, after, container);

  // --- CLI output ---

  console.log("");
  console.log(chalk.cyan("  DI auto-registration"));
  console.log(chalk.cyan("  ─────────────────────"));
  console.log(
    `  Roots: ${chalk.green(roots.join(", "))}   (${
      files.length
    } files, ${durationMs.toFixed(1)} ms)`
  );

  if (!files.length) {
    console.log(chalk.yellow("  No files loaded."));
  } else {
    console.log("\n  Files:");
    files.forEach((file) => {
      const role = (roleDetector ?? detectRole)(file);
      const icon = iconRenderer ? iconRenderer(role, file) : defaultIcon(role);
      console.log(`    ${icon} ${chalk.gray(file)} (${role})`);
    });
  }

  console.log("\n  New container registrations:");

  if (!added.length) {
    console.log(chalk.yellow("    No new registrations detected."));
  } else {
    added.forEach(({ token, infos }) => {
      const label = formatToken(token);
      const kinds = infos
        .map((i) => formatProviderKind(i.providerKind))
        .join(", ");
      const elems = infos.map((i) => i.element).join(", ");
      console.log(
        `    ${chalk.green("✔")} ${chalk.white(label)} → ${chalk.cyan(
          kinds
        )} { ${elems} }`
      );
    });
  }

  console.log("");

  return { root: roots[0]!, files, durationMs, added };
}
