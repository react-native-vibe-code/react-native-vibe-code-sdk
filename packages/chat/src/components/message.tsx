"use client";

import equal from "fast-deep-equal";
import { memo, useState, useEffect, type ReactNode } from "react";
import type { Message } from "ai";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@react-native-vibe-code/ui/lib/utils";
import { MessageContent } from "./message-content";
import { Button } from "@react-native-vibe-code/ui/components/button";

export interface ChatMessageProps {
  message: Message;
  isLoading: boolean;
  isLastMessage: boolean;
  status: "streaming" | "error" | "submitted" | "ready";
  projectId?: string;
  sandboxId?: string | null;
  userId?: string;
  onRestore?: (messageId: string) => Promise<void>;
  restoringMessageId?: string | null;
  hasAssistantResponse?: boolean;
  /** Optional custom renderer for rate limit messages */
  renderRateLimitCard?: (data: { reason: string; usageCount: number; messageLimit: number }) => ReactNode;
  /** Optional custom renderer for Claude Code messages */
  renderClaudeCodeMessage?: (props: { content: string; isStreaming: boolean; isLastCard: boolean }) => ReactNode;
  /** Optional custom renderer for generating app card */
  renderGeneratingAppCard?: (props: { isLoading: boolean }) => ReactNode;
  /** Optional function to check if message is a rate limit message */
  isRateLimitMessage?: (content: string) => boolean;
  /** Optional function to parse rate limit data */
  parseRateLimitData?: (content: string) => { reason: string; usageCount: number; messageLimit: number } | null;
  /** Optional function to check if message is from Claude Code */
  isClaudeCodeMessage?: (content: string) => boolean;
  /** Optional function to get skill by ID */
  getSkillById?: (id: string) => { id: string; name: string; icon: React.ComponentType<{ className?: string }> } | null;
}

// Helper function to get edit data from message annotations
function getEditDataFromMessage(message: any) {
  if (message.role !== "user" || !message.annotations) return null;

  const editAnnotation = message.annotations.find(
    (ann: any) => ann.type === "edit"
  );
  if (editAnnotation && editAnnotation.selectionData?.tagName) {
    return {
      elementType: editAnnotation.selectionData.tagName,
      elementId: editAnnotation.selectionData.elementId || "",
      content: editAnnotation.selectionData.content || "",
      className: editAnnotation.selectionData.className || "",
    };
  }

  return null;
}

// Skill chip component for inline rendering
const SkillChip = memo(function SkillChip({
  skillId,
  getSkillById
}: {
  skillId: string;
  getSkillById?: (id: string) => { id: string; name: string; icon: React.ComponentType<{ className?: string }> } | null;
}) {
  if (!getSkillById) return null;
  const skill = getSkillById(skillId);
  if (!skill) return null;

  const Icon = skill.icon;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 bg-muted border border-border rounded text-xs font-medium text-foreground align-middle">
      <Icon className="h-3 w-3" />
      {skill.name}
    </span>
  );
});

// Component to render message content with inline skill chips
const ContentWithSkillChips = memo(function ContentWithSkillChips({
  content,
  getSkillById
}: {
  content: string;
  getSkillById?: (id: string) => { id: string; name: string; icon: React.ComponentType<{ className?: string }> } | null;
}) {
  // Parse content for skill markers like {{skill:skillId}}
  const skillMarkerRegex = /\{\{skill:([^}]+)\}\}/g;
  const parts: (string | { type: 'skill'; id: string })[] = [];

  let lastIndex = 0;
  let match;

  while ((match = skillMarkerRegex.exec(content)) !== null) {
    // Add text before the marker
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    // Add the skill marker
    parts.push({ type: 'skill', id: match[1] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  // If no skill markers found, just return the content as-is
  if (parts.length === 0 || (parts.length === 1 && typeof parts[0] === 'string')) {
    return (
      <MessageContent className="text-sm whitespace-pre-wrap">
        {content}
      </MessageContent>
    );
  }

  return (
    <div className="text-sm whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (typeof part === 'string') {
          return <span key={index}>{part}</span>;
        }
        return <SkillChip key={index} skillId={part.id} getSkillById={getSkillById} />;
      })}
    </div>
  );
});

