import { test, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const samples = [
  ['dnd5e', 'ranger-elf-elara-nightwhisper'],
  ['dnd2024', 'barbarian-goliath-vaska-stonemarch'],
  ['brancalonia', 'barbarian-morgant-ruggo-testagrossa'],
  ['apocalisse', 'barbarian-risen-hell-damien-cavaliere-nero'],
] as const

test('Italian browser and saved preference still receive English UI and PDFs', async ({ browser }, info) => {
  const context = await browser.newContext({ locale: 'it-IT', baseURL: 'http://localhost:14111' })
  await context.addInitScript(() => {
    localStorage.setItem('app', JSON.stringify({ locale: 'it', theme: 'dark', currentStep: 0 }))
    localStorage.setItem('gdpr-accepted', '1')
  })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    for (const [variant, slug] of samples) {
      await page.goto('/blog/' + slug)
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: /change language/i })).toHaveCount(0)
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
      const download = await downloading
      const path = info.outputPath(variant + '.pdf')
      await download.saveAs(path)
      const bytes = await readFile(path)
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount()).toBeGreaterThan(3)
      expect(doc.getForm().getTextField('CharacterName').getText()).toBeTruthy()
      const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      expect(text).toContain('STRENGTH')
      expect(text).toContain('CHARACTER NAME')
      expect(text).toContain('Additional details')
      expect(text).not.toMatch(/NOME PERSONAGGIO|CARATTERISTICHE|Umanità:|Talento:|Marchio:/)
      if (variant === 'brancalonia') {
        expect(text).toContain('I speak little')
        expect(text).toContain('Misdeeds')
        expect(text).not.toContain('Parlo poco')
      }
    }
    await page.goto('/credits')
    await expect(page.getByRole('heading', { name: 'Credits', exact: true })).toBeVisible()
    await expect(page.locator('blockquote').first()).toHaveAttribute('lang', 'en')
    expect(errors).toEqual([])
  } finally { await context.close() }
})
