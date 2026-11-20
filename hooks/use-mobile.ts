import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Return undefined on first render so server and client markup match.
  // Consumers must treat undefined as "not mobile" (default desktop layout)
  // until the media query resolves after hydration.
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
