/** Public site URL used for metadata, emails, and sitemap generation. */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
