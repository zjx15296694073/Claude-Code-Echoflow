import { useRef, useEffect, useMemo, memo, useState, useCallback, useLayoutEffect } from 'react'
import { ArrowDown } from 'lucide-react'
import { ApiError } from '../../api/client'
import { sessionsApi, type SessionTurnCheckpoint } from '../../api/sessions'
import { useChatStore } from '../../stores/chatStore'
import { useTabStore } from '../../stores/tabStore'
import { useTeamStore } from '../../stores/teamStore'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../i18n'
import type { TranslationKey } from '../../i18n/locales/en'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolCallGroup } from './ToolCallGroup'
import { ToolResultBlock } from './ToolResultBlock'
import { PermissionDialog } from './PermissionDialog'
import { AskUserQuestion } from './AskUserQuestion'
import { StreamingIndicator } from './StreamingIndicator'
import { InlineTaskSummary } from './InlineTaskSummary'
import { CurrentTurnChangeCard } from './CurrentTurnChangeCard'
import type { AgentTaskNotification, UIMessage } from '../../types/chat'
import { ConfirmDialog } from '../shared/ConfirmDialog'

type ToolCall = Extract<UIMessage, { type: 'tool_use' }>
type ToolResult = Extract<UIMessage, { type: 'tool_result' }>

type RenderItem =
  | { kind: 'tool_group'; toolCalls: ToolCall[]; id: string }
  | { kind: 'message'; message: UIMessage }

type RenderModel = {
  renderItems: RenderItem[]
  toolResultMap: Map<string, ToolResult>
  childToolCallsByParent: Map<string, ToolCall[]>
}

type RewindTurnTarget = {
  messageId: string
  userMessageIndex: number
  content: string
  expectedContent: string
  attachments?: Extract<UIMessage, { type: 'user_text' }>['attachments']
}

type TurnChangeCardModel = {
  target: RewindTurnTarget
  checkpoint: SessionTurnCheckpoint
  workDir: string | null
  isLatest: boolean
}

function appendChildToolCall(
  childToolCallsByParent: Map<string, ToolCall[]>,
  parentToolUseId: string,
  toolCall: ToolCall,
) {
  const siblings = childToolCallsByParent.get(parentToolUseId)
  if (siblings) {
    siblings.push(toolCall)
  } else {
    childToolCallsByParent.set(parentToolUseId, [toolCall])
  }
}

export function buildRenderModel(messages: UIMessage[]): RenderModel {
  const items: RenderItem[] = []
  const toolResultMap = new Map<string, ToolResult>()
  const childToolCallsByParent = new Map<string, ToolCall[]>()
  const toolUseIds = new Set<string>()
  let pendingToolCalls: ToolCall[] = []

  const flushGroup = () => {
    if (pendingToolCalls.length > 0) {
      items.push({
        kind: 'tool_group',
        toolCalls: [...pendingToolCalls],
        id: `group-${pendingToolCalls[0]!.id}`,
      })
      pendingToolCalls = []
    }
  }

  for (const msg of messages) {
    if (msg.type === 'tool_use') {
      toolUseIds.add(msg.toolUseId)
    }
    if (msg.type === 'tool_result') {
      toolResultMap.set(msg.toolUseId, msg)
    }
  }

  for (const msg of messages) {
    if (msg.type === 'assistant_text' && !msg.content.trim()) {
      continue
    }

    if (msg.type === 'tool_result' && toolUseIds.has(msg.toolUseId)) {
      continue
    }
    if (msg.type === 'tool_result' && msg.parentToolUseId && toolUseIds.has(msg.parentToolUseId)) {
      continue
    }

    if (msg.type === 'tool_use') {
      if (msg.parentToolUseId && toolUseIds.has(msg.parentToolUseId)) {
        flushGroup()
        appendChildToolCall(childToolCallsByParent, msg.parentToolUseId, msg)
        continue
      }
      if (msg.toolName === 'AskUserQuestion') {
        flushGroup()
        items.push({ kind: 'message', message: msg })
      } else {
        pendingToolCalls.push(msg)
      }
    } else {
      flushGroup()
      items.push({ kind: 'message', message: msg })
    }
  }

  flushGroup()
  return { renderItems: items, toolResultMap, childToolCallsByParent }
}

