# @ton-scope/tsyringe-auto-register

Utility to **auto-register** `tsyringe` dependencies by scanning your project, importing files (side effects) and displaying a clear diff of what was added to the DI container.

- 🔍 Auto-scan of files (customizable patterns)
- 🧭 Role detection **customizable via free-form string**
- 🎨 Fully customizable CLI icons
- 🧠 Container introspection via `snapshotContainer`
- 🔄 ESM + CommonJS builds

> ⚠️ This library uses **internal** `tsyringe` APIs (`_registry`). It is great for **debugging**, tooling, CLIs, or application bootstrap, but should not be considered a stable public API surface.

## Installation

```bash
npm install @ton-scope/tsyringe-auto-register tsyringe reflect-metadata
```

## Quick start

```ts
import "reflect-metadata";
import { container } from "tsyringe";
import { autoRegister } from "@ton-scope/tsyringe-auto-register";

async function bootstrap() {
  await autoRegister({
    roots: ["src"],
    strict: true,
    container,
  });

  // const app = container.resolve(App);
  // app.start();
}

bootstrap();
```

## Custom role detection

```ts
import {
  autoRegister,
  type RoleDetector,
  type IconRenderer,
} from "@ton-scope/tsyringe-auto-register";

const roleDetector: RoleDetector = (file) => {
  if (file.includes("/controllers/")) return "controller";
  if (file.includes("/services/")) return "service";
  if (file.includes("/repositories/")) return "repository";
  return "other";
};

const iconRenderer: IconRenderer = (role, file) => {
  switch (role) {
    case "controller":
      return "🎮";
    case "service":
      return "⚙️";
    case "repository":
      return "💾";
    default:
      return "•";
  }
};

await autoRegister({
  roots: ["src"],
  roleDetector,
  iconRenderer,
});
```

## Types

```ts
export type RoleDetector = (file: string) => string;
export type IconRenderer = (role: string, file: string) => string;

export type ScanOptions = {
  roots?: string[];
  patterns?: string[];
  strict?: boolean;
  container?: import("tsyringe").DependencyContainer;
  roleDetector?: RoleDetector;
  iconRenderer?: IconRenderer;
};
```

## License

MIT
