import { useCallback, useEffect, useRef, useState } from 'react'
import type { TablePaginationConfig } from 'antd'
import { api } from '../api/client'
import { parseError } from '../api/errors'
import type { Paged } from '../lib/types'

type Filters = Record<string, string | number | boolean | undefined | null>

/**
 * Server-side paginated list for any `GET /x?page=&limit=&...` endpoint.
 *
 *   const list = usePagedList<Customer>('/customers', { q: search })
 *   <Table {...list.tableProps} columns={...} />
 *
 * The `q` filter is debounced (300 ms) so typing in a search box
 * doesn't fire a request per keystroke.
 */
export function usePagedList<T>(path: string, filters: Filters = {}, pageSize = 20) {
  const [rows, setRows] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(pageSize)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounce only the text search.
  const [q, setQ] = useState(filters.q)
  useEffect(() => {
    const t = setTimeout(() => setQ(filters.q), 300)
    return () => clearTimeout(t)
  }, [filters.q])

  const other = JSON.stringify({ ...filters, q: undefined })
  // Any filter change goes back to page 1.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setPage(1)
  }, [other, q])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Filters = { ...JSON.parse(other), q, page, limit }
      // Drop empty filters so the URL stays clean.
      Object.keys(params).forEach((k) => (params[k] === '' || params[k] == null) && delete params[k])
      const { data } = await api.get<Paged<T>>(path, { params })
      setRows(data.data)
      setTotal(data.total)
    } catch (err) {
      setError(parseError(err).message)
    } finally {
      setLoading(false)
    }
  }, [path, other, q, page, limit])

  useEffect(() => {
    load()
  }, [load])

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize: limit,
    total,
    showSizeChanger: true,
    pageSizeOptions: [10, 20, 50, 100], // API caps limit at 100
    showTotal: (t) => `${t} total`,
    onChange: (p, l) => {
      setPage(l !== limit ? 1 : p)
      setLimit(l)
    },
  }

  return {
    rows,
    total,
    loading,
    error,
    reload: load,
    /** Spread onto <Table>. */
    tableProps: { dataSource: rows, loading, pagination, rowKey: 'id' as const },
  }
}
