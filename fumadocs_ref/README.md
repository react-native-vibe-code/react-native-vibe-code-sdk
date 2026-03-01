# React Native Vibe Code Documentation Reference

This directory contains comprehensive documentation for React Native Vibe Code in Fumadocs-compatible MDX format.

## Purpose

These documentation files are designed to be:

1. **Consumed by Fumadocs** - MDX format with frontmatter for documentation site generation
2. **Used by AI Agents** - Detailed technical references for Claude Code and other AI assistants
3. **Developer Resources** - Complete API and feature documentation for developers integrating with React Native Vibe Code

## Structure

### Documentation Files

| File | Description | Audience |
|------|-------------|----------|
| `api-integration.mdx` | Toolkit API endpoints with CORS support | Mobile developers, API consumers |
| `voice-chat.mdx` | Voice input and transcription implementation | Feature integrators, mobile developers |
| `ai-sdk-integration.mdx` | AI SDK 5.0 streaming and Claude Code SDK | Backend developers, AI integrators |
| `api-reference.mdx` | Complete API endpoint reference | All developers, API consumers |
| `features.mdx` | Feature overview with code examples | Product managers, new developers |

## Content Guidelines

Each documentation file follows these principles:

### 1. Fumadocs Compatibility

All files use MDX format with frontmatter:

```mdx
---
title: Feature Name
description: Brief description for SEO and navigation
---

# Feature Name

Content here...
```

### 2. AI Agent Optimization

- **File References** - Exact file paths with line numbers (e.g., `lib/cors.ts:87-107`)
- **Code Examples** - Complete, runnable code snippets
- **Type Definitions** - Full TypeScript interfaces and types
- **Configuration** - Environment variables, settings, and defaults
- **Error Handling** - Common errors and solutions

### 3. Developer Experience

- **Clear Structure** - Hierarchical headings for easy navigation
- **Practical Examples** - Real-world usage patterns
- **Links to Sources** - References to official documentation
- **Troubleshooting** - Common issues and solutions
- **Best Practices** - Recommended patterns and tips

## Documentation Coverage

### API Integration (`api-integration.mdx`)

Covers all toolkit endpoints:
- LLM endpoint (Claude AI)
- Speech-to-Text (OpenAI Whisper)
- Search (SerpAPI)
- Exa People Search
- Image Generation (DALL-E 3)
- CORS configuration
- Error handling

**Target Audience:** Mobile app developers calling APIs from React Native/Expo

### Voice Chat (`voice-chat.mdx`)

Covers voice input features:
- `useAudioRecorder` hook
- `MicrophoneContext` provider
- Transcription API
- Browser compatibility
- Audio settings and optimization
- Complete integration examples

**Target Audience:** Developers adding voice features to mobile apps

**Note:** LiveKit was mentioned in requirements but not found in codebase. Documentation reflects actual implementation using OpenAI Whisper.

### AI SDK Integration (`ai-sdk-integration.mdx`)

Covers AI-powered code generation:
- Vercel AI SDK 5.0 streaming
- Claude Code SDK integration
- Skills system (pre-built templates)
- Message format and history
- Rate limiting and usage tracking
- Error handling
- Client-side integration

**Target Audience:** Backend developers, AI integration engineers

### API Reference (`api-reference.mdx`)

Complete endpoint reference:
- All internal and toolkit endpoints
- Request/response formats
- Authentication requirements
- Status codes and errors
- Rate limiting
- CORS configuration
- SDK examples (JavaScript, React Native, cURL)

**Target Audience:** All developers integrating with React Native Vibe Code

### Features Overview (`features.mdx`)

Comprehensive feature list:
- AI-powered code generation
- E2B sandbox execution
- Voice input
- Skills system (6 available skills)
- Real-time file watching
- Code editor integration
- Project management
- Authentication
- Subscription management
- Mobile app preview
- Git integration
- Error tracking
- File upload
- Chat history
- Rate limiting

**Target Audience:** Product managers, new developers, marketing

**Note:** Supermemory and Incognito Mode mentioned in requirements but not found in codebase. Documented as "Upcoming Features".

## Missing Features (Not Implemented)

The following features were requested but are not currently in the codebase:

1. **LiveKit Voice Chat** - Real-time voice chat with LiveKit agents
   - Status: Not implemented
   - Alternative: OpenAI Whisper for speech-to-text is implemented

