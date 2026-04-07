{{#if context}}
{{SECTION_SEPERATOR "Background"}}
<context>
{{context}}
</context>
{{/if}}

{{#if waveId}}
{{SECTION_SEPERATOR "Wave"}}
<wave id="{{waveId}}">
{{#if waveGoal}}{{waveGoal}}{{else}}Complete this delegated wave item and return a result.{{/if}}
</wave>
{{/if}}

{{#if ownedPaths.length}}
{{SECTION_SEPERATOR "Ownership"}}
You own the following paths for this task:
{{#each ownedPaths}}
- `{{this}}`
{{/each}}

{{#if agentProfile.delegation.toolScopes}}
Your path ownership does not override tool-scoped permissions. Respect the narrower scope for each write-capable tool.
{{/if}}

{{/if}}
{{SECTION_SEPERATOR "Task"}}
Your assignment is below. Your work begins now.
<goal>
{{assignment}}
</goal>