function isTurnResponseMessage(message: UIMessage) {
  return (
    message.type === 'assistant_text' ||
    message.type === 'tool_use' ||
    message.type === 'tool_result' ||
    message.type === 'error' ||
    message.type === 'task_summary'
  )
}

export function getCompletedTurnTargets(messages: UIMessage[]): RewindTurnTarget[] {
  let userMessageIndex = -1
  const completedTurns: RewindTurnTarget[] = []
  let currentTarget: RewindTurnTarget | null = null
  let hasResponseForCurrentTarget = false

  for (const message of messages) {
    if (message.type === 'user_text' && !message.pending) {
      if (currentTarget && hasResponseForCurrentTarget) {
        completedTurns.push(currentTarget)
      }
      userMessageIndex += 1
      currentTarget = {
        messageId: message.id,
        userMessageIndex,
        content: message.content,
        expectedContent: message.modelContent ?? message.content,
        attachments: message.attachments,
      }
      hasResponseForCurrentTarget = false
      continue
    }

    if (currentTarget && isTurnResponseMessage(message)) {
      hasResponseForCurrentTarget = true
    }
  }

  if (currentTarget && hasResponseForCurrentTarget) {
    completedTurns.push(currentTarget)
  }

  return completedTurns
}

export function getLatestCompletedTurnTarget(messages: UIMessage[]): RewindTurnTarget | null {
  const completedTurns = getCompletedTurnTargets(messages)
  return completedTurns.length > 0 ? completedTurns[completedTurns.length - 1] ?? null : null
}

function buildTurnCardInsertionMap(
  renderItems: RenderItem[],
  turnChangeCards: TurnChangeCardModel[],
) {
  const lastResponseIndexByTurnId = new Map<string, number>()
  const userIndexByTurnId = new Map<string, number>()
  let activeTurnId: string | null = null

  renderItems.forEach((item, index) => {
    if (item.kind === 'message' && item.message.type === 'user_text' && !item.message.pending) {
      activeTurnId = item.message.id
      userIndexByTurnId.set(activeTurnId, index)
      return
    }

    if (activeTurnId) {
      lastResponseIndexByTurnId.set(activeTurnId, index)
    }
  })

  const cardsByRenderIndex = new Map<number, TurnChangeCardModel[]>()
  turnChangeCards.forEach((card) => {
    const renderIndex =
      lastResponseIndexByTurnId.get(card.target.messageId) ??
      userIndexByTurnId.get(card.target.messageId)
    if (renderIndex === undefined) return
    const existing = cardsByRenderIndex.get(renderIndex)
    if (existing) {
      existing.push(card)
    } else {
      cardsByRenderIndex.set(renderIndex, [card])
    }
  })

  return cardsByRenderIndex
}

function getApiErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? typeof error.body === 'object' && error.body && 'message' in error.body
      ? String((error.body as { message: unknown }).message)
      : error.message
    : error instanceof Error
      ? error.message
      : String(error)
}

function isSessionTurnCheckpoint(value: unknown): value is SessionTurnCheckpoint {
  if (!value || typeof value !== 'object') return false
  const checkpoint = value as Partial<SessionTurnCheckpoint>
  return (
    Boolean(checkpoint.target) &&
    typeof checkpoint.target?.targetUserMessageId === 'string' &&
    typeof checkpoint.target?.userMessageIndex === 'number' &&
    Boolean(checkpoint.code) &&
    typeof checkpoint.code?.available === 'boolean' &&
    Array.isArray(checkpoint.code?.filesChanged)
  )
}

function normalizeTurnCheckpoints(response: unknown): SessionTurnCheckpoint[] {
  if (!response || typeof response !== 'object') return []
  const checkpoints = (response as { checkpoints?: unknown }).checkpoints
  if (!Array.isArray(checkpoints)) return []
  return checkpoints.filter(isSessionTurnCheckpoint)
}

