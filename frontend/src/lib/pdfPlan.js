// Turns page 1 of a floor plan PDF into a PNG File in the browser (pdf.js, loaded on first use),
// so the same image pipeline (upload + OpenCV room detection) works for PDFs.
const TARGET_LONG_SIDE = 2200 // px — enough detail for walls and room labels

export async function pdfToPlanImage(file, pageNumber = 1, longSide = TARGET_LONG_SIDE) {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise
  try {
    const page = await doc.getPage(Math.min(pageNumber, doc.numPages))
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: longSide / Math.max(base.width, base.height) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const name = `${file.name.replace(/\.pdf$/i, '')} (page ${page.pageNumber}).png`
    return { file: new File([blob], name, { type: 'image/png' }), pages: doc.numPages }
  } finally {
    doc.destroy()
  }
}
