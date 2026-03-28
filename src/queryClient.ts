import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is fresh for 2 minutes before background refetch
      staleTime: 2 * 60 * 1000,
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Don't refetch on window focus for a game app (user switches tabs often)
      refetchOnWindowFocus: false,
      // Retry once on failure
      retry: 1,
    },
  },
})
