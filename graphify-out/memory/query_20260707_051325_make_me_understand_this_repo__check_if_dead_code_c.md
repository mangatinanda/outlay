---
type: "query"
date: "2026-07-07T05:13:25.114660+00:00"
question: "Make me understand this repo; check if dead code cleanup is needed."
contributor: "graphify"
source_nodes: ["useCurrency", "useFormatCurrency", "getCurrentHousehold", "schema.ts", "logActivity()", "cn()", "activity.ts"]
---

# Q: Make me understand this repo; check if dead code cleanup is needed.

## Answer

Expanded from original query via vocab: [expense, household, settle, activity, dashboard, category, member, settlement, import, export, currency, money]. BFS traversal + degree analysis over graph.json (2958 nodes), then grep-verified every zero-reference candidate. Repo layers: schema.ts is the data hub feeding queries/ (getCurrentHousehold god node, 41 edges) and per-feature action files (expense/category/member/settlement/import/invite/household-actions), all wrapped in safeAction and all logging to the append-only activity feed via logActivity (activity.ts imports from every action file). UI communities: dashboard charts, expense form, settle-up view, management UIs, all bridged by cn() (84 edges) and useFormatCurrency (18 edges). Dead-code verdict: codebase is clean - no dead files, no dead components. Findings: (1) useCurrency (src/components/providers/currency-provider.tsx L24) is genuinely dead - zero consumers, everything uses useFormatCurrency (8 consumers). (2) 14 exported types never referenced anywhere: 5 Drizzle New* insert types (schema.ts L187-193) and 9 validator types (*FormData, ImportPayload, ImportRow, MemberResolution) - conventional API-symmetry exports, harmless. (3) ~14 symbols exported but only used module-internally (export keyword removable): ActivityAction, CleanupResult, CATEGORY_PRESETS, DEFAULT_LIMITS, RateLimitOptions, RateLimitResult, MemberPaid, SettlementRow, Transfer, AccentPair, importRowSchema, memberResolutionSchema, HouseholdSummary, HeaderUser. Graph false positives verified as used: toPdfBlob/toXlsxBlob (dynamic import in export-button), Next.js convention exports (page/layout/route/loading/proxy.ts/sw.ts), module-private helpers (checkOwnership, householdById, revalidateAll, setCurrentHousehold, csvEscape, encoder, listeners).

## Source Nodes

- useCurrency
- useFormatCurrency
- getCurrentHousehold
- schema.ts
- logActivity()
- cn()
- activity.ts