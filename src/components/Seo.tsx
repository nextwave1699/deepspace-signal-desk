import type { ReactElement } from 'react'

/** Kept out of the SDK so the static landing does not pull in the auth client. */
export interface SeoProps {
  title: string
  description: string
  /** `https://host`, no trailing slash. Required for canonical / og:url. */
  origin?: string
  /** The page's path, starting with `/`. Required for canonical / og:url. */
  path?: string
  /** Preview image (1200×630). Absolute, or root-relative to `origin`. */
  ogImage?: string
  type?: 'website' | 'article'
  noindex?: boolean
}

/**
 * Pages without <Seo> must render their own <title>: React removes the
 * prerendered one when this unmounts.
 */
export function Seo({
  title,
  description,
  origin,
  path,
  ogImage,
  type = 'website',
  noindex = false,
}: SeoProps): ReactElement {
  const canonical = origin && path ? `${origin}${path}` : undefined
  const image = ogImage ? (ogImage.startsWith('/') && origin ? `${origin}${ogImage}` : ogImage) : undefined
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      <meta property="og:type" content={type} />
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {image ? <meta property="og:image" content={image} /> : null}
      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image ? <meta name="twitter:image" content={image} /> : null}
    </>
  )
}
