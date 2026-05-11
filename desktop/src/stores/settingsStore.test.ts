import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'

describe('settingsStore locale defaults', () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.clear()
  })

  it('defaults to Chinese when no locale is stored', async () => {
    const { useSettingsStore } = await import('./settingsStore')

    expect(useSettingsStore.getState().locale).toBe('zh')
  })

  it('keeps a stored locale override', async () => {
    window.localStorage.setItem('cc-haha-locale', 'en')

    const { useSettingsStore } = await import('./settingsStore')

    expect(useSettingsStore.getState().locale).toBe('en')
  })
})

describe('settingsStore desktop notification persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('defaults desktop notifications to explicit opt-in', async () => {
    vi.doMock('../api/settings', () => ({
      settingsApi: {
        getUser: vi.fn(),
        updateUser: vi.fn(),
        getPermissionMode: vi.fn(),
        setPermissionMode: vi.fn(),
        getCliLauncherStatus: vi.fn(),
      },
    }))
    vi.doMock('../api/models', () => ({
      modelsApi: {
        list: vi.fn(),
        getCurrent: vi.fn(),
        setCurrent: vi.fn(),
        getEffort: vi.fn(),
        setEffort: vi.fn(),
      },
    }))
    vi.doMock('../api/h5Access', () => ({
      h5AccessApi: {
        get: vi.fn().mockResolvedValue({
          settings: {
            enabled: false,
            tokenPreview: null,
            allowedOrigins: [],
            publicBaseUrl: null,
          },
        }),
        enable: vi.fn(),
        disable: vi.fn(),
        regenerate: vi.fn(),
        update: vi.fn(),
      },
    }))

    const { useSettingsStore } = await import('./settingsStore')

    expect(useSettingsStore.getState().desktopNotificationsEnabled).toBe(false)
  })

  it('keeps desktop notifications disabled when user settings do not opt in', async () => {
    vi.doMock('../api/settings', () => ({
      settingsApi: {
        getUser: vi.fn().mockResolvedValue({}),
        updateUser: vi.fn(),
        getPermissionMode: vi.fn().mockResolvedValue({ mode: 'default' }),
        setPermissionMode: vi.fn(),
        getCliLauncherStatus: vi.fn(),
      },
    }))
    vi.doMock('../api/models', () => ({
      modelsApi: {
        list: vi.fn().mockResolvedValue({ models: [] }),
        getCurrent: vi.fn().mockResolvedValue({ model: null }),
        setCurrent: vi.fn(),
        getEffort: vi.fn().mockResolvedValue({ level: 'medium' }),
        setEffort: vi.fn(),
      },
    }))
    vi.doMock('../api/h5Access', () => ({
      h5AccessApi: {
        get: vi.fn().mockResolvedValue({
          settings: {
            enabled: false,
            tokenPreview: null,
            allowedOrigins: [],
            publicBaseUrl: null,
          },
        }),
        enable: vi.fn(),
        disable: vi.fn(),
        regenerate: vi.fn(),
        update: vi.fn(),
      },
    }))

    const { useSettingsStore } = await import('./settingsStore')

    await useSettingsStore.getState().fetchAll()

    expect(useSettingsStore.getState().desktopNotificationsEnabled).toBe(false)
  })

  it('persists the latest desktop notification toggle when saves overlap', async () => {
    const pendingSaves: Array<() => void> = []
    const updateUser = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          pendingSaves.push(() => resolve({ ok: true }))
        }),
    )

    vi.doMock('../api/settings', () => ({
      settingsApi: {
        getUser: vi.fn(),
        updateUser,
        getPermissionMode: vi.fn(),
        setPermissionMode: vi.fn(),
        getCliLauncherStatus: vi.fn(),
      },
    }))
    vi.doMock('../api/models', () => ({
      modelsApi: {
        list: vi.fn(),
        getCurrent: vi.fn(),
        setCurrent: vi.fn(),
        getEffort: vi.fn(),
        setEffort: vi.fn(),
      },
    }))
    vi.doMock('../api/h5Access', () => ({
      h5AccessApi: {
        get: vi.fn().mockResolvedValue({
          settings: {
            enabled: false,
            tokenPreview: null,
            allowedOrigins: [],
            publicBaseUrl: null,
          },
        }),
        enable: vi.fn(),
        disable: vi.fn(),
        regenerate: vi.fn(),
        update: vi.fn(),
      },
    }))

    const { useSettingsStore } = await import('./settingsStore')

    const firstSave = useSettingsStore.getState().setDesktopNotificationsEnabled(false)
    await vi.waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ desktopNotificationsEnabled: false })
    })

    const secondSave = useSettingsStore.getState().setDesktopNotificationsEnabled(true)
    expect(useSettingsStore.getState().desktopNotificationsEnabled).toBe(true)

    pendingSaves.shift()?.()
    await vi.waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ desktopNotificationsEnabled: true })
    })
    pendingSaves.shift()?.()
    await Promise.all([firstSave, secondSave])

    expect(updateUser).toHaveBeenLastCalledWith({ desktopNotificationsEnabled: true })
    expect(useSettingsStore.getState().desktopNotificationsEnabled).toBe(true)
  })
})

