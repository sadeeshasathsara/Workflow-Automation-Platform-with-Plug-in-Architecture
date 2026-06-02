# Contributing Guidelines

Thank you for your interest in contributing to the Workflow Automation Platform! Please review these guidelines before submitting contributions.

---

## Code of Conduct
By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## How Can I Contribute?

### 1. Reporting Bugs
- Search the open issues list to see if the bug has already been reported.
- If not, open a new issue using the **Bug Report** template.
- Include a clear title, description, steps to reproduce, and environment details.

### 2. Suggesting Enhancements
- Open a new issue utilizing the **Feature Request** template.
- Explain the user story, proposed implementation details, and overall value.

### 3. Submitting Pull Requests
- Fork the repository and create a new branch from `main` named `feature/your-feature-name` or `bugfix/your-fix-name`.
- Write clean, well-documented code that adheres to the established architecture.
- Ensure all automated tests build and pass successfully.
- Submit a Pull Request targeting the `main` branch, filling out the description template fully.

---

## Local Development Setup

### 1. Prerequisites
- **Python** (version 3.10+)
- **Node.js** (version 18.0+)
- **npm** package manager

### 2. Backend Setup
1. Create a virtual environment and activate it:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
2. Install the required libraries:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the development server:
   ```bash
   python api/server.py
   ```

### 3. Frontend Setup
1. Navigate to the frontend workspace:
   ```bash
   cd www
   ```
2. Install package dependencies:
   ```bash
   npm install
   ```
3. Boot up the Vite dev server:
   ```bash
   npm run dev
   ```

---

## Code & Architecture Guidelines

- **Microkernel Pattern**: All new integrations should be decoupled and implemented as plugins under `plugins/`. Refer to the [Plugin Development Guide](docs/plugin_development_guide.md) for more details.
- **Asynchronous Execution**: Prefer asynchronous I/O (`async`/`await`) for any external API or file operations.
- **Secrets Management**: Never commit hardcoded API keys. Always use `.env` files for local development and define secret variables in `settings.xml`.
- **Git Commit Messages**: Use semantic versioning and prefixes for commit messages (e.g. `feat(core):`, `fix(plugins):`, `docs(readme):`, `chore(deps):`).
