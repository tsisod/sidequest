export function dialoguePages(text: string): string[] {
  const pages: string[] = []
  for (const paragraph of text.trim().split(/\n\s*\n/)) {
    let page = ''
    for (const word of paragraph.split(/\s+/)) {
      if (page && page.length + word.length + 1 > 180) {
        pages.push(page)
        page = ''
      }
      page += `${page ? ' ' : ''}${word}`
    }
    if (page) pages.push(page)
  }
  return pages.length ? pages : ['']
}
