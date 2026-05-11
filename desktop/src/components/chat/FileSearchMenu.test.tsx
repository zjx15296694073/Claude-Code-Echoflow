import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { FileSearchMenu } from './FileSearchMenu'
import { ApiError } from '../../api/client'
import { filesystemApi } from '../../api/filesystem'
import { useSettingsStore } from '../../stores/settingsStore'

vi.mock('../../api/filesystem', () => ({
  filesystemApi: {
    browse: vi.fn(),
    search: vi.fn(),
  },
}))

describe('FileSearchMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ locale: 'en' })
  })

  it('shows an explicit error when directory browsing is denied', async () => {
    vi.mocked(filesystemApi.browse).mockRejectedValueOnce(
      new ApiError(403, { error: 'Access denied: path outside allowed directory' }),
    )

    render(
      <FileSearchMenu
        cwd="/private/tmp"
        onSelect={() => {}}
      />,
    )

    expect(await screen.findByText('Cannot access this directory')).toBeInTheDocument()
    expect(screen.queryByText('No files in this directory')).not.toBeInTheDocument()
  })

  it('renders returned files when browsing succeeds', async () => {
    vi.mocked(filesystemApi.browse).mockResolvedValueOnce({
      currentPath: '/tmp',
      parentPath: '/',
      entries: [
        { name: 'preview.png', path: '/tmp/preview.png', isDirectory: false },
      ],
    })

    render(
      <FileSearchMenu
        cwd="/tmp"
        onSelect={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('preview.png')).toBeInTheDocument()
    })
  })

  it('navigates directories without selecting them as attachments', async () => {
    const onSelect = vi.fn()
    const onNavigate = vi.fn()
    vi.mocked(filesystemApi.search).mockResolvedValueOnce({
      currentPath: '/repo',
      parentPath: '/',
      query: 'backend',
      entries: [
        { name: 'backend', path: '/repo/backend', isDirectory: true },
      ],
    })
    vi.mocked(filesystemApi.browse).mockResolvedValueOnce({
      currentPath: '/repo/backend',
      parentPath: '/repo',
      entries: [
        { name: 'src', path: '/repo/backend/src', isDirectory: true },
      ],
    })

    render(
      <FileSearchMenu
        cwd="/repo"
        filter="backend"
        onSelect={onSelect}
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(await screen.findByText('backend'))

    expect(onSelect).not.toHaveBeenCalled()
    expect(onNavigate).toHaveBeenCalledWith('backend/')
    await waitFor(() => {
      expect(filesystemApi.browse).toHaveBeenCalledWith('/repo/backend', { includeFiles: true })
    })
  })

  it('passes nested relative file paths when selecting a file', async () => {
    const onSelect = vi.fn()
    vi.mocked(filesystemApi.search).mockResolvedValueOnce({
      currentPath: '/repo/backend/src',
      parentPath: '/repo/backend',
      query: 'pictactic',
      entries: [
        { name: 'pictactic', path: '/repo/backend/src/pictactic', isDirectory: false },
      ],
    })

    render(
      <FileSearchMenu
        cwd="/repo"
        filter="backend/src/pictactic"
        onSelect={onSelect}
      />,
    )

    fireEvent.click(await screen.findByText('pictactic'))

    expect(onSelect).toHaveBeenCalledWith('/repo/backend/src/pictactic', 'backend/src/pictactic')
  })
})
