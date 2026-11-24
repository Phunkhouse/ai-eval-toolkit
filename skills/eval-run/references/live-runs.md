# Live runs

A live run calls the real feature or model. It costs money, takes time, sends the dataset's inputs and sources to whoever serves the model, and produces nondeterministic results.

## Before asking for approval

1. The suite must have a `live` target and `limits` with at least `maxRequests`. To bound cost, it needs `maxCostUsd`, `pricing` (with its source and the date it was checked) and `maxOutputTokensPerRequest`, and the adapter must pass `ctx.maxOutputTokens` to the provider. If any is missing, propose it; do not invent prices. Check current prices on the provider's pricing page, or ask.
2. The adapter must turn off its SDK's automatic retries, so every request is counted by the guard, and must report token usage when the provider returns it.
3. Run the plan: `node evals/<name>/<name>.eval.ts --live --dry-run`. It prints the number of cases, the limits, the worst case if every attempt runs and how many cases fit. Nothing is called.

## Asking

Show the user, in one message:

- provider and model, and where the adapter's credentials come from (an environment variable, never a file in the repository);
- what data leaves the machine: the cases' inputs and sources, and whether any of it is real or sensitive;
- the dry-run output: cases, maximum requests, worst-case cost, timeout, concurrency;
- whether responses will be recorded (`--record evals/<name>/responses.recorded.json`) and whether that file will be committed.

Then ask for a yes for this run. Approval covers this run with these limits only.

## Running

```bash
node evals/<name>/<name>.eval.ts --live --record evals/<name>/responses.recorded.json --out evals/<name>/results/<label>-live
```

- Live runs refuse to start inside Vitest and when `CI` is set (unless `AI_EVAL_ALLOW_LIVE_IN_CI=1`), so ordinary tests and CI never trigger them.
- `--max-requests` and `--max-cost-usd` may lower the suite's limits for a first, smaller run. Never raise a limit without asking.
- If the run stops at a limit, the report says so and lists the cases not run as skipped. Report that; do not rerun with larger limits without a new approval.

## What the guard does and does not guarantee

- It reserves each request's worst case (one request, estimated input tokens, the per-request output cap, their cost) before the request starts, including retries and requests running in parallel, and refuses to start a request that could exceed a limit.
- After a response, it replaces the reservation with the reported usage. Requests with unknown usage (errors, timeouts) keep their worst case, because the provider may still charge for them.
- Costs are **estimates** from token counts and the given prices unless the target reports a provider-billed cost. They are not billing records; check the provider console for charges.
- Input tokens are estimated before sending; a response that exceeds its reservation (an adapter that ignores the output cap, a target making extra calls) is recorded as an overrun and stops the run, but that spend has already happened.
- A target that makes several provider calls per case must report their combined usage and `providerRequests`; otherwise the guard undercounts.

## After a live run

- Say how many requests ran, the estimated cost, retries, errors and timeouts, and whether the run was complete.
- One live run is one sample of nondeterministic behavior. Before acting on a small difference, rerun or replay recorded responses.
- Recorded responses replay the same outputs offline at no cost; use them to iterate on evaluators, not on the model.
