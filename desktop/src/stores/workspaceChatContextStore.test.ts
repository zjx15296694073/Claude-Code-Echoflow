import { beforeEach, describe, expect, it } from 'vitest'
import {
  formatWorkspaceReferencePrompt,
  useWorkspaceChatContextStore,
} from './workspaceChatContextStore'

const initialState = useWorkspaceChatContextStore.getInitialState()

describe('workspaceChatContextStore', () => {
  beforeEach(() => {
    useWorkspaceChatContextStore.setState(initialState, true)
  })

  it('deduplicates file references per session', () => {
    const store = useWorkspaceChatContextStore.getState()

    store.addReference('session-1', {
      kind: 'file',
      path: 'src/App.tsx',
      absolutePath: '/repo/src/App.tsx',
      name: 'App.tsx',
    })
    store.addReference('session-1', {
      kind: 'file',
      path: 'src/App.tsx',
      absolutePath: '/repo/src/App.tsx',
      name: 'App.tsx',
    })

    expect(useWorkspaceChatContextStore.getState().referencesBySession['session-1']).toHaveLength(1)
  })

  it('formats line comments into the request prompt', () => {
    const prompt = formatWorkspaceReferencePrompt([
      {
        id: 'ref-1',
        kind: 'code-comment',
        path: 'src/App.tsx',
        absolutePath: '/repo/src/App.tsx',
        name: 'App.tsx',
        lineStart: 12,
        lineEnd: 12,
        note: 'Use a clearer name',
        quote: 'const value = 1',
      },
    ])

    expect(prompt).toContain('Notes for attached workspace files:')
    expect(prompt).toContain('- src/App.tsx:L12')
    expect(prompt).toContain('Comment: Use a clearer name')
    expect(prompt).toContain('Selected code: const value = 1')
    expect(prompt).not.toContain('Use the Read tool')
    expect(prompt).not.toContain('Path: /repo/src/App.tsx')
  })

  it('does not add prompt text for plain file attachments', () => {
    const prompt = formatWorkspaceReferencePrompt([
      {
        id: 'ref-1',
        kind: 'file',
        path: 'src/App.tsx',
        absolutePath: '/repo/src/App.tsx',
        name: 'App.tsx',
      },
    ])

    expect(prompt).toBe('')
  })
})
