import { useCallback, useEffect, useState } from 'react'

export function useLoad<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await loader())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, dependencies) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void reload() }, [reload])

  return { data, setData, loading, error, reload }
}
