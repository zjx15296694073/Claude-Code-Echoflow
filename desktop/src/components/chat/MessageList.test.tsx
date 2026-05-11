import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MessageList, buildRenderModel } from './MessageList'
import { relativizeWorkspacePath } from './CurrentTurnChangeCard'
import { sessionsApi } from '../../api/sessions'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabStore } from '../../stores/tabStore'
import type { UIMessage } from '../../types/chat'
import type { PerSessionState } from '../../stores/chatStore'

const ACTIVE_TAB = 'active-tab'

async function waitForProgrammaticScrollReset() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function makeSessionState(overrides: Partial<PerSessionState> = {}): PerSessionState {
  return {
    messages: [],
    chatState: 'idle',
    connectionState: 'connected',
    streamingText: '',
    streamingToolInput: '',
    activeToolUseId: null,
    activeToolName: null,
    activeThinkingId: null,
    pendingPermission: null,
    pendingComputerUsePermission: null,
    tokenUsage: { input_tokens: 0, output_tokens: 0 },
    elapsedSeconds: 0,
    statusVerb: '',
    slashCommands: [],
    agentTaskNotifications: {},
    elapsedTimer: null,
    composerPrefill: null,
    ...overrides,
  }
}

describe('MessageList nested tool calls', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useSettingsStore.setState({ locale: 'en' })
    useTabStore.setState({ activeTabId: ACTIVE_TAB, tabs: [{ sessionId: ACTIVE_TAB, title: 'Test', type: 'session' as const, status: 'idle' }] })
    useChatStore.setState({ sessions: { [ACTIVE_TAB]: makeSessionState() } })
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockImplementation(
      () => new Promise(() => {}),
    )
    vi.spyOn(sessionsApi, 'getWorkspaceStatus').mockResolvedValue({
      state: 'ok',
      workDir: '/tmp/example-project',
      repoName: 'example-project',
      branch: null,
      isGitRepo: false,
      changedFiles: [],
    })
  })

  it('renders sub-agent tool calls inline beneath the parent agent tool call', () => {
    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'tool-agent',
              type: 'tool_use',
              toolName: 'Agent',
              toolUseId: 'agent-1',
              input: { description: 'Inspect src/components' },
              timestamp: 1,
            },
            {
              id: 'tool-read',
              type: 'tool_use',
              toolName: 'Read',
              toolUseId: 'read-1',
              input: { file_path: '/tmp/example.ts' },
              timestamp: 2,
              parentToolUseId: 'agent-1',
            },
            {
              id: 'result-read',
              type: 'tool_result',
              toolUseId: 'read-1',
              content: 'const answer = 42',
              isError: false,
              timestamp: 3,
              parentToolUseId: 'agent-1',
            },
          ],
        }),
      },
    })

    const { container } = render(<MessageList />)

    expect(screen.getAllByText('Running').length).toBeGreaterThan(0)
    expect(screen.getByText(/Read .*example\.ts.*done/i)).toBeTruthy()
    expect(container.textContent).toContain('Agent')
  })

  it('does not render blank assistant bubbles for whitespace-only text', () => {
    const messages: UIMessage[] = [
      {
        id: 'assistant-empty',
        type: 'assistant_text',
        content: '\n\n  ',
        timestamp: 1,
      },
      {
        id: 'tool-bash',
        type: 'tool_use',
        toolName: 'Bash',
        toolUseId: 'bash-1',
        input: { command: 'pwd' },
        timestamp: 2,
      },
    ]

    const { renderItems } = buildRenderModel(messages)
    expect(renderItems).toHaveLength(1)
    expect(renderItems[0]).toMatchObject({ kind: 'tool_group' })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages,
          streamingText: '\n  ',
        }),
      },
    })

    const { container } = render(<MessageList />)
    expect(container.querySelectorAll('[data-message-shell="assistant"]')).toHaveLength(0)
  })

  it('keeps root tool runs split when nested child tool calls appear between them', () => {
    const messages: UIMessage[] = [
      {
        id: 'tool-agent',
        type: 'tool_use',
        toolName: 'Agent',
        toolUseId: 'agent-1',
        input: { description: 'Inspect src/components' },
        timestamp: 1,
      },
      {
        id: 'tool-read',
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'read-1',
        input: { file_path: '/tmp/example.ts' },
        timestamp: 2,
        parentToolUseId: 'agent-1',
      },
      {
        id: 'result-read',
        type: 'tool_result',
        toolUseId: 'read-1',
        content: 'const answer = 42',
        isError: false,
        timestamp: 3,
        parentToolUseId: 'agent-1',
      },
      {
        id: 'tool-write',
        type: 'tool_use',
        toolName: 'Write',
        toolUseId: 'write-1',
        input: { file_path: '/tmp/out.ts', content: 'export const value = 1' },
        timestamp: 4,
      },
    ]

    const { renderItems } = buildRenderModel(messages)
    const toolGroups = renderItems.filter((item) => item.kind === 'tool_group')

    expect(toolGroups).toHaveLength(2)
    expect(toolGroups.map((item) => item.toolCalls[0]?.toolUseId)).toEqual(['agent-1', 'write-1'])
  })

  it('keeps later nested tool calls under their parent after an interleaved user message', () => {
    const messages: UIMessage[] = [
      {
        id: 'tool-agent',
        type: 'tool_use',
        toolName: 'Agent',
        toolUseId: 'agent-1',
        input: { description: 'Inspect src/components' },
        timestamp: 1,
      },
      {
        id: 'tool-read',
        type: 'tool_use',
        toolName: 'Read',
        toolUseId: 'read-1',
        input: { file_path: '/tmp/example.ts' },
        timestamp: 2,
        parentToolUseId: 'agent-1',
      },
      {
        id: 'user-follow-up',
        type: 'user_text',
        content: '顺便把刚才的问题也处理掉',
        timestamp: 3,
      },
      {
        id: 'tool-write',
        type: 'tool_use',
        toolName: 'Write',
        toolUseId: 'write-1',
        input: { file_path: '/tmp/out.ts', content: 'export const value = 1' },
        timestamp: 4,
        parentToolUseId: 'agent-1',
      },
    ]

    const { renderItems, childToolCallsByParent } = buildRenderModel(messages)
    const renderedKinds = renderItems.map((item) =>
      item.kind === 'tool_group'
        ? `tool:${item.toolCalls[0]?.toolUseId}`
        : `message:${item.message.id}`,
    )

    expect(renderedKinds).toEqual([
      'tool:agent-1',
      'message:user-follow-up',
    ])
    expect(
      (childToolCallsByParent.get('agent-1') ?? []).map((toolCall) => toolCall.toolUseId),
    ).toEqual(['read-1', 'write-1'])
  })

  it('does not render parented orphan tool results as root session messages', () => {
    const messages: UIMessage[] = [
      {
        id: 'tool-agent',
        type: 'tool_use',
        toolName: 'Agent',
        toolUseId: 'agent-1',
        input: { description: 'Inspect src/components' },
        timestamp: 1,
      },
      {
        id: 'result-child',
        type: 'tool_result',
        toolUseId: 'grep-1',
        content: 'Found 22 files',
        isError: false,
        timestamp: 2,
        parentToolUseId: 'agent-1',
      },
    ]

    const { renderItems } = buildRenderModel(messages)

    expect(renderItems).toHaveLength(1)
    expect(renderItems[0]).toMatchObject({ kind: 'tool_group' })
  })

  it('shows failed agent status and compact unavailable summary for Explore launch errors', () => {
    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'tool-agent',
              type: 'tool_use',
              toolName: 'Agent',
              toolUseId: 'agent-1',
              input: { description: '探索整体架构', subagent_type: 'Explore' },
              timestamp: 1,
            },
            {
              id: 'result-agent',
              type: 'tool_result',
              toolUseId: 'agent-1',
              content: `Agent type 'Explore' not found. Available agents: general-purpose`,
              isError: true,
              timestamp: 2,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('Explore agent unavailable in this session')).toBeTruthy()
  })

  it('shows completed agent output when no nested tool activity is available', () => {
    const longResult = '探索完成。让我将结果整合写入计划文件。第二段补充内容用于验证 dialog 展示的是完整结果而不是截断摘要。'

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'tool-agent',
              type: 'tool_use',
              toolName: 'Agent',
              toolUseId: 'agent-1',
              input: { description: '探索整体架构' },
              timestamp: 1,
            },
            {
              id: 'result-agent',
              type: 'tool_result',
              toolUseId: 'agent-1',
              content: {
                status: 'completed',
                content: [
                  { type: 'text', text: longResult },
                  {
                    type: 'text',
                    text: "agentId: a0c0c732f61442dc1 (use SendMessage with to: 'a0c0c732f61442dc1' to continue this agent)\n<usage>total_tokens: 17195\ntool_uses: 2\nduration_ms: 41368</usage>",
                  },
                ],
              },
              isError: false,
              timestamp: 2,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View result' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'View result' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/第二段补充内容用于验证 dialog 展示的是完整结果而不是截断摘要。/)).toBeTruthy()
    expect(within(dialog).queryByText(/agentId:/)).toBeNull()
    expect(within(dialog).queryByText(/total_tokens/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeTruthy()
  })

  it('keeps async launched agents in running state until a terminal notification arrives', () => {
    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'tool-agent',
              type: 'tool_use',
              toolName: 'Agent',
              toolUseId: 'agent-1',
              input: { description: '修复临时文件泄漏' },
              timestamp: 1,
            },
            {
              id: 'result-agent',
              type: 'tool_result',
              toolUseId: 'agent-1',
              content:
                "Async agent launched successfully.\nagentId: a29934b04b20ed564 (internal ID - do not mention to user. Use SendMessage with to: 'a29934b04b20ed564' to continue this agent.)\nThe agent is working in the background. You will be notified automatically when it completes.",
              isError: false,
              timestamp: 2,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    expect(screen.getAllByText('Running').length).toBeGreaterThan(0)
    expect(screen.queryByText('Done')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View result' })).toBeNull()
  })

  it('renders copy controls for user messages and scopes assistant copy to a single reply', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '请帮我探索整体架构',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: '先看 CLI 和服务端入口。',
              timestamp: 2,
            },
            {
              id: 'assistant-2',
              type: 'assistant_text',
              content: '再看 desktop 前后端边界。',
              timestamp: 3,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Copy reply' })[1]!)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('再看 desktop 前后端边界。')
    })
    expect(writeText).not.toHaveBeenCalledWith(
      '先看 CLI 和服务端入口。\n再看 desktop 前后端边界。'
    )
  })

  it('does not force-scroll to the bottom while the user is reading history', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          chatState: 'streaming',
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '历史消息',
              timestamp: 1,
            },
          ],
          streamingText: 'streaming',
        }),
      },
    })

    const { container } = render(<MessageList />)
    const scroller = container.querySelector('.overflow-y-auto') as HTMLDivElement
    let scrollTop = 120
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollTop = value
      },
    })

    scrollIntoView.mockClear()
    await waitForProgrammaticScrollReset()
    fireEvent.scroll(scroller)

    act(() => {
      useChatStore.setState((state) => ({
        sessions: {
          ...state.sessions,
          [ACTIVE_TAB]: {
            ...state.sessions[ACTIVE_TAB]!,
            streamingText: 'streaming new token',
          },
        },
      }))
    })

    await waitFor(() => {
      expect(screen.getByText('streaming new token')).toBeTruthy()
    })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('keeps auto-scrolling when new output arrives while already near the bottom', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          chatState: 'streaming',
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '最新消息',
              timestamp: 1,
            },
          ],
          streamingText: 'streaming',
        }),
      },
    })

    const { container } = render(<MessageList />)
    const scroller = container.querySelector('.overflow-y-auto') as HTMLDivElement
    let scrollTop = 552
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollTop = value
      },
    })

    scrollIntoView.mockClear()
    await waitForProgrammaticScrollReset()
    fireEvent.scroll(scroller)

    act(() => {
      useChatStore.setState((state) => ({
        sessions: {
          ...state.sessions,
          [ACTIVE_TAB]: {
            ...state.sessions[ACTIVE_TAB]!,
            streamingText: 'streaming next token',
          },
        },
      }))
    })

    await waitFor(() => {
      expect(screen.getByText('streaming next token')).toBeTruthy()
    })
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('restores a session scroll position when switching back to a tab', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    useTabStore.setState({
      activeTabId: 'session-a',
      tabs: [
        { sessionId: 'session-a', title: 'A', type: 'session' as const, status: 'idle' },
        { sessionId: 'session-b', title: 'B', type: 'session' as const, status: 'idle' },
      ],
    })
    useChatStore.setState({
      sessions: {
        'session-a': makeSessionState({
          messages: [
            { id: 'a-user', type: 'user_text', content: 'A prompt', timestamp: 1 },
            { id: 'a-assistant', type: 'assistant_text', content: 'A response', timestamp: 2 },
          ],
        }),
        'session-b': makeSessionState({
          messages: [
            { id: 'b-user', type: 'user_text', content: 'B prompt', timestamp: 1 },
            { id: 'b-assistant', type: 'assistant_text', content: 'B response', timestamp: 2 },
          ],
        }),
      },
    })

    const { container } = render(<MessageList />)
    const scroller = container.querySelector('.overflow-y-auto') as HTMLDivElement
    let scrollTop = 180
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1200 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollTop = value
      },
    })

    await waitForProgrammaticScrollReset()
    fireEvent.scroll(scroller)
    expect(screen.getByRole('button', { name: 'Latest' })).toBeTruthy()

    act(() => {
      useTabStore.setState({ activeTabId: 'session-b' })
    })
    await waitFor(() => {
      expect(screen.getByText('B response')).toBeTruthy()
    })

    scrollTop = 760
    await waitForProgrammaticScrollReset()
    fireEvent.scroll(scroller)

    act(() => {
      useTabStore.setState({ activeTabId: 'session-a' })
    })
    await waitFor(() => {
      expect(screen.getByText('A response')).toBeTruthy()
    })

    expect(scrollTop).toBe(180)
    expect(screen.getByRole('button', { name: 'Latest' })).toBeTruthy()
  })

  it('scrolls new sessions to the latest message instead of inheriting another tab position', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    useTabStore.setState({
      activeTabId: 'session-a',
      tabs: [
        { sessionId: 'session-a', title: 'A', type: 'session' as const, status: 'idle' },
        { sessionId: 'session-fresh', title: 'Fresh', type: 'session' as const, status: 'idle' },
      ],
    })
    useChatStore.setState({
      sessions: {
        'session-a': makeSessionState({
          messages: [
            { id: 'a-user', type: 'user_text', content: 'A prompt', timestamp: 1 },
            { id: 'a-assistant', type: 'assistant_text', content: 'A response', timestamp: 2 },
          ],
        }),
        'session-fresh': makeSessionState({
          messages: [
            { id: 'fresh-user', type: 'user_text', content: 'Fresh prompt', timestamp: 1 },
            { id: 'fresh-assistant', type: 'assistant_text', content: 'Fresh latest response', timestamp: 2 },
          ],
        }),
      },
    })

    const { container } = render(<MessageList />)
    const scroller = container.querySelector('.overflow-y-auto') as HTMLDivElement
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1200 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      value: 150,
      writable: true,
    })

    fireEvent.scroll(scroller)
    scrollIntoView.mockClear()

    act(() => {
      useTabStore.setState({ activeTabId: 'session-fresh' })
    })

    await waitFor(() => {
      expect(screen.getByText('Fresh latest response')).toBeTruthy()
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'end' })
    })
  })

  it('shows a latest button when reading history and resumes following after clicking it', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          chatState: 'streaming',
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '历史消息',
              timestamp: 1,
            },
          ],
          streamingText: 'streaming',
        }),
      },
    })

    const { container } = render(<MessageList />)
    const scroller = container.querySelector('.overflow-y-auto') as HTMLDivElement
    let scrollTop = 120
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollTop = value
      },
    })

    scrollIntoView.mockClear()
    await waitForProgrammaticScrollReset()
    fireEvent.scroll(scroller)
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }))

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' })
    expect(screen.queryByRole('button', { name: 'Latest' })).toBeNull()

    scrollIntoView.mockClear()
    act(() => {
      useChatStore.setState((state) => ({
        sessions: {
          ...state.sessions,
          [ACTIVE_TAB]: {
            ...state.sessions[ACTIVE_TAB]!,
            streamingText: 'streaming after jump',
          },
        },
      }))
    })

    await waitFor(() => {
      expect(screen.getByText('streaming after jump')).toBeTruthy()
    })
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'end' })
  })

  it('keeps user actions anchored to the right bubble and assistant actions to the left bubble', () => {
    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '请把这条 prompt 放在右侧',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: '这条回复应该停在左侧。',
              timestamp: 2,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    const userShell = screen.getByText('请把这条 prompt 放在右侧').closest('[data-message-shell="user"]')
    const assistantShell = screen.getByText('这条回复应该停在左侧。').closest('[data-message-shell="assistant"]')
    const userActions = screen.getByRole('button', { name: 'Copy prompt' }).closest('[data-message-actions]')
    const assistantActions = screen.getByRole('button', { name: 'Copy reply' }).closest('[data-message-actions]')

    expect(userShell).toBeTruthy()
    expect(userShell?.className).toContain('items-end')
    expect(assistantShell).toBeTruthy()
    expect(assistantShell?.className).toContain('items-start')
    expect(assistantShell?.className).not.toContain('ml-10')
    expect(userActions?.getAttribute('data-align')).toBe('end')
    expect(assistantActions?.getAttribute('data-align')).toBe('start')
  })

  it('uses the document column for markdown-heavy assistant replies', () => {
    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'assistant-doc',
              type: 'assistant_text',
              content: [
                '## 交付结果',
                '',
                '已完成以下内容：',
                '',
                '- 添加任务',
                '- 删除任务',
                '',
                '```bash',
                'npm run build',
                '```',
              ].join('\n'),
              timestamp: 1,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    const assistantShell = screen.getByText('交付结果').closest('[data-message-shell="assistant"]')
    expect(assistantShell?.getAttribute('data-layout')).toBe('document')
    expect(assistantShell?.className).toContain('w-full')
    expect(assistantShell?.className).not.toContain('ml-10')
  })

  it('does not expose the old message-level rewind action', async () => {
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({
      checkpoints: [
        {
          target: {
            targetUserMessageId: 'user-1',
            userMessageIndex: 0,
            userMessageCount: 1,
          },
          code: {
            available: true,
            filesChanged: ['src/App.tsx'],
            insertions: 4,
            deletions: 1,
          },
        },
      ],
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '做一个页面',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: 'done',
              timestamp: 2,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    expect(await screen.findByRole('button', { name: 'Undo current turn changes' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Rewind to here' })).toBeNull()
  })

  it('keeps historical sessions readable when turn checkpoint payloads are missing', async () => {
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({} as never)

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '继续优化 workflow.py',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: '两个文件均已优化完成，功能保持不变。',
              timestamp: 2,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    expect(await screen.findByText('两个文件均已优化完成，功能保持不变。')).toBeTruthy()
    await waitFor(() => {
      expect(sessionsApi.getTurnCheckpoints).toHaveBeenCalled()
    })
    expect(screen.queryByText(/Cannot read properties/)).toBeNull()
    expect(screen.queryByLabelText('Turn changed files')).toBeNull()
  })

  it('renders multiple historical turn change cards across three turns', async () => {
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({
      checkpoints: [
        {
          target: {
            targetUserMessageId: 'user-1',
            userMessageIndex: 0,
            userMessageCount: 3,
          },
          code: {
            available: true,
            filesChanged: ['src/first.ts'],
            insertions: 3,
            deletions: 1,
          },
        },
        {
          target: {
            targetUserMessageId: 'user-2',
            userMessageIndex: 1,
            userMessageCount: 3,
          },
          code: {
            available: true,
            filesChanged: ['src/second.ts'],
            insertions: 5,
            deletions: 2,
          },
        },
        {
          target: {
            targetUserMessageId: 'user-3',
            userMessageIndex: 2,
            userMessageCount: 3,
          },
          code: {
            available: true,
            filesChanged: [],
            insertions: 0,
            deletions: 0,
          },
        },
      ],
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '第一段',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: 'ok',
              timestamp: 2,
            },
            {
              id: 'user-2',
              type: 'user_text',
              content: '第二段',
              timestamp: 3,
            },
            {
              id: 'assistant-2',
              type: 'assistant_text',
              content: 'done',
              timestamp: 4,
            },
            {
              id: 'user-3',
              type: 'user_text',
              content: '第三段',
              timestamp: 5,
            },
            {
              id: 'assistant-3',
              type: 'assistant_text',
              content: 'done',
              timestamp: 6,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    const cards = await screen.findAllByLabelText('Turn changed files')
    expect(cards).toHaveLength(2)
    expect(screen.getByText('src/first.ts')).toBeTruthy()
    expect(screen.getByText('src/second.ts')).toBeTruthy()
    expect(screen.queryByText('src/third.ts')).toBeNull()
  })

  it('expands a historical turn diff through the turn checkpoint diff API', async () => {
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({
      checkpoints: [
        {
          target: {
            targetUserMessageId: 'user-1',
            userMessageIndex: 0,
            userMessageCount: 2,
          },
          code: {
            available: true,
            filesChanged: ['src/first.ts'],
            insertions: 1,
            deletions: 1,
          },
        },
        {
          target: {
            targetUserMessageId: 'user-2',
            userMessageIndex: 1,
            userMessageCount: 2,
          },
          code: {
            available: true,
            filesChanged: ['src/second.ts'],
            insertions: 2,
            deletions: 0,
          },
        },
      ],
    })
    vi.spyOn(sessionsApi, 'getWorkspaceDiff').mockResolvedValue({
      state: 'ok',
      path: 'src/first.ts',
      diff: 'diff --session a/src/first.ts b/src/first.ts\n-old\n+new',
    })
    vi.spyOn(sessionsApi, 'getTurnCheckpointDiff').mockResolvedValue({
      state: 'ok',
      path: 'src/first.ts',
      diff: 'diff --session a/src/first.ts b/src/first.ts\n-old\n+new',
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '第一轮',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: 'done',
              timestamp: 2,
            },
            {
              id: 'user-2',
              type: 'user_text',
              content: '第二轮',
              timestamp: 3,
            },
            {
              id: 'assistant-2',
              type: 'assistant_text',
              content: 'done',
              timestamp: 4,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    fireEvent.click(await screen.findByRole('button', { name: 'Show diff for src/first.ts' }))

    const diffSurface = await screen.findByTestId('workspace-code')
    expect(diffSurface.textContent).toContain('+new')
    expect(sessionsApi.getTurnCheckpointDiff).toHaveBeenCalledWith(
      ACTIVE_TAB,
      'user-1',
      'src/first.ts',
      0,
    )
    expect(sessionsApi.getWorkspaceDiff).not.toHaveBeenCalled()
  })

  it('keeps checkpoint paths bound to the original turn cwd when expanding historical diffs', async () => {
    vi.spyOn(sessionsApi, 'getWorkspaceStatus').mockResolvedValue({
      state: 'ok',
      workDir: '/tmp/current-project',
      repoName: 'current-project',
      branch: null,
      isGitRepo: false,
      changedFiles: [],
    })
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({
      checkpoints: [
        {
          target: {
            targetUserMessageId: 'user-1',
            userMessageIndex: 0,
            userMessageCount: 2,
          },
          workDir: '/tmp/old-project',
          code: {
            available: true,
            filesChanged: ['/tmp/old-project/src/first.ts'],
            insertions: 1,
            deletions: 1,
          },
        },
      ],
    })
    vi.spyOn(sessionsApi, 'getTurnCheckpointDiff').mockResolvedValue({
      state: 'ok',
      path: '/tmp/old-project/src/first.ts',
      diff: 'diff --git a/src/first.ts b/src/first.ts\n-old\n+new',
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '第一轮',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: 'done',
              timestamp: 2,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    fireEvent.click(await screen.findByRole('button', { name: 'Show diff for src/first.ts' }))

    await screen.findByTestId('workspace-code')
    expect(sessionsApi.getTurnCheckpointDiff).toHaveBeenCalledWith(
      ACTIVE_TAB,
      'user-1',
      '/tmp/old-project/src/first.ts',
      0,
    )
  })

  it('relativizes Windows checkpoint paths against the turn workdir', () => {
    expect(relativizeWorkspacePath(
      'C:\\Users\\Relakkes\\aacc\\src\\App.tsx',
      'c:/users/relakkes/aacc',
    )).toBe('src/App.tsx')
  })

  it('matches live turn change checkpoints by user message index when transcript ids differ from local UI ids', async () => {
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({
      checkpoints: [
        {
          target: {
            targetUserMessageId: 'transcript-user-1',
            userMessageIndex: 0,
            userMessageCount: 1,
          },
          code: {
            available: true,
            filesChanged: ['src/live.ts'],
            insertions: 7,
            deletions: 0,
          },
        },
      ],
    })
    vi.spyOn(sessionsApi, 'getTurnCheckpointDiff').mockResolvedValue({
      state: 'ok',
      path: 'src/live.ts',
      diff: 'diff --session a/src/live.ts b/src/live.ts\n+live',
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'local-user-temp-id',
              type: 'user_text',
              content: '实时这一轮',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: 'done',
              timestamp: 2,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    expect(await screen.findByText('src/live.ts')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show diff for src/live.ts' }))
    await screen.findByTestId('workspace-code')
    expect(sessionsApi.getTurnCheckpointDiff).toHaveBeenCalledWith(
      ACTIVE_TAB,
      'transcript-user-1',
      'src/live.ts',
      0,
    )
  })

  it('keeps turn change cards anchored when the only response item is filtered from rendering', async () => {
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({
      checkpoints: [
        {
          target: {
            targetUserMessageId: 'user-1',
            userMessageIndex: 0,
            userMessageCount: 1,
          },
          code: {
            available: true,
            filesChanged: ['src/blank-response.ts'],
            insertions: 3,
            deletions: 0,
          },
        },
      ],
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '生成文件',
              timestamp: 1,
            },
            {
              id: 'assistant-empty',
              type: 'assistant_text',
              content: '\n  ',
              timestamp: 2,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    expect(await screen.findByText('src/blank-response.ts')).toBeTruthy()
  })

  it('keeps historical turn change cards visible while the next turn is running', async () => {
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({
      checkpoints: [
        {
          target: {
            targetUserMessageId: 'user-1',
            userMessageIndex: 0,
            userMessageCount: 1,
          },
          code: {
            available: true,
            filesChanged: ['src/first.ts'],
            insertions: 1,
            deletions: 0,
          },
        },
      ],
    })

    const messages: UIMessage[] = [
      {
        id: 'user-1',
        type: 'user_text',
        content: '第一轮',
        timestamp: 1,
      },
      {
        id: 'assistant-1',
        type: 'assistant_text',
        content: 'done',
        timestamp: 2,
      },
    ]

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({ messages }),
      },
    })

    render(<MessageList />)

    expect(await screen.findByText('src/first.ts')).toBeTruthy()

    act(() => {
      useChatStore.setState({
        sessions: {
          [ACTIVE_TAB]: makeSessionState({
            messages,
            chatState: 'thinking',
          }),
        },
      })
    })

    await waitFor(() => {
      expect(screen.getByText('src/first.ts')).toBeTruthy()
    })
  })

  it('confirms before rewinding to an earlier turn from a historical change card', async () => {
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({
      checkpoints: [
        {
          target: {
            targetUserMessageId: 'user-1',
            userMessageIndex: 0,
            userMessageCount: 2,
          },
          code: {
            available: true,
            filesChanged: ['src/first.ts'],
            insertions: 1,
            deletions: 0,
          },
        },
        {
          target: {
            targetUserMessageId: 'user-2',
            userMessageIndex: 1,
            userMessageCount: 2,
          },
          code: {
            available: true,
            filesChanged: ['src/second.ts'],
            insertions: 1,
            deletions: 0,
          },
        },
      ],
    })
    vi.spyOn(sessionsApi, 'rewind')
      .mockResolvedValueOnce({
        target: {
          targetUserMessageId: 'user-1',
          userMessageIndex: 0,
          userMessageCount: 1,
        },
        conversation: {
          messagesRemoved: 2,
        },
        code: {
          available: true,
          filesChanged: ['src/App.tsx'],
          insertions: 1,
          deletions: 0,
        },
      })
      .mockResolvedValueOnce({
        target: {
          targetUserMessageId: 'user-1',
          userMessageIndex: 0,
          userMessageCount: 1,
        },
        conversation: {
          messagesRemoved: 2,
          removedMessageIds: ['user-1', 'assistant-1'],
        },
        code: {
          available: true,
          filesChanged: ['src/App.tsx'],
          insertions: 1,
          deletions: 0,
        },
      })
    const reloadHistory = vi.fn().mockResolvedValue(undefined)
    const queueComposerPrefill = vi.fn()

    useChatStore.setState({
      reloadHistory,
      queueComposerPrefill,
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '做一个页面',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: 'first done',
              timestamp: 2,
            },
            {
              id: 'user-2',
              type: 'user_text',
              content: '第二轮需求',
              timestamp: 3,
            },
            {
              id: 'assistant-2',
              type: 'assistant_text',
              content: 'second done',
              timestamp: 4,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    const historicalCard = (await screen.findByText('src/first.ts')).closest('section')
    expect(historicalCard).toBeTruthy()
    fireEvent.click(
      within(historicalCard as HTMLElement).getByRole('button', {
        name: 'Rewind to before this turn',
      }),
    )

    expect(sessionsApi.rewind).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog', { name: 'Rewind to before this turn?' })
    expect(
      within(dialog).getByText(
        'This will rewind the conversation to before this turn and restore tracked files for that checkpoint.',
      ),
    ).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Rewind to before this turn' }))

    await waitFor(() => {
      expect(sessionsApi.rewind).toHaveBeenLastCalledWith(ACTIVE_TAB, {
        targetUserMessageId: 'user-1',
        userMessageIndex: 0,
        expectedContent: '做一个页面',
      })
    })
    expect(reloadHistory).toHaveBeenCalledWith(ACTIVE_TAB)
    expect(queueComposerPrefill).toHaveBeenCalledWith(ACTIVE_TAB, {
      text: '做一个页面',
      attachments: undefined,
    })
  })

  it('does not render cards for turns without file changes', async () => {
    vi.spyOn(sessionsApi, 'getTurnCheckpoints').mockResolvedValue({
      checkpoints: [
        {
          target: {
            targetUserMessageId: 'user-1',
            userMessageIndex: 0,
            userMessageCount: 2,
          },
          code: {
            available: true,
            filesChanged: ['src/first.ts'],
            insertions: 2,
            deletions: 1,
          },
        },
        {
          target: {
            targetUserMessageId: 'user-2',
            userMessageIndex: 1,
            userMessageCount: 2,
          },
          code: {
            available: true,
            filesChanged: [],
            insertions: 0,
            deletions: 0,
          },
        },
      ],
    })

    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'user-1',
              type: 'user_text',
              content: '第一轮改文件',
              timestamp: 1,
            },
            {
              id: 'assistant-1',
              type: 'assistant_text',
              content: 'first done',
              timestamp: 2,
            },
            {
              id: 'user-2',
              type: 'user_text',
              content: '第二轮只解释',
              timestamp: 3,
            },
            {
              id: 'assistant-2',
              type: 'assistant_text',
              content: 'second done',
              timestamp: 4,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    const cards = await screen.findAllByLabelText('Turn changed files')
    expect(cards).toHaveLength(1)
    expect(screen.getByText('src/first.ts')).toBeTruthy()
    expect(screen.queryByText('src/second.ts')).toBeNull()
  })

  it('shows raw startup details under translated CLI startup errors', () => {
    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: makeSessionState({
          messages: [
            {
              id: 'error-1',
              type: 'error',
              code: 'CLI_START_FAILED',
              message:
                'CLI exited during startup (code 1): Claude Code on Windows requires git-bash (https://git-scm.com/downloads/win).',
              timestamp: 1,
            },
          ],
        }),
      },
    })

    render(<MessageList />)

    expect(screen.getByText('Failed to start CLI process.')).toBeTruthy()
    expect(
      screen.getByText(
        'CLI exited during startup (code 1): Claude Code on Windows requires git-bash (https://git-scm.com/downloads/win).',
      ),
    ).toBeTruthy()
  })
})