describe('settingsStore H5 access behavior', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it.each([404, 405])('falls back to disabled defaults only for legacy H5 endpoint status %s', async (status) => {
    vi.doMock('../api/settings', () => ({
      settingsApi: {
        getUser: vi.fn().mockResolvedValue({}),
        updateUser: vi.fn(),
        getPermissionMode: vi.fn().mockResolvedValue({ mode: 'default' }),
        setPermissionMode: vi.fn(),
        getCliLauncherStatus: vi.fn(),
      },
    }))
    vi.doMock('../api/models', () => ({
      modelsApi: {
        list: vi.fn().mockResolvedValue({ models: [] }),
        getCurrent: vi.fn().mockResolvedValue({ model: null }),
        setCurrent: vi.fn(),
        getEffort: vi.fn().mockResolvedValue({ level: 'medium' }),
        setEffort: vi.fn(),
      },
    }))
    vi.doMock('../api/h5Access', () => ({
      h5AccessApi: {
        get: vi.fn().mockRejectedValue(new ApiError(status, { message: 'legacy' })),
        enable: vi.fn(),
        disable: vi.fn(),
        regenerate: vi.fn(),
        update: vi.fn(),
      },
    }))

    const { useSettingsStore } = await import('./settingsStore')
    useSettingsStore.setState({
      h5Access: {
        enabled: true,
        tokenPreview: 'h5_prev',
        allowedOrigins: ['https://prev.example'],
        publicBaseUrl: 'https://prev.example/app',
      },
    })

    await useSettingsStore.getState().fetchAll()

    expect(useSettingsStore.getState().h5Access).toEqual({
      enabled: false,
      tokenPreview: null,
      allowedOrigins: [],
      publicBaseUrl: null,
    })
    expect(useSettingsStore.getState().h5AccessError).toBeNull()
  })

  it('preserves the last known H5 state and surfaces an H5 error on non-legacy load failures', async () => {
    vi.doMock('../api/settings', () => ({
      settingsApi: {
        getUser: vi.fn().mockResolvedValue({}),
        updateUser: vi.fn(),
        getPermissionMode: vi.fn().mockResolvedValue({ mode: 'default' }),
        setPermissionMode: vi.fn(),
        getCliLauncherStatus: vi.fn(),
      },
    }))
    vi.doMock('../api/models', () => ({
      modelsApi: {
        list: vi.fn().mockResolvedValue({ models: [] }),
        getCurrent: vi.fn().mockResolvedValue({ model: null }),
        setCurrent: vi.fn(),
        getEffort: vi.fn().mockResolvedValue({ level: 'medium' }),
        setEffort: vi.fn(),
      },
    }))
    vi.doMock('../api/h5Access', () => ({
      h5AccessApi: {
        get: vi.fn().mockRejectedValue(new ApiError(500, { message: 'H5 unavailable' })),
        enable: vi.fn(),
        disable: vi.fn(),
        regenerate: vi.fn(),
        update: vi.fn(),
      },
    }))

    const { useSettingsStore } = await import('./settingsStore')
    useSettingsStore.setState({
      h5Access: {
        enabled: true,
        tokenPreview: 'h5_prev',
        allowedOrigins: ['https://prev.example'],
        publicBaseUrl: 'https://prev.example/app',
      },
    })

    await useSettingsStore.getState().fetchAll()

    expect(useSettingsStore.getState().h5Access).toEqual({
      enabled: true,
      tokenPreview: 'h5_prev',
      allowedOrigins: ['https://prev.example'],
      publicBaseUrl: 'https://prev.example/app',
    })
    expect(useSettingsStore.getState().h5AccessError).toBe('H5 unavailable')
  })

  it('handles H5 enable, regenerate, and disable transitions without persisting a raw token in store state', async () => {
    vi.doMock('../api/settings', () => ({
      settingsApi: {
        getUser: vi.fn(),
        updateUser: vi.fn(),
        getPermissionMode: vi.fn(),
        setPermissionMode: vi.fn(),
        getCliLauncherStatus: vi.fn(),
      },
    }))
    vi.doMock('../api/models', () => ({
      modelsApi: {
        list: vi.fn(),
        getCurrent: vi.fn(),
        setCurrent: vi.fn(),
        getEffort: vi.fn(),
        setEffort: vi.fn(),
      },
    }))
    vi.doMock('../api/h5Access', () => ({
      h5AccessApi: {
        get: vi.fn(),
        enable: vi.fn().mockResolvedValue({
          settings: {
            enabled: true,
            tokenPreview: 'h5_first',
            allowedOrigins: [],
            publicBaseUrl: null,
          },
          token: 'raw-enable-token',
        }),
        disable: vi.fn().mockResolvedValue({
          settings: {
            enabled: false,
            tokenPreview: null,
            allowedOrigins: [],
            publicBaseUrl: null,
          },
        }),
        regenerate: vi.fn().mockResolvedValue({
          settings: {
            enabled: true,
            tokenPreview: 'h5_second',
            allowedOrigins: ['https://phone.example'],
            publicBaseUrl: 'https://phone.example/app',
          },
          token: 'raw-regenerated-token',
        }),
        update: vi.fn(),
      },
    }))

    const { useSettingsStore } = await import('./settingsStore')

    await expect(useSettingsStore.getState().enableH5Access()).resolves.toBe('raw-enable-token')
    expect(useSettingsStore.getState().h5Access).toEqual({
      enabled: true,
      tokenPreview: 'h5_first',
      allowedOrigins: [],
      publicBaseUrl: null,
    })

    await expect(useSettingsStore.getState().regenerateH5AccessToken()).resolves.toBe('raw-regenerated-token')
    expect(useSettingsStore.getState().h5Access).toEqual({
      enabled: true,
      tokenPreview: 'h5_second',
      allowedOrigins: ['https://phone.example'],
      publicBaseUrl: 'https://phone.example/app',
    })

    await expect(useSettingsStore.getState().disableH5Access()).resolves.toBeUndefined()
    expect(useSettingsStore.getState().h5Access).toEqual({
      enabled: false,
      tokenPreview: null,
      allowedOrigins: [],
      publicBaseUrl: null,
    })
    expect(useSettingsStore.getState().h5AccessError).toBeNull()
    expect('h5AccessGeneratedToken' in useSettingsStore.getState()).toBe(false)
  })
})