const PureChatMessage = ({
  message,
  isLoading,
  isLastMessage,
  status,
  projectId,
  sandboxId,
  userId,
  onRestore,
  restoringMessageId,
  hasAssistantResponse,
  renderRateLimitCard,
  renderClaudeCodeMessage,
  renderGeneratingAppCard,
  isRateLimitMessage: checkIsRateLimitMessage,
  parseRateLimitData: parseRateLimit,
  isClaudeCodeMessage: checkIsClaudeCodeMessage,
  getSkillById,
}: ChatMessageProps) => {
  // Default implementations for optional functions
  const defaultIsRateLimitMessage = (content: string) => content?.includes("__RATE_LIMIT_CARD__");
  const defaultParseRateLimitData = (content: string) => {
    try {
      const match = content.match(/__RATE_LIMIT_CARD__(.*?)__RATE_LIMIT_CARD__/);
      if (match && match[1]) {
        return JSON.parse(match[1]);
      }
    } catch {}
    return null;
  };
  const defaultIsClaudeCodeMessage = (content: string) => {
    if (!content) return false;
    return content.includes("📝 Message") || content.includes("Streaming:");
  };

  const isRateLimit = (checkIsRateLimitMessage || defaultIsRateLimitMessage)(message.content);
  const isClaudeCode = (checkIsClaudeCodeMessage || defaultIsClaudeCodeMessage)(message.content);
  const editData = getEditDataFromMessage(message);

  // Check if this is a first message that's preparing the app
  const isPreparingApp = (message as any).data?.isPreparingApp === true;
  // Card should stop loading once we have an assistant response
  const isStillGenerating = !hasAssistantResponse && (isLoading || status === "streaming" || status === "submitted");
  const shouldShowGeneratingCard = isPreparingApp && message.role === "user";

  // Add 2-second delay before showing the GeneratingAppCard
  const [showGeneratingCard, setShowGeneratingCard] = useState(false);

  useEffect(() => {
    if (shouldShowGeneratingCard) {
      const timer = setTimeout(() => {
        setShowGeneratingCard(true);
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      setShowGeneratingCard(false);
    }
  }, [shouldShowGeneratingCard]);

  return (
    <div
      className="group/message w-full mb-[80px]"
      data-role={message.role}
    >
      <div
        className={cn("flex items-start gap-3", {
          "flex-row-reverse": message.role === "user",
          "flex-row": message.role === "assistant",
        })}
      >
        <div
          className={cn("flex flex-1 flex-col gap-2 pb-4", {
            "items-end": message.role === "user",
            "items-start": message.role === "assistant" && showGeneratingCard,
          })}
        >
          {/* Rate Limit Card */}
          {isRateLimit && message.role === "assistant" && renderRateLimitCard && (() => {
            const rateLimitData = (parseRateLimit || defaultParseRateLimitData)(message.content);
            if (rateLimitData) {
              return renderRateLimitCard({
                reason: rateLimitData.reason,
                usageCount: rateLimitData.usageCount,
                messageLimit: rateLimitData.messageLimit,
              });
            }
            return null;
          })()}

          {/* Claude Code Message (Cards) */}
          {isClaudeCode && message.role === "assistant" && renderClaudeCodeMessage && (
            <div className="w-full max-w-[calc(100%-40px)]">
              {renderClaudeCodeMessage({
                content: message.content,
                isStreaming: status === "streaming" && isLastMessage,
                isLastCard: isLastMessage,
              })}
            </div>
          )}

          {/* Regular Message (Simple Text) */}
          {!isRateLimit && !isClaudeCode && (
            <div
              className={cn("rounded-lg p-3", {
                "bg-transparent border dark:border-white border-gray-400 max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
                  message.role === "user",
                "bg-transparent w-full": message.role === "assistant",
              })}
            >
              {editData && (
                <div className="flex flex-col gap-2 mb-3 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      Selected Element:
                    </span>
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                      {editData.elementType}
                    </span>
                  </div>
                  {editData.elementId && editData.elementId !== 'No ID' && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 border-l-2 border-blue-300 dark:border-blue-700 pl-2">
                      <span className="font-medium">File ref: </span>
                      <span className="font-mono">{editData.elementId}</span>
                    </div>
                  )}
                  {editData.content && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 border-l-2 border-blue-300 dark:border-blue-700 pl-2">
                      <span className="font-medium">Content: </span>
                      <span className="font-mono">&quot;{editData.content.length > 100 ? editData.content.substring(0, 100) + '...' : editData.content}&quot;</span>
                    </div>
                  )}
                  {editData.className && (
                    <div className="text-xs text-blue-600 dark:text-blue-400">
                      <span className="font-medium">Classes: </span>
                      <span className="font-mono">{editData.className}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Message content with inline skill chips */}
              {message.role === "user" ? (
                <ContentWithSkillChips
                  content={typeof message.content === "string"
                    ? message.content
                    : JSON.stringify(message.content, null, 2)}
                  getSkillById={getSkillById}
                />
              ) : (
                <MessageContent className="text-sm whitespace-pre-wrap">
                  {typeof message.content === "string"
                    ? message.content
                    : JSON.stringify(message.content, null, 2)}
                </MessageContent>
              )}

              {/* Image attachments - show below user message content */}
              {message.role === "user" && (message as any).experimental_attachments?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(message as any).experimental_attachments.map((attachment: any, idx: number) => (
                    <img
                      key={`${attachment.url}-${idx}`}
                      src={attachment.url}
                      alt={attachment.name || 'Attached image'}
                      className="max-w-[200px] max-h-[200px] object-contain rounded-md border border-border"
                    />
                  ))}
                </div>
              )}

              {/* Restore button - only show for user messages */}
              {message.role === "user" && projectId && sandboxId && userId && onRestore && (
                <div
                  className="flex justify-end mt-2 opacity-0 group-hover/message:opacity-100 transition-opacity"
                  style={{ position: "absolute", right: 30, top: -7 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRestore(message.id)}
                    disabled={restoringMessageId === message.id}
                    className="text-xs"
                  >
                    {restoringMessageId === message.id ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1" />
                    )}
                    Restore
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Generating App Card - shows below first user message */}
          {showGeneratingCard && renderGeneratingAppCard && (
            <div className=" w-full max-w-[calc(100%-40px)] mt-2 self-start">
              {renderGeneratingAppCard({ isLoading: isStillGenerating })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ChatMessage = memo(
  PureChatMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
    if (prevProps.status !== nextProps.status) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.restoringMessageId !== nextProps.restoringMessageId) return false;
    if (prevProps.hasAssistantResponse !== nextProps.hasAssistantResponse) return false;
    if (!equal(prevProps.message.content, nextProps.message.content)) return false;
    if (!equal((prevProps.message as any).experimental_attachments, (nextProps.message as any).experimental_attachments)) return false;
    return true;
  }
);

ChatMessage.displayName = "ChatMessage";
