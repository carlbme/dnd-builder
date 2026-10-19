import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('root-domain PWA deployment', () => {
  it('offers one manifest and launches inside the root scope', () => {
    const html = readFileSync('dist/index.html','utf8')
    const links = html.match(/<link[^>]+rel="manifest"[^>]*>/g) || []
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('/manifest.webmanifest')
    const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest','utf8'))
    expect(manifest.scope).toBe('/')
    expect(manifest.start_url).toBe('/')
  })
  it('keeps the compatibility manifest on the root and indexes this deployment', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.json','utf8'))
    expect(manifest.scope).toBe('/')
    expect(manifest.start_url).toBe('/')
    expect(readFileSync('public/robots.txt','utf8')).toContain('https://dnd.blockerbunch.com/sitemap.xml')
  })
})
