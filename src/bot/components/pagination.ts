import { LIMITS } from "../../utils/constants.js";

export function paginate<T>(
  items: T[],
  page: number,
  perPage: number = LIMITS.maxHistoryPerPage,
): { items: T[]; currentPage: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    currentPage,
    totalPages,
  };
}
