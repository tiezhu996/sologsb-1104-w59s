interface SaveFilePickerOptions {
  suggestedName: string
  types?: Array<{ description: string; accept: Record<string, string[]> }>
}

interface WindowWithSavePicker extends Window {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

export async function saveJsonFile(filename: string, content: string): Promise<'saved' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const savePicker = (window as WindowWithSavePicker).showSaveFilePicker

  if (savePicker) {
    try {
      const handle = await savePicker({
        suggestedName: filename,
        types: [{ description: 'JSON 资料卷', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      throw error
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return 'downloaded'
}