type MessageListProps = {
  sessionId?: string | null
  compact?: boolean
}

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 48
const MAX_SCROLL_SNAPSHOTS = 100
const CHAT_SCROLL_AREA_CLASS = [
  'chat-scroll-area',
  '[scrollbar-width:auto]',
  '[scrollbar-color:color-mix(in_srgb,var(--color-outline)_72%,transparent)_transparent]',
  '[&::-webkit-scrollbar]:w-2.5',
  '[&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-full',
  '[&::-webkit-scrollbar-thumb]:border-[3px]',
  '[&::-webkit-scrollbar-thumb]:border-transparent',
  '[&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--color-outline)_74%,transparent)]',
  '[&::-webkit-scrollbar-thumb]:bg-clip-content',
  '[&::-webkit-scrollbar-thumb:hover]:border-2',
  '[&::-webkit-scrollbar-thumb:hover]:bg-[color-mix(in_srgb,var(--color-outline)_90%,transparent)]',
].join(' ')

type SessionScrollSnapshot = {
  scrollTop: number
  wasAtBottom: boolean
}

const sessionScrollSnapshots = new Map<string, SessionScrollSnapshot>()

function isNearScrollBottom(element: HTMLElement) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    AUTO_SCROLL_BOTTOM_THRESHOLD_PX
  )
}

function rememberSessionScroll(sessionId: string, element: HTMLElement) {
  if (sessionScrollSnapshots.size >= MAX_SCROLL_SNAPSHOTS && !sessionScrollSnapshots.has(sessionId)) {
    const oldestSessionId = sessionScrollSnapshots.keys().next().value
    if (oldestSessionId) {
      sessionScrollSnapshots.delete(oldestSessionId)
    }
  }

  sessionScrollSnapshots.set(sessionId, {
    scrollTop: element.scrollTop,
    wasAtBottom: isNearScrollBottom(element),
  })
}

function clampScrollTop(element: HTMLElement, scrollTop: number) {
  return Math.max(0, Math.min(scrollTop, element.scrollHeight - element.clientHeight))
}

