import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { ThemeProviderContext } from "./theme-provider"

const VALID_THEMES = new Set(["light", "dark", "system"])
const THEME_COLORS = {
  light: "#f8fafc",
  dark: "#090d16",
}
const TRANSITION_DURATION_MS = 300
const FALLBACK_CLEANUP_MS = 320
const TRANSITION_CLASSES = ["theme-vt", "theme-vt-crossfade", "theme-transitioning"]

function normalizeTheme(value, fallback) {
  return VALID_THEMES.has(value) ? value : fallback
}

function readStoredTheme(storageKey, fallback) {
  if (typeof window === "undefined") return fallback
  try {
    return normalizeTheme(window.localStorage.getItem(storageKey), fallback)
  } catch {
    return fallback
  }
}

function persistTheme(storageKey, theme) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey, theme)
  } catch {
    /* Ignore storage quota or sandbox restrictions */
  }
}

function getSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light"
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(theme, systemTheme) {
  return theme === "system" ? systemTheme : theme
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function getTransitionOrigin(options) {
  if (!options) return null
  if (
    typeof options.x === "number" &&
    Number.isFinite(options.x) &&
    typeof options.y === "number" &&
    Number.isFinite(options.y)
  ) {
    return { x: options.x, y: options.y }
  }

  const event = options.event
  if (!event) return null

  if (
    typeof event.clientX === "number" &&
    typeof event.clientY === "number" &&
    (event.clientX !== 0 || event.clientY !== 0)
  ) {
    return { x: event.clientX, y: event.clientY }
  }

  const target = event.currentTarget || event.target
  if (target && typeof target.getBoundingClientRect === "function") {
    const rect = target.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
    }
  }

  return null
}

