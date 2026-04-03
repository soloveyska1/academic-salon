import { useState, useEffect, useCallback } from 'react';
import { Document } from '../types/document';
import { fetchCatalog } from '../services/catalog';

interface UseCatalogResult {
  documents: Document[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCatalog(): UseCatalogResult {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCatalog();
      // Only keep documents that exist
      setDocuments(data.filter((d) => d.exists !== false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { documents, loading, error, refresh: load };
}
