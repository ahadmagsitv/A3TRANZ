/**
 * Job ids render as `#A3-####` (plan §1.3) — a literal `#` is a URL fragment
 * delimiter, so a raw one in a route never reaches the server at all, and
 * even percent-encoded (`%23`) it round-trips inconsistently: GitHub Pages
 * decodes `%23` back to `#` before matching the deployed static files, but
 * Next's static export names the exported folder with the *encoded* string
 * — a real 404 caught deploying this app, not a hypothetical one. Routes use
 * the id with the leading `#` stripped; every lookup re-attaches it. Display
 * text (the id shown on screen) always uses the real `job.id`, never this.
 */
export const jobUrlSlug = (id: string): string => id.replace(/^#/, "");

export const jobIdFromSlug = (slug: string): string =>
  slug.startsWith("#") ? slug : `#${slug}`;