function skipActiveViewTransition(activeVtRef, activeClipAnimRef) {
  const activeAnim = activeClipAnimRef.current
  if (activeAnim) {
    activeClipAnimRef.current = null
    try {
      if (typeof activeAnim.cancel === "function") {
        activeAnim.cancel()
      }
    } catch {
      /* Ignore already-finished clip animations */
    }
  }

  const current = activeVtRef.current
  if (!current) return
  activeVtRef.current = null
  try {
    if (typeof current.skipTransition === "function") {
      current.skipTransition()
    }
  } catch {
    /* Ignore already-settled View Transitions */
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}) {
  const safeDefault = VALID_THEMES.has(defaultTheme) ? defaultTheme : "system"
  const [theme, setThemeState] = useState(() => readStoredTheme(storageKey, safeDefault))
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme())
  const resolvedTheme = resolveTheme(theme, systemTheme)

  const transitionIdRef = useRef(0)
  const activeVtRef = useRef(null)
  const activeClipAnimRef = useRef(null)
  const fallbackTimerRef = useRef(null)
  const latestThemeRef = useRef(theme)
  const latestSystemThemeRef = useRef(systemTheme)
  const latestResolvedThemeRef = useRef(resolvedTheme)

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
  }, [])

  const startFallbackTransition = useCallback(
    (id) => {
      if (typeof document === "undefined" || typeof window === "undefined") return
      const root = document.documentElement
      clearFallbackTimer()
      root.classList.remove("theme-vt", "theme-vt-crossfade")
      root.classList.add("theme-transitioning")
      fallbackTimerRef.current = window.setTimeout(() => {
        if (transitionIdRef.current === id) {
          root.classList.remove("theme-transitioning")
          fallbackTimerRef.current = null
        }
      }, FALLBACK_CLEANUP_MS)
    },
    [clearFallbackTimer]
  )

  useLayoutEffect(() => {
    latestThemeRef.current = theme
    latestSystemThemeRef.current = systemTheme
    latestResolvedThemeRef.current = resolvedTheme

    if (typeof document === "undefined") return
    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolvedTheme)

    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", THEME_COLORS[resolvedTheme])
    }
  }, [theme, systemTheme, resolvedTheme])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null

    const handleMediaChange = (event) => {
      const nextSystem = event.matches ? "dark" : "light"
      if (nextSystem === latestSystemThemeRef.current) return
      latestSystemThemeRef.current = nextSystem

      if (latestThemeRef.current === "system") {
        latestResolvedThemeRef.current = nextSystem
        if (!prefersReducedMotion()) {
          skipActiveViewTransition(activeVtRef, activeClipAnimRef)
          transitionIdRef.current += 1
          startFallbackTransition(transitionIdRef.current)
        }
      }
      setSystemTheme(nextSystem)
    }

    const handleStorage = (event) => {
      if (event.key !== null && event.key !== storageKey) return
      if (event.storageArea && event.storageArea !== window.localStorage) return

      const nextTheme = normalizeTheme(event.newValue, safeDefault)
      const nextResolved = resolveTheme(nextTheme, latestSystemThemeRef.current)
      const prevResolved = latestResolvedThemeRef.current

      latestThemeRef.current = nextTheme
      latestResolvedThemeRef.current = nextResolved

      if (nextResolved !== prevResolved && !prefersReducedMotion()) {
        skipActiveViewTransition(activeVtRef, activeClipAnimRef)
        transitionIdRef.current += 1
        startFallbackTransition(transitionIdRef.current)
      }
      setThemeState(nextTheme)
    }

    if (media) {
      const currentSystem = media.matches ? "dark" : "light"
      if (currentSystem !== latestSystemThemeRef.current) {
        latestSystemThemeRef.current = currentSystem
        if (latestThemeRef.current === "system") {
          latestResolvedThemeRef.current = currentSystem
        }
        setSystemTheme(currentSystem)
      }
      media.addEventListener("change", handleMediaChange)
    }
    window.addEventListener("storage", handleStorage)

    return () => {
      media?.removeEventListener("change", handleMediaChange)
      window.removeEventListener("storage", handleStorage)
    }
  }, [safeDefault, startFallbackTransition, storageKey])

  useEffect(() => {
    return () => {
      clearFallbackTimer()
      skipActiveViewTransition(activeVtRef, activeClipAnimRef)
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove(...TRANSITION_CLASSES)
      }
    }
  }, [clearFallbackTimer])

  const setTheme = useCallback(
    (nextThemeInput, options) => {
      const nextTheme = normalizeTheme(nextThemeInput, safeDefault)
      const nextResolved = resolveTheme(nextTheme, latestSystemThemeRef.current)
      const prevResolved = latestResolvedThemeRef.current

      latestThemeRef.current = nextTheme
      latestResolvedThemeRef.current = nextResolved

      if (nextResolved === prevResolved || typeof document === "undefined") {
        persistTheme(storageKey, nextTheme)
        setThemeState(nextTheme)
        return
      }

      const root = document.documentElement

      if (prefersReducedMotion()) {
        clearFallbackTimer()
        skipActiveViewTransition(activeVtRef, activeClipAnimRef)
        transitionIdRef.current += 1
        root.classList.remove(...TRANSITION_CLASSES)
        persistTheme(storageKey, nextTheme)
        setThemeState(nextTheme)
        return
      }

      if (typeof document.startViewTransition === "function") {
        clearFallbackTimer()
        root.classList.remove("theme-transitioning")
        skipActiveViewTransition(activeVtRef, activeClipAnimRef)

        transitionIdRef.current += 1
        const id = transitionIdRef.current
        const origin = getTransitionOrigin(options)

        root.classList.add("theme-vt")
        if (origin) {
          root.classList.remove("theme-vt-crossfade")
        } else {
          root.classList.add("theme-vt-crossfade")
        }

        try {
          const vt = document.startViewTransition(() => {
            if (transitionIdRef.current !== id) return
            flushSync(() => {
              persistTheme(storageKey, nextTheme)
              setThemeState(nextTheme)
            })
          })
          activeVtRef.current = vt

          if (origin && typeof window !== "undefined") {
            const maxRadius = Math.hypot(
              Math.max(origin.x, window.innerWidth - origin.x),
              Math.max(origin.y, window.innerHeight - origin.y)
            )
            vt.ready
              ?.then(() => {
                if (transitionIdRef.current !== id) return
                if (typeof root.animate === "function") {
                  activeClipAnimRef.current = root.animate(
                    {
                      clipPath: [
                        `circle(0px at ${origin.x}px ${origin.y}px)`,
                        `circle(${maxRadius}px at ${origin.x}px ${origin.y}px)`,
                      ],
                    },
                    {
                      duration: TRANSITION_DURATION_MS,
                      easing: "ease-in-out",
                      pseudoElement: "::view-transition-new(root)",
                    }
                  )
                }
              })
              ?.catch(() => {})
          } else {
            vt.ready?.catch?.(() => {})
          }

          vt.updateCallbackDone?.catch?.(() => {})
          vt.finished
            ?.finally(() => {
              if (transitionIdRef.current === id) {
                root.classList.remove("theme-vt", "theme-vt-crossfade")
                activeClipAnimRef.current = null
                if (activeVtRef.current === vt) {
                  activeVtRef.current = null
                }
              }
            })
            ?.catch(() => {})
          return
        } catch {
          root.classList.remove("theme-vt", "theme-vt-crossfade")
          activeClipAnimRef.current = null
          activeVtRef.current = null
          persistTheme(storageKey, nextTheme)
          setThemeState(nextTheme)
          return
        }
      }

      skipActiveViewTransition(activeVtRef, activeClipAnimRef)
      transitionIdRef.current += 1
      startFallbackTransition(transitionIdRef.current)
      persistTheme(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [clearFallbackTimer, safeDefault, startFallbackTransition, storageKey]
  )

  const toggleTheme = useCallback(
    (event) => {
      const nextTheme = latestResolvedThemeRef.current === "dark" ? "light" : "dark"
      setTheme(nextTheme, event ? { event } : undefined)
    },
    [setTheme]
  )

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
