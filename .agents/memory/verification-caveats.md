---
name: Verifying inline helper checks
description: A successful runner exit can occur without the intended inline TypeScript checks executing.
---

Require explicit test-result output, not only an exit status, when running inline TypeScript helper checks.

**Why:** In this environment, the filtered scripts-workspace runner with a custom frontend `--tsconfig` and `--eval` exited successfully without executing even a leading console message. Removing the custom config and using directly resolvable helper imports produced the expected assertions and result output.

**How to apply:** Keep pure helpers runnable independently of browser-only aliases when practical. If an inline check exits silently, treat it as unverified and use a runner configuration that visibly executes the assertions before reporting success.
