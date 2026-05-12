# SKILL-002: Model Configuration Audit

## Origin
- Sessions: Multiple sessions showed evidence of model configuration work
- Projects: unknown
- Date range: 2026-04-01 → 2026-04-01
- Last enriched: 2026-04-01

## Problem
Users need to verify and fix OpenCode model configurations, ensuring provider models match official documentation, checking schema compliance, adding new models, and correcting context/output limits.

## Solution
A systematic approach to auditing and fixing OpenCode model configurations:
1. Verify provider models against official documentation
2. Check schema compliance for model configurations
3. Add new models when they're not present in the configuration
4. Correct context and output limits that don't match provider specifications
5. Validate model cards for accuracy
6. Fix any misconfigured model settings

## Implementation
- Use the `/config-audit` slash command to initiate the audit process
- The command will automatically verify models against official documentation
- It checks for schema compliance and reports any violations
- New models can be added through the command interface
- Context and output limits are corrected to match provider specifications
- Model cards are validated for accuracy and completeness

## Guardrails
- Always verify against official provider documentation, not third-party sources
- Ensure schema compliance before accepting any model configuration
- When adding new models, verify they're officially supported by the provider
- Context limits should not exceed what the provider officially supports
- Output limits should be reasonable for the model's capabilities
- Regularly audit configurations as providers update their models

## Confidence
high

## Enrichment History
| Run | Date | New Sessions Added | Notes |
|-----|------|--------------------|-------|
| 1 | 2026-04-01 | Multiple sessions | Initial extraction from Wave 1 harvesting |

## Related
- Links to COMMAND-001: Task Master AI CLI (for task management during audit)
- Links to Ultrawork Mode protocol (for execution framework)