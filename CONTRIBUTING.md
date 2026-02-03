# Contributing to nestjs-openapi-static

Thank you for your interest in contributing!

## Prerequisites

- Node.js 20+
- pnpm 10+

## Quick Start

```bash
git clone https://github.com/Newbie012/nestjs-openapi-static.git
cd nestjs-openapi-static
pnpm install
pnpm test
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build the package |
| `pnpm typecheck` | Type check |
| `pnpm lint` | Lint code |
| `pnpm test` | Run all tests |
| `pnpm publint` | Validate package |

## Quality Gate

Run before submitting a PR:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm publint
```

## Documentation

For detailed guidelines, see the `.agents/docs/` folder:

| Topic | File |
|-------|------|
| Architecture & file structure | [.agents/docs/ARCHITECTURE.md](.agents/docs/ARCHITECTURE.md) |
| Testing guidelines | [.agents/docs/TESTING.md](.agents/docs/TESTING.md) |
| Config structure | [.agents/docs/CONFIG.md](.agents/docs/CONFIG.md) |
| Code style & workflow | [.agents/docs/WORKFLOW.md](.agents/docs/WORKFLOW.md) |

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes following guidelines in `.agents/docs/WORKFLOW.md`
3. Run the quality gate
4. Write/update tests (see `.agents/docs/TESTING.md`)
5. Submit PR with clear description

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`

## Questions?

Open an issue if you need help!
