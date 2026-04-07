---
name: {{jsonStringify name}}
description: {{jsonStringify description}}
{{#if allowedTools}}allowedTools: {{jsonStringify allowedTools}}
{{/if}}{{#if deniedTools}}deniedTools: {{jsonStringify deniedTools}}
{{/if}}{{#if canSpawnAgents}}canSpawnAgents: true
{{/if}}{{#if turnBudget}}turnBudget: {{jsonStringify turnBudget}}
{{/if}}{{#if useWorktree}}useWorktree: true
{{/if}}{{#if compactionOverrides}}compactionOverrides: {{jsonStringify compactionOverrides}}
{{/if}}{{#if model}}model: {{jsonStringify model}}
{{/if}}{{#if thinkingLevel}}thinking-level: {{jsonStringify thinkingLevel}}
{{/if}}{{#if blocking}}blocking: true
{{/if}}{{#if role}}role: {{jsonStringify role}}
{{/if}}{{#if orchestrationRole}}orchestrationRole: {{jsonStringify orchestrationRole}}
{{/if}}{{#if readOnly}}readOnly: true
{{/if}}{{#if editScopes}}editScopes: {{jsonStringify editScopes}}
{{/if}}{{#if output}}output: {{jsonStringify output}}
{{/if}}---
{{body}}
