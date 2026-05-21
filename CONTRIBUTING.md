# Contributing to shipway

Thank you for your interest in contributing to shipway!

## Development Setup

```bash
git clone https://github.com/berna/shipway.git
cd shipway
npm install
npm run dev -- --help
```

## Running Tests

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
npm run lint    # check
npm run format  # auto-fix
```

## Project Structure

- `src/` — TypeScript source
- `bin/` — compiled output (gitignored)
- `tests/` — unit and integration tests
- `docs/` — documentation
- `examples/` — example configs

## Pull Requests

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Run `npm test && npm run lint` before submitting
4. Include a changeset (`npx changeset`) for user-visible changes
