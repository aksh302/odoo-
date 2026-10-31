import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Paged, Plan, Product } from '../lib/types'

/**
 * Products (with variants) and plans for pickers in forms.
 * `availableOnly` limits plans to ones selectable today (FR-3.3).
 */
export function useCatalog({ availableOnly = true } = {}) {
  const [products, setProducts] = useState<Product[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.get<Paged<Product>>('/products', { params: { limit: 100 } }),
      api.get<Paged<Plan>>('/plans', { params: { limit: 100, ...(availableOnly ? { available: true } : {}) } }),
    ])
      .then(([p, pl]) => {
        if (!alive) return
        setProducts(p.data.data)
        setPlans(pl.data.data)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [availableOnly])

  return { products, plans, loading }
}

/** Unit price for a product + optional variant, in paise (SRS 9.4). */
export function unitPriceOf(products: Product[], productId?: number, variantId?: number | null): number {
  const p = products.find((x) => x.id === productId)
  if (!p) return 0
  const v = p.variants.find((x) => x.id === variantId)
  return p.salesPrice + (v?.extraPrice ?? 0)
}
