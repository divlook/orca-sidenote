# Documentation maintenance

Use this procedure when asked to maintain documentation, before marking implementation complete, or before a release. Keep repository documentation in English.

## 1. Set the scope

- For implementation completion, review guidance affected by the changed behavior. Update it only where the change makes an instruction inaccurate or leaves a gap that affects use, maintenance, or verification.
- Before a release, also cover installation, compatibility, permissions, distribution, and recovery instructions affected by the release.
- For a repository-wide documentation request, cover all maintained documents and their connections. Include generated documents in consistency checks, but update them through their owning workflow.

Use [Agent guidance](../AGENTS.md#read-by-task) to locate documents by topic. Follow related links only when needed to resolve an in-scope claim or changed reference. Read the [Glossary](../GLOSSARY.md) when product terms are involved.

Prefer an edit in the authoritative document. Add material only if it changes a reader's action, explains a non-obvious constraint or ownership decision, or supplies a missing verification condition. Keep code-discoverable details in the code and per-change results in the change report.

Complete this step when each affected topic has either a necessary correction or gap to address, or existing guidance that remains sufficient. An implementation change may need no guide edits; release-entry requirements are separate.

## 2. Check facts against evidence

Compare each affected claim with the source that owns it:

- Behavior and failure handling: current implementation and relevant tests. Separate intended behavior from observed verification results.
- Commands, dependencies, versions, and permissions: package scripts, manifest, build configuration, workflows, and installed CLI help.
- External requirements: current official documentation. Link the source for requirements that can change outside this repository.
- Product terminology: the Glossary. Resolve a terminology conflict there before changing the same concept elsewhere.

Preserve storage identities, data-loss warnings, approval boundaries, limits, and recovery conditions. Document an implementation mismatch explicitly. A prose edit alone does not repair a code defect.

Complete this step when every affected claim has supporting evidence or an explicit unresolved issue. If a source is unavailable, report the missing source rather than guessing.

## 3. Repair structure and connections

Keep each rule or procedure in one authoritative location. Link to that location from other documents instead of copying the explanation.

Keep `AGENTS.md` short. Each document pointer must name the task conditions that require reading its target. Add or adjust a pointer when a document becomes necessary for a task.

Keep prerequisites and warnings before the actions they govern. Group a concept's rules and exceptions together. Split material only when distinct tasks need different references.

Remove obsolete instructions, duplicate explanations, and accumulated work logs that no longer guide a task. Keep current verification procedures in [Verification](VERIFICATION.md) and per-change results in the change report. Preserve user-authored notes and historical release entries.

Complete this step when changed guidance has an entry path, links to renamed or removed headings are updated, and removed passages are obsolete, redundant, or unnecessary for the task.

## 4. Improve the writing

Keep clear text unchanged. Repair sentences that make the reader guess the actor, action, condition, or consequence. Preserve obligation strength, uncertainty, identifiers, and exceptions.

For README changes, lead with the product's concrete value and the shortest supported path to using it. Keep limitations and storage or backup risks visible before they affect the reader's decision.

When these editing skills are available, use them for their respective tasks:

- `writing-for-agents`: instruction structure, document pointers, and completion criteria.
- `writing-quality-editor`: awkward prose and reader flow.
- `asd-ste100`: ambiguous technical instructions. Preserve necessary precision rather than claiming certified STE compliance.
- `copywriting`, then `copy-editing`: README messaging and final copy review.

The skills guide the editing method. Repository evidence and safety contracts determine what the text may claim.

Complete this step when each edit fixes an identified reader problem without introducing an unsupported claim or losing a condition.

## 5. Verify and report

Follow the documentation-only checks in [Verification](VERIFICATION.md#runtime-configuration-and-dependencies). Check links, target headings, and commands introduced or affected by the edits. Check incoming links when a file or heading moves or is removed. Verify new or changed external requirements against their official sources.

Use [Contributing](../CONTRIBUTING.md#prepare-a-change) as the authority for generated files and release entries. [Release](RELEASE.md#prepare-a-distribution) owns distribution checks, which are separate from this procedure. Documentation maintenance alone does not authorize a commit, version bump, release, access approval, or changes to user data.

Finish when the scoped corrections and their checks are complete; unchanged guidance may remain unchanged. Report changed documents, material corrections or removals, checks performed, and unresolved issues. An unresolved in-scope contradiction means the work is incomplete.
