/**
 * How a job id is written on screen: `#A3-0001` (plan §1.3).
 *
 * Display only — the `#` is never part of the id. It is not in the database,
 * not in a URL and not in an API call; a helper that put it back into a lookup
 * is exactly what broke job detail. Stored ids stay bare, and this is the one
 * place that decorates them.
 *
 * (Mobile already writes `#${job.id}` inline. Admin-web used to get the `#`
 * from the fixture data itself, which is why it silently disappeared when the
 * real API became the source.)
 */
export const jobLabel = (id: string): string => (id.startsWith("#") ? id : `#${id}`);
