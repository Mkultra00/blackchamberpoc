import * as React from "react";

const MOBILE_BREAKPOINT = 768;

const getIsMobile = () => {
  if (typeof window === "undefined") return false;
  const isSmallViewport = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
  const isMobileUserAgent = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return isSmallViewport || isMobileUserAgent;
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => getIsMobile());

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(getIsMobile());
    };

    mql.addEventListener("change", onChange);
    setIsMobile(getIsMobile());

    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
