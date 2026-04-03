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
      const url = (typeof window !== 'undefined' ? window.location.origin : 'https://bibliosaloon.ru') + '/catalog.json';
      alert('DEBUG: fetching ' + url);
      const resp = await fetch(url);
      alert('DEBUG: status ' + resp.status + ' type ' + resp.headers.get('content-type'));
      const data = await resp.json();
      alert('DEBUG: got ' + data.length + ' docs');
      setDocuments(data.filter((d: any) => d.exists !== false));
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('DEBUG ERROR: ' + msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { documents, loading, error, refresh: load };
}
