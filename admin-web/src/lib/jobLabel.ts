export const jobLabel = (id: string): string => (id.startsWith("#") ? id : `#${id}`);
