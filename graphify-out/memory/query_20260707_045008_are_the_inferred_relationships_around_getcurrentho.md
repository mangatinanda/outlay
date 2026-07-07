---
type: "query"
date: "2026-07-07T04:50:08.236294+00:00"
question: "Are the INFERRED relationships around getCurrentHousehold (with AppLayout() and getCurrentActor) actually correct, and what does the node reveal about the auth boundary?"
contributor: "graphify"
source_nodes: ["getCurrentHousehold", "getCurrentActor", "AppLayout()", "assertCanAccessHousehold()", "isMember()", "userHouseholds()", "listHouseholds"]
---

# Q: Are the INFERRED relationships around getCurrentHousehold (with AppLayout() and getCurrentActor) actually correct, and what does the node reveal about the auth boundary?

## Answer

Expanded from original query via vocab: [current, household, actor, membership, assert, access, boundary, isolation, superadmin, scoping, layout, guard]. Then traversed BFS depth=2 from Actor/Household plus explain on getCurrentHousehold (41 edges). Both INFERRED edges are CONFIRMED against source: (1) AppLayout() calls getCurrentHousehold() at src/app/(app)/layout.tsx L26 inside Promise.all([getCurrentHousehold(), listHouseholds(), auth(), getCurrentActor()]); (2) getCurrentHousehold calls getCurrentActor() at src/lib/queries/household-queries.ts L27 as its first statement. The neighborhood reveals a single-chokepoint auth boundary: every page and every mutating server action (expense-actions, member-actions, category-actions, settlement-actions, import-actions, invite-actions) resolves the active household through getCurrentHousehold, which never trusts the he_household cookie alone - a user gets the cookie household only if isMember(actor.userId, id) passes (household-queries.ts L41), else their first membership, else null; superadmin bypasses membership. Guards live in src/lib/auth/membership.ts (isMember L6, userHouseholds L25, assertCanAccessHousehold L44). React cache() ensures one consistent resolution per request.

## Source Nodes

- getCurrentHousehold
- getCurrentActor
- AppLayout()
- assertCanAccessHousehold()
- isMember()
- userHouseholds()
- listHouseholds