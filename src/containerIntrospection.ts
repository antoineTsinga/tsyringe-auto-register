import type { DependencyContainer } from "tsyringe";

/**
 * Kind of provider registered in tsyringe.
 *
 * This is a normalized view of tsyringe's registration formats:
 * - "useClass"   → "class"
 * - "useValue"   → "value"
 * - "useFactory" → "factory"
 * - "useToken"   → "token"
 * - unknown / other forms → "unknown"
 *
 * @public
 */
export type ProviderKind = "class" | "value" | "factory" | "token" | "unknown";

/**
 * Normalized information about a single registration entry.
 *
 * This is built from tsyringe's internal registration object.
 *
 * @public
 */
export interface RegistrationInfo {
  /**
   * Token used in the DI container.
   *
   * This can be:
   * - a class/constructor
   * - a string
   * - a symbol
   * - any other value used as a tsyringe token
   */
  token: unknown;

  /**
   * Normalized kind of provider (class, value, factory, token, unknown).
   */
  providerKind: ProviderKind;

  /**
   * Provider object as exposed by tsyringe.
   *
   * Usually one of:
   * - \{ useClass: Ctor \}
   * - \{ useValue: any \}
   * - \{ useFactory: Function \}
   * - \{ useToken: Token \}
   * - or the raw registration itself, depending on tsyringe version.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any;

  /**
   * Raw internal registration object from tsyringe.
   *
   * This is the untouched data as stored in `container._registry`.
   * It is intentionally not typed because it can change between tsyringe versions.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
}

/**
 * Snapshot of a tsyringe container.
 *
 * It represents the state of the container at a given time,
 * grouped by token.
 *
 * @public
 */
export interface ContainerSnapshot {
  /**
   * Mapping from token → list of registration info entries.
   *
   * A token can have multiple registrations attached.
   */
  byToken: Map<unknown, RegistrationInfo[]>;
}

/**
 * Creates a snapshot of tsyringe's internal registry.
 *
 * ⚠️ Uses private APIs (`_registry`); this is intended for
 * debugging, tooling, and inspection only.
 *
 * @param container - The tsyringe container to inspect.
 * @returns A {@link ContainerSnapshot} describing all known registrations.
 *
 * @public
 */
export function snapshotContainer(
  container: DependencyContainer
): ContainerSnapshot {
  const internal = container as any;
  const registry = internal._registry;

  if (!registry || typeof registry.entries !== "function") {
    return { byToken: new Map() };
  }

  const byToken = new Map<unknown, RegistrationInfo[]>();

  for (const [token, registrations] of registry.entries() as Iterable<
    [unknown, any[]]
  >) {
    const infos: RegistrationInfo[] = registrations.map((reg: any) => {
      const provider = reg.provider ?? reg;
      let providerKind: ProviderKind = "unknown";

      if (provider.useClass) providerKind = "class";
      else if (provider.useValue !== undefined) providerKind = "value";
      else if (provider.useFactory) providerKind = "factory";
      else if (provider.useToken) providerKind = "token";

      return {
        token,
        providerKind,
        provider,
        raw: reg,
      };
    });

    byToken.set(token, infos);
  }

  return { byToken };
}