2. **Supermemory Integration** - Memory integration for contextual conversations
   - Status: Not implemented
   - Listed as "Upcoming Feature" in features.mdx

3. **Incognito Mode** - Privacy-focused ephemeral sessions
   - Status: Not implemented
   - Listed as "Upcoming Feature" in features.mdx

## Using This Documentation

### For Fumadocs Integration

1. Copy files to your Fumadocs content directory
2. Configure `meta.json` or equivalent for navigation
3. Files will be automatically processed by Fumadocs

Example `meta.json`:
```json
{
  "title": "React Native Vibe Code Docs",
  "pages": [
    "features",
    "api-integration",
    "ai-sdk-integration",
    "voice-chat",
    "api-reference"
  ]
}
```

### For AI Agents

AI agents (like Claude Code) can reference these files for:

- Understanding API endpoints and usage
- Implementing features correctly
- Following established patterns
- Debugging issues with exact file references
- Generating code that integrates with React Native Vibe Code

### For Developers

Use as reference documentation for:

- API integration
- Feature implementation
- Best practices
- Troubleshooting
- Understanding the architecture

## File Paths Reference

Key files referenced in documentation:

**API Routes:**
- `app/api/toolkit/llm/route.ts` - LLM endpoint
- `app/api/toolkit/stt/route.ts` - Speech-to-text
- `app/api/toolkit/search/route.ts` - Search endpoint
- `app/api/toolkit/exa-search/route.ts` - Exa people search
- `app/api/toolkit/images/route.ts` - Image generation
- `app/(app)/api/chat/route.ts` - Main chat endpoint
- `app/(app)/api/transcribe/route.ts` - Voice transcription
- `app/(app)/api/create-container/route.ts` - Sandbox creation

**Core Libraries:**
- `lib/cors.ts` - CORS configuration
- `lib/claude-code-handler.ts` - Claude Code integration
- `lib/claude-code-service.ts` - Claude Code service
- `lib/skills/config.ts` - Skills configuration
- `lib/skills/templates/` - Skill templates
- `lib/message-usage.ts` - Rate limiting
- `lib/db/schema.ts` - Database schema

**React Hooks:**
- `hooks/use-audio-recorder.ts` - Audio recording hook
- `context/microphone-context.tsx` - Microphone context

**Templates:**
- `sandbox-templates/expo-template/` - Expo sandbox
- `sandbox-templates/tamagui-template/` - Tamagui sandbox
- `sandbox-templates/github-template/` - GitHub integration

## Contributing

When updating documentation:

1. **Maintain MDX Format** - Keep frontmatter and structure
2. **Update File References** - Include exact line numbers when possible
3. **Test Code Examples** - Ensure all code snippets are valid
4. **Link Related Docs** - Cross-reference other documentation files
5. **Update README** - Keep this file in sync with changes

## Technology Stack

Documentation references these technologies:

**Frontend:**
- Next.js 14 with App Router
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui components

**Backend:**
- Next.js API Routes
- PostgreSQL with Drizzle ORM
- Better Auth (authentication)
- Polar (subscriptions)
- Pusher (real-time)

**AI/ML:**
- Anthropic Claude (via AI SDK)
- OpenAI Whisper (speech-to-text)
- OpenAI DALL-E 3 (image generation)
- OpenAI O3 (reasoning)
- Vercel AI SDK 5.0
- Claude Code SDK

**Infrastructure:**
- E2B Code Interpreter (sandboxes)
- Vercel (deployment)
- Neon PostgreSQL (database)
- SerpAPI (search)
- Exa (people search)

## Environment Variables

All endpoints require appropriate environment variables. See individual documentation files for specific requirements.

Core variables:
```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
BETTER_AUTH_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# AI Services
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

# Infrastructure
E2B_API_KEY=xxx
PUSHER_APP_ID=xxx
PUSHER_KEY=xxx
PUSHER_SECRET=xxx

# APIs
SERP_API_KEY=xxx
EXA_API_KEY=xxx

# Subscriptions
POLAR_ACCESS_TOKEN=xxx
```

## Support

For questions or issues:

- **GitHub Issues:** https://github.com/capsule-org/capsule-ide/issues
- **Discord:** https://discord.gg/capsule
- **Email:** support@reactnativevibecode.com

## License

This documentation is part of the React Native Vibe Code project. See the main project LICENSE for details.

---

**Last Updated:** December 2024

**Documentation Version:** 1.0

**React Native Vibe Code Version:** Compatible with current main branch
