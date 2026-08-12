import { useEffect } from "react";

/** Sets document.title for the lifetime of the page that calls it. */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
