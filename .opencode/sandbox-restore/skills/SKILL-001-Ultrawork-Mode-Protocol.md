# SKILL-001: Ultrawork Mode Protocol

## Origin
- Sessions: ses_2d996f566ffeCYt4hzg1URwIWZ, ses_2d996c1ebffewHQSNbmiPdiA6T, ses_2d98abb15ffeHYk6YLrmTZkr2M, ses_2d985bbfcffe5pvREHS0y30zzS, ses_2d9824285ffeA7GAllMKfj8xqj, ses_2d981878effeLkRXJdX6cSvY2v, ses_2d9816fc0ffeWwLa0SCPmNfvMz, ses_2d9815c06ffeOs0qR1mA6C2FN2, ses_2d9814b71ffeR5vTi0kn5PSzc3, ses_2d98102daffegxVIotOioC3knn
- Projects: unknown
- Date range: 2026-04-01 → 2026-04-01
- Last enriched: 2026-04-01

## Problem
Users need a structured approach to handle complex, high-effort tasks that don't fit standard categories but require substantial effort across multiple systems/modules.

## Solution
The Ultrawork Mode protocol provides a mandatory workflow for high-precision task execution requiring 100% certainty before implementation. It includes:
- Mandatory certainty protocol requiring full understanding before coding
- Exploration and consultation with specialist agents (Oracle for conventional problems, Artistry for non-conventional)
- Zero-tolerance for scope reduction, mockup work, partial completion, assumed shortcuts, premature stopping, or test deletion
- Strict execution rules including TODO tracking, parallel execution, background-first approach, and verification guarantees
- Comprehensive verification requiring proof of functionality, not just type checking

## Implementation
1. **Before writing any code**: Achieve 100% certainty about user requirements
2. **Explore thoroughly**: Use explore/librarian agents to gather all relevant context
3. **Consult specialists**: Delegate to Oracle (conventional) or Artistry (non-conventional) for hard problems
4. **Create precise work plan**: Develop step-by-step implementation approach
5. **Execute with verification**: Test manually, run build/tests, and provide evidence of functionality
6. **Never compromise**: Deliver full implementation, not demos or simplified versions

## Guardrails
- Never start implementation until 100% certain of requirements
- Always explore codebase to understand existing patterns and architecture
- Always have a crystal clear work plan before coding
- Resolve all ambiguity by asking or investigating
- Never deliver partial work or make unauthorized simplifications
- Always execute manual QA as the final gate before reporting completion
- Never delete or skip failing tests to make the build pass

## Confidence
high

## Enrichment History
| Run | Date | New Sessions Added | Notes |
|-----|------|--------------------|-------|
| 1 | 2026-04-01 | 10 sessions | Initial extraction from Wave 1 harvesting |

## Related
- Links to mistake patterns about implementation challenges
- Links to command patterns for Task Master and configuration audit