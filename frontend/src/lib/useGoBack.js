import { useNavigate } from 'react-router'

/**
 * A Back button's action: back to the page the user came from (e.g. an inspection after opening one of its
 * O&M activities), or to `fallback` when the page was opened directly (new tab, bookmark, shared link).
 */
export function useGoBack(fallback) {
  const navigate = useNavigate()
  // React Router numbers this tab's history entries from 0 (kept when a page replaces its URL, e.g. a tab
  // change); 0 means the page was opened directly — there's nothing in the app to go back to
  return () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(fallback))
}
