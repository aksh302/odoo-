import { Select, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { Paged, User } from '../lib/types'

/**
 * Searchable customer picker backed by GET /customers?q=.
 * Value is the customer id. Pass `initial` to show a pre-selected customer's name.
 */
export function CustomerSelect({
  id,
  value,
  onChange,
  initial,
  disabled,
}: {
  id?: string
  value?: number
  onChange?: (id: number) => void
  initial?: { id: number; name: string; company?: string | null }
  disabled?: boolean
}) {
  const [options, setOptions] = useState<{ value: number; label: string }[]>(
    initial ? [{ value: initial.id, label: label(initial) }] : [],
  )
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const search = (q: string) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get<Paged<User>>('/customers', { params: { q, limit: 20 } })
        setOptions(data.data.map((c) => ({ value: c.id, label: label({ ...c, company: c.profile?.company }) })))
      } finally {
        setLoading(false)
      }
    }, 250)
  }

  useEffect(() => {
    search('')
    return () => clearTimeout(timer.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initial && !options.some((o) => o.value === initial.id)) {
      setOptions((o) => [{ value: initial.id, label: label(initial) }, ...o])
    }
  }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Select
      id={id}
      showSearch={{ filterOption: false, onSearch: search }}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Search by name or company"
      notFoundContent={loading ? <Spin size="small" /> : 'No customers found'}
      disabled={disabled}
    />
  )
}

function label(c: { name: string; company?: string | null }) {
  return c.company ? `${c.name} (${c.company})` : c.name
}
