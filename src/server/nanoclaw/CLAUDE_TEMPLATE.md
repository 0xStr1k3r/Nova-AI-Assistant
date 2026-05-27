# CLAUDE.md Template

This file is the per-agent workspace descriptor used by Nova when running agent containers.

- Agent Group ID: {{agentGroupId}}
- Created: {{createdAt}}

## Purpose
Brief description of agent group's purpose, policies, and limits.

## Allowed Actions
- list of allowed connectors and commands

## Security Notes
- Credentials are injected at runtime via OneCLI vault
- No secrets stored in this file

## Example
Use this file to tune agent persona and allowed actions.
