# Contributing to @justedou/tsyringe-auto-register

First off, thank you for taking the time to contribute 💚

This project aims to provide a small but **high-quality developer experience
tool** for `tsyringe`. Bug reports, documentation improvements and new ideas
are all welcome.

## 🧱 Project goals

- Keep the library **small, focused and well documented**
- Provide a **great CLI experience** (clear output, helpful errors)
- Make it easy to plug the library into **real-world architectures**

If you are unsure whether an idea fits, feel free to open an issue first.

---

## 🐛 Reporting bugs

1. Search in the issue tracker to see if it is already reported.
2. Include:
   - Node.js version
   - `tsyringe` version
   - OS
   - Minimal reproduction steps or repo, if possible
   - The exact CLI output / stack trace

---

## 💡 Suggesting features

Please open an issue labelled **enhancement** and describe:

- The problem you are facing
- How you currently work around it
- What an ideal solution would look like (from a UX perspective)

Implementation details can be discussed in the issue or a pull request.

---

## 🔧 Development setup

```bash
git clone https://github.com/antoineTsinga/tsyringe-auto-register.git
cd tsyringe-auto-register
npm install
npm run build
npm test   # if/when tests are added
```

Useful scripts:

- `npm run build` – build ESM + CJS output
- `npm run build:types` – run API Extractor to bundle type definitions
- `npm run docs` – generate TypeDoc documentation

---

## 📦 Commit style

This project uses **semantic-release** with **Conventional Commits**.

Examples:

- `feat: add custom icon renderer`
- `fix: handle empty container snapshot`
- `docs: improve README quick start`
- `chore: update dependencies`

This keeps the changelog and releases automated and consistent.

---

## 🤝 Code style

- Write TypeScript with strict types enabled
- Prefer small, focused functions
- Keep the public API surface minimal and well documented (TSDoc)
- Avoid breaking changes unless clearly justified

---

## 📜 Code of Conduct

By participating in this project, you agree to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

Thank you again for contributing!
