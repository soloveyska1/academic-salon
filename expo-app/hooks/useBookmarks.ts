import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BOOKMARKS_KEY = '@bibliosaloon_bookmarks';

interface UseBookmarksResult {
  bookmarks: Set<string>;
  toggle: (file: string) => void;
  isBookmarked: (file: string) => boolean;
}

export function useBookmarks(): UseBookmarksResult {
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());

  // Load bookmarks from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(BOOKMARKS_KEY);
        if (stored) {
          const arr: string[] = JSON.parse(stored);
          setBookmarks(new Set(arr));
        }
      } catch {
        // Ignore load errors, start with empty set
      }
    })();
  }, []);

  // Persist bookmarks whenever they change
  const persist = useCallback(async (next: Set<string>) => {
    try {
      await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...next]));
    } catch {
      // Ignore persist errors silently
    }
  }, []);

  const toggle = useCallback(
    (file: string) => {
      setBookmarks((prev) => {
        const next = new Set(prev);
        if (next.has(file)) {
          next.delete(file);
        } else {
          next.add(file);
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const isBookmarked = useCallback(
    (file: string) => bookmarks.has(file),
    [bookmarks],
  );

  return { bookmarks, toggle, isBookmarked };
}
