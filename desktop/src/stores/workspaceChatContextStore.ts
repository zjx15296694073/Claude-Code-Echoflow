import { create } from 'zustand'

export type WorkspaceChatReferenceKind = 'file' | 'code-comment'

export type WorkspaceChatReference = {
  id: string
  kind: WorkspaceChatReferenceKind
  path: string
  absolutePath?: string
  name: string
  lineStart?: number
  lineEnd?: number
  note?: string
  quote?: string
}

type WorkspaceChatContextStore = {
  referencesBySession: Record<string, WorkspaceChatReference[] | undefined>
  addReference: (
    sessionId: string,
    reference: Omit<WorkspaceChatReference, 'id'> & { id?: string },
  ) => void
  removeReference: (sessionId: string, referenceId: string) => void
  clearReferences: (sessionId: string) => void
  clearSession: (sessionId: string) => void
}

function makeReferenceId(reference: Omit<WorkspaceChatReference, 'id'>) {
  const linePart = reference.lineStart
    ? `${reference.lineStart}-${reference.lineEnd ?? reference.lineStart}`
    : 'file'
  const notePart = reference.note ? reference.note.slice(0, 48) : ''
  return `${reference.kind}:${reference.path}:${linePart}:${notePart}`
}

function getReferenceDedupKey(reference: WorkspaceChatReference) {
  if (reference.kind === 'file') return `${reference.kind}:${reference.path}`
  return `${reference.kind}:${reference.path}:${reference.lineStart ?? ''}:${reference.lineEnd ?? ''}:${reference.note ?? ''}`
}

export function formatWorkspaceReferenceLocation(reference: WorkspaceChatReference) {
  if (!reference.lineStart) return reference.path
  const lineEnd = reference.lineEnd && reference.lineEnd !== reference.lineStart
    ? `-L${reference.lineEnd}`
    : ''
  return `${reference.path}:L${reference.lineStart}${lineEnd}`
}

export function formatWorkspaceReferencePrompt(references: WorkspaceChatReference[]) {
  const referencesWithContext = references.filter((reference) =>
    reference.kind === 'code-comment' ||
    !!reference.lineStart ||
    !!reference.note?.trim() ||
    !!reference.quote?.trim(),
  )
  if (referencesWithContext.length === 0) return ''

  const lines = [
    'Notes for attached workspace files:',
    ...referencesWithContext.map((reference) => {
      const location = formatWorkspaceReferenceLocation(reference)
      const parts = [`- ${location}`]
      if (reference.note?.trim()) parts.push(`Comment: ${reference.note.trim()}`)
      if (reference.quote?.trim()) parts.push(`Selected code: ${reference.quote.trim()}`)
      return parts.join('\n  ')
    }),
  ]

  return lines.join('\n')
}

export const useWorkspaceChatContextStore = create<WorkspaceChatContextStore>((set) => ({
  referencesBySession: {},

  addReference: (sessionId, input) =>
    set((state) => {
      const reference: WorkspaceChatReference = {
        ...input,
        id: input.id ?? makeReferenceId(input),
      }
      const existing = state.referencesBySession[sessionId] ?? []
      const nextKey = getReferenceDedupKey(reference)
      const withoutDuplicate = existing.filter((item) => getReferenceDedupKey(item) !== nextKey)

      return {
        referencesBySession: {
          ...state.referencesBySession,
          [sessionId]: [...withoutDuplicate, reference],
        },
      }
    }),

  removeReference: (sessionId, referenceId) =>
    set((state) => {
      const existing = state.referencesBySession[sessionId] ?? []
      return {
        referencesBySession: {
          ...state.referencesBySession,
          [sessionId]: existing.filter((reference) => reference.id !== referenceId),
        },
      }
    }),

  clearReferences: (sessionId) =>
    set((state) => ({
      referencesBySession: {
        ...state.referencesBySession,
        [sessionId]: [],
      },
    })),

  clearSession: (sessionId) =>
    set((state) => {
      if (!(sessionId in state.referencesBySession)) return state
      const { [sessionId]: _removed, ...rest } = state.referencesBySession
      return { referencesBySession: rest }
    }),
}))