export function MessageList({ sessionId, compact = false }: MessageListProps = {}) {
  const activeTabId = useTabStore((s) => s.activeTabId)
  const resolvedSessionId = sessionId ?? activeTabId
  const sessionState = useChatStore((s) =>
    resolvedSessionId ? s.sessions[resolvedSessionId] : undefined,
  )
  const stopGeneration = useChatStore((s) => s.stopGeneration)
  const reloadHistory = useChatStore((s) => s.reloadHistory)
  const queueComposerPrefill = useChatStore((s) => s.queueComposerPrefill)
  const isMemberSession = useTeamStore((s) =>
    resolvedSessionId ? Boolean(s.getMemberBySessionId(resolvedSessionId)) : false,
  )
  const addToast = useUIStore((s) => s.addToast)
  const messages = sessionState?.messages ?? []
  const chatState = sessionState?.chatState ?? 'idle'
  const streamingText = sessionState?.streamingText ?? ''
  const activeThinkingId = sessionState?.activeThinkingId ?? null
  const agentTaskNotifications = sessionState?.agentTaskNotifications ?? {}
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const isProgrammaticScrollingRef = useRef(false)
  const lastSessionIdRef = useRef<string | null | undefined>(resolvedSessionId)
  const t = useTranslation()
  const [turnChangeCards, setTurnChangeCards] = useState<TurnChangeCardModel[]>([])
  const [turnChangeLoadError, setTurnChangeLoadError] = useState<string | null>(null)
  const [turnActionErrors, setTurnActionErrors] = useState<Record<string, string>>({})
  const [isLoadingTurnChangeCards, setIsLoadingTurnChangeCards] = useState(false)
  const [rewindingTurnId, setRewindingTurnId] = useState<string | null>(null)
  const [turnUndoConfirmTargetId, setTurnUndoConfirmTargetId] = useState<string | null>(null)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    shouldAutoScrollRef.current = true
    isProgrammaticScrollingRef.current = true
    bottomRef.current?.scrollIntoView?.({ behavior, block: 'end' })
    const container = scrollContainerRef.current
    if (container && resolvedSessionId) {
      sessionScrollSnapshots.set(resolvedSessionId, {
        scrollTop: Math.max(0, container.scrollHeight - container.clientHeight),
        wasAtBottom: true,
      })
    }
    setShowJumpToLatest(false)
    // Reset flag after the scroll event(s) from scrollIntoView have fired
    requestAnimationFrame(() => {
      isProgrammaticScrollingRef.current = false
    })
  }, [resolvedSessionId])

  const updateAutoScrollState = useCallback(() => {
    // Ignore scroll events triggered by our own programmatic scrolling to
    // prevent the jump-to-latest button from flickering during auto-scroll.
    if (isProgrammaticScrollingRef.current) return
    const container = scrollContainerRef.current
    if (!container) return
    const isAtBottom = isNearScrollBottom(container)
    shouldAutoScrollRef.current = isAtBottom
    setShowJumpToLatest(!isAtBottom)

    if (resolvedSessionId) {
      rememberSessionScroll(resolvedSessionId, container)
    }
  }, [resolvedSessionId])

  useLayoutEffect(() => {
    if (lastSessionIdRef.current !== resolvedSessionId) {
      const snapshot = resolvedSessionId ? sessionScrollSnapshots.get(resolvedSessionId) : undefined
      shouldAutoScrollRef.current = snapshot?.wasAtBottom ?? true
      lastSessionIdRef.current = resolvedSessionId

      const container = scrollContainerRef.current
      if (container && snapshot && !snapshot.wasAtBottom) {
        container.scrollTop = clampScrollTop(container, snapshot.scrollTop)
        setShowJumpToLatest(true)
      } else {
        scrollToBottom('auto')
      }
    }
  }, [resolvedSessionId, scrollToBottom])

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      setShowJumpToLatest(true)
      return
    }

    scrollToBottom('smooth')
  }, [messages.length, resolvedSessionId, scrollToBottom, streamingText])

  const handleJumpToLatest = useCallback(() => {
    scrollToBottom('smooth')
  }, [scrollToBottom])

  const { toolResultMap, childToolCallsByParent, renderItems } = useMemo(
    () => buildRenderModel(messages),
    [messages],
  )
  const completedTurnTargets = useMemo(() => getCompletedTurnTargets(messages), [messages])
  const latestCompletedTurnId =
    completedTurnTargets.length > 0
      ? completedTurnTargets[completedTurnTargets.length - 1]?.messageId ?? null
      : null
  const turnCardsByRenderIndex = useMemo(
    () => buildTurnCardInsertionMap(renderItems, turnChangeCards),
    [renderItems, turnChangeCards],
  )
  const confirmTurnCard = useMemo(
    () => turnChangeCards.find((card) => card.target.messageId === turnUndoConfirmTargetId) ?? null,
    [turnChangeCards, turnUndoConfirmTargetId],
  )

  useEffect(() => {
    if (!resolvedSessionId || completedTurnTargets.length === 0 || isMemberSession) {
      setTurnChangeCards([])
      setTurnChangeLoadError(null)
      setIsLoadingTurnChangeCards(false)
      return
    }

    if (chatState !== 'idle') {
      setTurnChangeLoadError(null)
      setIsLoadingTurnChangeCards(false)
      return
    }

    let cancelled = false
    setIsLoadingTurnChangeCards(true)
    setTurnChangeLoadError(null)

    Promise.all([
      sessionsApi.getTurnCheckpoints(resolvedSessionId),
      sessionsApi.getWorkspaceStatus(resolvedSessionId).catch(() => null),
    ])
      .then(([checkpointResponse, workspaceStatus]) => {
        if (cancelled) return
        const targetByMessageId = new Map(
          completedTurnTargets.map((target) => [target.messageId, target] as const),
        )
        const targetByUserMessageIndex = new Map(
          completedTurnTargets.map((target) => [target.userMessageIndex, target] as const),
        )

        setTurnChangeCards(
          normalizeTurnCheckpoints(checkpointResponse).flatMap((checkpoint) => {
            const target =
              targetByMessageId.get(checkpoint.target.targetUserMessageId) ??
              targetByUserMessageIndex.get(checkpoint.target.userMessageIndex)
            if (!target || !checkpoint.code.available || checkpoint.code.filesChanged.length === 0) {
              return []
            }
            return [{
              target,
              checkpoint,
              workDir: checkpoint.workDir ?? workspaceStatus?.workDir ?? null,
              isLatest: target.messageId === latestCompletedTurnId,
            }]
          }),
        )
      })
      .catch((error) => {
        if (cancelled) return
        setTurnChangeCards([])
        setTurnChangeLoadError(getApiErrorMessage(error))
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingTurnChangeCards(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [chatState, completedTurnTargets, isMemberSession, latestCompletedTurnId, resolvedSessionId])

  const handleUndoCurrentTurn = useCallback(async () => {
    if (!resolvedSessionId || !confirmTurnCard || rewindingTurnId) return

    const target = confirmTurnCard.target
    setRewindingTurnId(target.messageId)
    setTurnActionErrors((current) => {
      if (!(target.messageId in current)) return current
      const next = { ...current }
      delete next[target.messageId]
      return next
    })

    try {
      if (chatState !== 'idle') {
        stopGeneration(resolvedSessionId)
      }

      const result = await sessionsApi.rewind(resolvedSessionId, {
        targetUserMessageId: target.messageId,
        userMessageIndex: target.userMessageIndex,
        expectedContent: target.expectedContent,
      })

      await reloadHistory(resolvedSessionId)
      queueComposerPrefill(resolvedSessionId, {
        text: target.content,
        attachments: target.attachments,
      })

      addToast({
        type: 'success',
        message: result.code.available
          ? t('chat.rewindSuccessWithCode', {
              count: result.conversation.messagesRemoved,
            })
          : t('chat.rewindSuccessConversationOnly', {
              count: result.conversation.messagesRemoved,
            }),
      })

      setTurnUndoConfirmTargetId(null)
    } catch (error) {
      setTurnActionErrors((current) => ({
        ...current,
        [target.messageId]: getApiErrorMessage(error),
      }))
      setTurnUndoConfirmTargetId(null)
    } finally {
      setRewindingTurnId(null)
    }
  }, [
    addToast,
    chatState,
    confirmTurnCard,
    queueComposerPrefill,
    reloadHistory,
    resolvedSessionId,
    rewindingTurnId,
    stopGeneration,
    t,
  ])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollContainerRef}
        onScroll={updateAutoScrollState}
        className={`${CHAT_SCROLL_AREA_CLASS} h-full overflow-y-auto ${compact ? 'px-3 py-3 pb-5' : 'px-4 py-4'}`}
      >
        <div className={compact ? 'mx-auto max-w-full' : 'mx-auto max-w-[860px]'}>
          {renderItems.map((item, index) => {
            const cardsForItem = turnCardsByRenderIndex.get(index) ?? []

            return (
              <div key={item.kind === 'tool_group' ? item.id : item.message.id}>
                {item.kind === 'tool_group' ? (
                  <ToolCallGroup
                    toolCalls={item.toolCalls}
                    resultMap={toolResultMap}
                    childToolCallsByParent={childToolCallsByParent}
                    agentTaskNotifications={agentTaskNotifications}
                    isStreaming={
                      chatState === 'tool_executing' &&
                      item.toolCalls.some((tc) => !toolResultMap.has(tc.toolUseId))
                    }
                  />
                ) : (
                  <MessageBlock
                    sessionId={resolvedSessionId}
                    message={item.message}
                    activeThinkingId={activeThinkingId}
                    agentTaskNotifications={agentTaskNotifications}
                    toolResult={
                      item.message.type === 'tool_use'
                        ? (() => {
                            const result = toolResultMap.get(item.message.toolUseId)
                            return result ? { content: result.content, isError: result.isError } : null
                          })()
                        : null
                    }
                  />
                )}

                {resolvedSessionId && cardsForItem.map((card) => (
                  <CurrentTurnChangeCard
                    key={`turn-change-${card.target.messageId}`}
                    sessionId={resolvedSessionId}
                    targetUserMessageId={card.checkpoint.target.targetUserMessageId}
                    checkpoint={card.checkpoint}
                    workDir={card.workDir}
                    error={turnActionErrors[card.target.messageId] ?? null}
                    isUndoing={rewindingTurnId === card.target.messageId}
                    isLatest={card.isLatest}
                    onUndo={() => {
                      setTurnUndoConfirmTargetId(card.target.messageId)
                    }}
                  />
                ))}
              </div>
            )
          })}

          {streamingText.trim() && (
            <AssistantMessage content={streamingText} isStreaming={chatState === 'streaming'} />
          )}

          {/* Show StreamingIndicator when:
              - tool_executing: tool is running
              - thinking but no active ThinkingBlock yet: the gap between
                sending a message and receiving the first thinking delta */}
          {(chatState === 'tool_executing' || (chatState === 'thinking' && !activeThinkingId)) && (
            <StreamingIndicator />
          )}

          {!isLoadingTurnChangeCards && turnChangeCards.length === 0 && turnChangeLoadError && (
            <div className="mx-auto mb-5 w-full max-w-[860px] rounded-[var(--radius-lg)] border border-[var(--color-error)]/25 bg-[var(--color-error-container)]/18 px-4 py-3 text-xs text-[var(--color-error)]">
              {turnChangeLoadError}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {showJumpToLatest && (
        <button
          type="button"
          onClick={handleJumpToLatest}
          title={t('chat.jumpToLatest')}
          aria-label={t('chat.jumpToLatest')}
          className="absolute bottom-4 right-5 z-20 flex h-9 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 text-xs font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-dropdown)] transition-colors hover:border-[var(--color-brand)]/50 hover:bg-[var(--color-surface-container-low)]"
        >
          <ArrowDown size={15} aria-hidden="true" />
          <span>{t('chat.jumpToLatest')}</span>
        </button>
      )}

      <ConfirmDialog
        open={Boolean(confirmTurnCard)}
        onClose={() => {
          if (!rewindingTurnId) {
            setTurnUndoConfirmTargetId(null)
          }
        }}
        onConfirm={handleUndoCurrentTurn}
        title={confirmTurnCard?.isLatest
          ? t('chat.turnChangesLatestConfirmTitle')
          : t('chat.turnChangesHistoricalConfirmTitle')}
        body={confirmTurnCard?.isLatest
          ? t('chat.turnChangesLatestConfirmBody')
          : t('chat.turnChangesHistoricalConfirmBody')}
        confirmLabel={confirmTurnCard?.isLatest
          ? t('chat.turnChangesLatestConfirmUndo')
          : t('chat.turnChangesHistoricalConfirmUndo')}
        cancelLabel={t('common.cancel')}
        confirmVariant="danger"
        loading={Boolean(rewindingTurnId)}
      />
    </div>
  )
}

export const MessageBlock = memo(function MessageBlock({
  sessionId,
  message,
  activeThinkingId,
  agentTaskNotifications,
  toolResult,
}: {
  sessionId?: string | null
  message: UIMessage
  activeThinkingId: string | null
  agentTaskNotifications: Record<string, AgentTaskNotification>
  toolResult?: { content: unknown; isError: boolean } | null
}) {
  const t = useTranslation()

  switch (message.type) {
    case 'user_text':
      return (
        <UserMessage
          content={message.content}
          attachments={message.attachments}
        />
      )
    case 'assistant_text':
      return <AssistantMessage content={message.content} />
    case 'thinking':
      return <ThinkingBlock content={message.content} isActive={message.id === activeThinkingId} />
    case 'tool_use':
      if (message.toolName === 'AskUserQuestion') {
        return (
          <AskUserQuestion
            sessionId={sessionId}
            toolUseId={message.toolUseId}
            input={message.input}
            result={toolResult?.content}
          />
        )
      }
      return (
        <ToolCallBlock
          toolName={message.toolName}
          input={message.input}
          result={toolResult}
          agentTaskNotification={
            message.toolName === 'Agent'
              ? agentTaskNotifications[message.toolUseId]
              : undefined
          }
        />
      )
    case 'tool_result':
      return (
        <ToolResultBlock
          content={message.content}
          isError={message.isError}
          standalone
        />
      )
    case 'permission_request':
      return (
        <PermissionDialog
          sessionId={sessionId}
          requestId={message.requestId}
          toolName={message.toolName}
          input={message.input}
          description={message.description}
        />
      )
    case 'error': {
      const errorKey = message.code ? `error.${message.code}` as TranslationKey : null
      const errorText = errorKey ? t(errorKey) : null
      const displayMessage = (errorText && errorText !== errorKey) ? errorText : message.message
      const showRawDetail =
        Boolean(message.message) &&
        message.message.trim() !== '' &&
        message.message !== displayMessage
      return (
        <div className="mb-3 px-4 py-2.5 rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error-container)]/28 text-sm text-[var(--color-error)]">
          <strong>Error:</strong> {displayMessage}
          {showRawDetail && (
            <div className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-on-error-container)]/85">
              {message.message}
            </div>
          )}
        </div>
      )
    }
    case 'task_summary':
      return <InlineTaskSummary tasks={message.tasks} />
    case 'system':
      return (
        <div className="mb-3 text-center text-xs text-[var(--color-text-tertiary)]">
          {message.content}
        </div>
      )
  }
})
