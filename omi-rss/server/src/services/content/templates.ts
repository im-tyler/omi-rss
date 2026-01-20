import { ContentTemplate, ContentType } from './types';

export const defaultTemplates: ContentTemplate[] = [
  {
    id: 'weekly-newsletter',
    name: 'Weekly Newsletter',
    description: 'Professional weekly newsletter summarizing top articles',
    type: ContentType.NEWSLETTER,
    variables: [
      {
        name: 'companyName',
        type: 'text',
        description: 'Your company or newsletter name',
        required: true,
        default: 'Omi RSS Weekly',
      },
      {
        name: 'greeting',
        type: 'text',
        description: 'Opening greeting',
        required: false,
        default: 'Hello readers,',
      },
      {
        name: 'sections',
        type: 'select',
        description: 'Sections to include',
        required: true,
        options: ['highlights', 'analysis', 'recommendations', 'upcoming'],
        default: ['highlights', 'analysis'],
      },
    ],
    template: `
# {{companyName}} - Week of {{date}}

{{greeting}}

Welcome to this week's edition of {{companyName}}. Here's what caught our attention:

## 🌟 This Week's Highlights

{{#each articles}}
### {{title}}
*From {{feedTitle}} • {{publishedDate}}*

{{summary}}

[Read more →]({{url}})

---
{{/each}}

## 📊 Weekly Analysis

{{analysis}}

## 🎯 Recommended Reading

{{recommendations}}

## 📅 Coming Next Week

{{upcoming}}

---

*Thank you for reading {{companyName}}. Reply with your thoughts or suggestions.*
`,
    category: 'newsletter',
    isPublic: true,
  },
  {
    id: 'linkedin-post',
    name: 'LinkedIn Article Post',
    description: 'Professional LinkedIn post about an article',
    type: ContentType.SOCIAL_MEDIA,
    variables: [
      {
        name: 'hook',
        type: 'text',
        description: 'Opening hook',
        required: true,
      },
      {
        name: 'includeStats',
        type: 'boolean',
        description: 'Include statistics',
        required: false,
        default: true,
      },
      {
        name: 'cta',
        type: 'select',
        description: 'Call to action',
        required: true,
        options: ['thoughts', 'share', 'discuss', 'learn'],
        default: 'thoughts',
      },
    ],
    template: `
{{hook}}

Key insights from "{{articleTitle}}":

{{#if includeStats}}
📊 The numbers:
{{statistics}}
{{/if}}

💡 Main takeaways:
{{keyPoints}}

🎯 Why this matters:
{{implications}}

{{#if cta.thoughts}}
What are your thoughts on this? I'd love to hear your perspective.
{{/if}}
{{#if cta.share}}
Found this valuable? Share it with your network.
{{/if}}
{{#if cta.discuss}}
Let's discuss - what's your experience with this?
{{/if}}

{{hashtags}}

[Article link]
`,
    category: 'social',
    isPublic: true,
  },
  {
    id: 'podcast-outline',
    name: 'Podcast Episode Outline',
    description: 'Structured outline for podcast episode',
    type: ContentType.PODCAST_SCRIPT,
    variables: [
      {
        name: 'podcastName',
        type: 'text',
        description: 'Podcast name',
        required: true,
      },
      {
        name: 'episodeNumber',
        type: 'number',
        description: 'Episode number',
        required: false,
      },
      {
        name: 'duration',
        type: 'select',
        description: 'Target duration',
        required: true,
        options: ['15min', '30min', '45min', '60min'],
        default: '30min',
      },
    ],
    template: `
# {{podcastName}} {{#if episodeNumber}}Episode {{episodeNumber}}{{/if}}
## "{{episodeTitle}}"

### Episode Overview
- **Duration**: {{duration}}
- **Topics**: {{topics}}
- **Guest**: {{guest}}

### Introduction (2-3 minutes)
[MUSIC FADE IN]

Host: "Welcome to {{podcastName}}! I'm your host, and today we're diving into..."

{{introduction}}

### Segment 1: Context & Background ({{segment1Duration}})
{{segment1Content}}

**Key Points:**
- {{point1}}
- {{point2}}
- {{point3}}

[TRANSITION MUSIC]

### Segment 2: Deep Dive ({{segment2Duration}})
{{segment2Content}}

**Discussion Topics:**
{{discussionPoints}}

### Segment 3: Implications & Takeaways ({{segment3Duration}})
{{segment3Content}}

### Closing (2-3 minutes)
{{closing}}

Host: "That's all for today's episode. Don't forget to..."

[MUSIC FADE OUT]

### Show Notes
{{showNotes}}

### Resources Mentioned
{{resources}}
`,
    category: 'podcast',
    isPublic: true,
  },
  {
    id: 'twitter-thread',
    name: 'Twitter Thread',
    description: 'Multi-tweet thread for complex topics',
    type: ContentType.THREAD,
    variables: [
      {
        name: 'threadLength',
        type: 'number',
        description: 'Number of tweets',
        required: true,
        default: 5,
        validation: { min: 3, max: 25 },
      },
      {
        name: 'style',
        type: 'select',
        description: 'Thread style',
        required: true,
        options: ['educational', 'story', 'analysis', 'tips'],
        default: 'educational',
      },
    ],
    template: `
🧵 {{threadTitle}} (1/{{threadLength}})

{{openingTweet}}

2/{{threadLength}}
{{#if style.educational}}
Let me break this down:
{{/if}}
{{#if style.story}}
Here's what happened:
{{/if}}

{{tweet2}}

3/{{threadLength}}
{{tweet3}}

{{#each additionalTweets}}
{{index}}/{{threadLength}}
{{content}}

{{/each}}

{{threadLength}}/{{threadLength}}
{{closingTweet}}

That's a wrap! 

{{#if cta}}
{{cta}}
{{/if}}
`,
    category: 'social',
    isPublic: true,
  },
  {
    id: 'cornell-notes',
    name: 'Cornell Notes',
    description: 'Cornell note-taking system for articles',
    type: ContentType.NOTES,
    variables: [
      {
        name: 'includeQuestions',
        type: 'boolean',
        description: 'Include questions section',
        required: false,
        default: true,
      },
      {
        name: 'includeSummary',
        type: 'boolean',
        description: 'Include summary section',
        required: false,
        default: true,
      },
    ],
    template: `
# Cornell Notes: {{articleTitle}}

**Date**: {{date}}
**Source**: {{source}}
**Author**: {{author}}

---

## Cue Column | Note-Taking Area
------------ | -----------------
{{#each notes}}
{{cue}} | {{note}}
{{/each}}

{{#if includeQuestions}}
## Questions
{{#each questions}}
- {{this}}
{{/each}}
{{/if}}

{{#if includeSummary}}
## Summary
{{summary}}
{{/if}}

## Key Takeaways
{{#each takeaways}}
- {{this}}
{{/each}}

## Action Items
{{#each actionItems}}
- [ ] {{this}}
{{/each}}
`,
    category: 'notes',
    isPublic: true,
  },
];

export function getTemplateById(id: string): ContentTemplate | undefined {
  return defaultTemplates.find(t => t.id === id);
}

export function getTemplatesByType(type: ContentType): ContentTemplate[] {
  return defaultTemplates.filter(t => t.type === type);
}

export function getTemplatesByCategory(category: string): ContentTemplate[] {
  return defaultTemplates.filter(t => t.category === category);
}