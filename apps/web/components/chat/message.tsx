"use client";

import { memo } from "react";
import type { Message } from "ai";
import { ChatMessage as BaseChatMessage, type ChatMessageProps as BaseProps } from "@react-native-vibe-code/chat/components";
import { ClaudeCodeMessage, GeneratingAppCard } from "@/components/claude-code-message";
import { RateLimitCard } from "@/components/rate-limit-card";
import { getSkillById } from "@/lib/skills";

interface ChatMessageProps extends Omit<BaseProps, 'renderRateLimitCard' | 'renderClaudeCodeMessage' | 'renderGeneratingAppCard' | 'isRateLimitMessage' | 'parseRateLimitData' | 'isClaudeCodeMessage' | 'getSkillById'> {}

// Helper function to detect if message content is a rate limit message
function isRateLimitMessage(content: string): boolean {
  if (!content || typeof content !== "string") {
    return false;
  }
  return content.includes("__RATE_LIMIT_CARD__");
}

// Helper function to parse rate limit data from message content
function parseRateLimitData(content: string): {
  reason: string;
  usageCount: number;
  messageLimit: number;
} | null {
  try {
    const match = content.match(/__RATE_LIMIT_CARD__(.*?)__RATE_LIMIT_CARD__/);
    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      return {
        reason: data.reason,
        usageCount: data.usageCount,
        messageLimit: data.messageLimit,
      };
    }
  } catch (error) {
    console.error("Failed to parse rate limit data:", error);
  }
  return null;
}

// Helper function to detect if message content is from Claude Code
function isClaudeCodeMessage(content: string): boolean {
  if (!content || typeof content !== "string") {
    return false;
  }

  return (
    content.includes("📝 Message") ||
    content.includes("Streaming:") ||
    content.includes("claude-sdk@") ||
    content.includes("Starting test script") ||
    content.includes("Claude Code query") ||
    content.includes("session_id") ||
    (content.includes("{") && content.includes('"type"')) ||
    content.includes("Query completed successfully") ||
    content.includes("$ tsx test.ts") ||
    content.includes("--system-prompt=") ||
    content.includes("stderr chunk") ||
    content.includes("🚀 CLAUDE EXECUTOR STARTING") ||
    content.includes("Version:") ||
    content.includes("Raw process.argv:") ||
    content.includes("Parsed args:") ||
    content.includes("Found arguments:") ||
    content.includes("promptArg:") ||
    content.includes("systemPromptArg:") ||
    content.includes("cwdArg:") ||
    content.includes("modelArg:") ||
    content.includes("imageUrlsArg:") ||
    content.includes("Extracted values:") ||
    content.includes("No image URLs provided") ||
    content.includes("ANTHROPIC_API_KEY length:") ||
    content.includes("Initializing AI Code Agent") ||
    content.includes("Using text-only prompt") ||
    content.includes("'/usr/local/bin/node'") ||
    content.includes("/claude-sdk/index.ts") ||
    content.includes("/claude-sdk/executor.mjs") ||
    content.includes("--prompt=") ||
    content.includes("--model=") ||
    content.includes("Current working directory: /home/user")
  );
}

const PureChatMessage = (props: ChatMessageProps) => {
  return (
    <BaseChatMessage
      {...props}
      isRateLimitMessage={isRateLimitMessage}
      parseRateLimitData={parseRateLimitData}
      isClaudeCodeMessage={isClaudeCodeMessage}
      getSkillById={getSkillById}
      renderRateLimitCard={({ reason, usageCount, messageLimit }) => (
        <RateLimitCard
          reason={reason}
          usageCount={usageCount}
          messageLimit={messageLimit}
          className="max-w-full"
        />
      )}
      renderClaudeCodeMessage={({ content, isStreaming, isLastCard }) => (
        <ClaudeCodeMessage
          content={content}
          isStreaming={isStreaming}
          isLastCard={isLastCard}
        />
      )}
      renderGeneratingAppCard={({ isLoading }) => (
        <GeneratingAppCard isLoading={isLoading} />
      )}
    />
  );
};

export const ChatMessage = memo(PureChatMessage);
ChatMessage.displayName = "ChatMessage";
