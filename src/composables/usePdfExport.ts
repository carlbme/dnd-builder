import { ref } from 'vue'
import { useCharacterStore, type CharacterData } from '@/stores/character'
import { createEnglishPdf } from '@/utils/englishPdf'

export function usePdfExport() {
  const exporting = ref(false)

  async function exportPdf() {
    return exportPdfFor(useCharacterStore().character)
  }

  async function exportPdfFor(char: CharacterData) {
    exporting.value = true
    try {
      const bytes = await createEnglishPdf(char)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${char.name || 'character'}-sheet.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('PDF export failed:', error)
      alert('Unable to export the PDF. Please try again.')
    } finally {
      exporting.value = false
    }
  }

  return { exportPdf, exportPdfFor, exporting }
}
