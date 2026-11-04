import { useEffect, useState } from 'react'
import { request } from '../../lib/api'
import { toQs } from '../Surveillance/survMeta'

/**
 * Loads a page of O&M activities for a set of filters, with sort / paging state.
 * `base` holds fixed filters for the tab (e.g. status: 'open' for Work Orders).
 */
export function useActivities(filters, base = {}, defaultSort = { key: '', dir: '' }) {
  const [sort, setSort] = useState(defaultSort)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)

  const filterQs = toQs({ ...filters, ...base })
  const qs = `${filterQs}&${toQs({ sort: sort.key, dir: sort.dir, page, pageSize })}`
  useEffect(() => {
    let cancelled = false
    request(`/om/activities?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [qs, reload])

  const sortKey = sort.key || data?.sort
  const sortDir = sort.dir || data?.dir
  return {
    data, error, filterQs, sort, page, pageSize,
    setPage, setPageSize: (v) => { setPageSize(v); setPage(1) },
    reload: () => setReload((n) => n + 1),
    resetPage: () => setPage(1),
    toggleSort: (key) => {
      setSort(sortKey === key ? { key, dir: sortDir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'dueDate' || key === 'completedAt' ? 'desc' : 'asc' })
      setPage(1)
    },
  }
}
