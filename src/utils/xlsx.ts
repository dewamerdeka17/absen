type Cell = string | number | boolean | null | undefined

export type XlsxSheet = {
  name: string
  rows: Cell[][]
  headerRow?: number
  currencyColumns?: number[]
  statusColumn?: number
}

const encoder = new TextEncoder()

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function writeU16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff)
}

function writeU32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

function zip(files: Array<{ name: string; content: string }>) {
  const local: number[] = []
  const central: number[] = []
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const checksum = crc32(data)
    const offset = local.length

    writeU32(local, 0x04034b50)
    writeU16(local, 20); writeU16(local, 0); writeU16(local, 0); writeU16(local, 0); writeU16(local, 0)
    writeU32(local, checksum); writeU32(local, data.length); writeU32(local, data.length)
    writeU16(local, name.length); writeU16(local, 0)
    local.push(...name, ...data)

    writeU32(central, 0x02014b50)
    writeU16(central, 20); writeU16(central, 20); writeU16(central, 0); writeU16(central, 0); writeU16(central, 0); writeU16(central, 0)
    writeU32(central, checksum); writeU32(central, data.length); writeU32(central, data.length)
    writeU16(central, name.length); writeU16(central, 0); writeU16(central, 0); writeU16(central, 0); writeU16(central, 0)
    writeU32(central, 0); writeU32(central, offset)
    central.push(...name)
  }
  const eocd: number[] = []
  writeU32(eocd, 0x06054b50)
  writeU16(eocd, 0); writeU16(eocd, 0); writeU16(eocd, files.length); writeU16(eocd, files.length)
  writeU32(eocd, central.length); writeU32(eocd, local.length); writeU16(eocd, 0)
  return new Uint8Array([...local, ...central, ...eocd])
}

const xml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

function colName(index: number) {
  let name = ''
  let n = index
  while (n > 0) {
    const r = (n - 1) % 26
    name = String.fromCharCode(65 + r) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function worksheet(sheet: XlsxSheet) {
  const headerRow = sheet.headerRow || 1
  const widths = sheet.rows[0]?.map((_, column) => Math.min(42, Math.max(12, ...sheet.rows.map(row => String(row[column] ?? '').length + 2)))) || []
  const dimension = `A1:${colName(Math.max(1, widths.length))}${Math.max(1, sheet.rows.length)}`
  const rows = sheet.rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1
    const cells = row.map((cell, columnIndex) => {
      const columnNumber = columnIndex + 1
      const ref = `${colName(columnNumber)}${rowNumber}`
      const isHeader = rowNumber === headerRow
      const isTitle = rowNumber === 1
      const isCurrency = rowNumber > headerRow && sheet.currencyColumns?.includes(columnNumber)
      const isStatus = rowNumber > headerRow && sheet.statusColumn === columnNumber && /late|absen|rejected|ditolak|terlambat/i.test(String(cell || ''))
      const style = isTitle ? 1 : isHeader ? 2 : isCurrency ? 3 : isStatus ? 4 : 0
      if (typeof cell === 'number') return `<c r="${ref}" s="${style}"><v>${Number.isFinite(cell) ? cell : 0}</v></c>`
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${xml(cell)}</t></is></c>`
    }).join('')
    return `<row r="${rowNumber}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
  <sheetData>${rows}</sheetData>
  <autoFilter ref="A${headerRow}:${colName(Math.max(1, widths.length))}${Math.max(headerRow, sheet.rows.length)}"/>
</worksheet>`
}

function workbookXml(sheets: XlsxSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`
}

function relsXml(sheets: XlsxSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

function contentTypesXml(sheets: XlsxSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
}

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Rp&quot; #,##0"/></numFmts>
  <fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7FBFB"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFEBEB"/></patternFill></fill></fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFD8DEE9"/></left><right style="thin"><color rgb="FFD8DEE9"/></right><top style="thin"><color rgb="FFD8DEE9"/></top><bottom style="thin"><color rgb="FFD8DEE9"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1"/>
  </cellXfs>
</styleSheet>`

export function downloadXlsx(filename: string, sheets: XlsxSheet[]) {
  const files = [
    { name: '[Content_Types].xml', content: contentTypesXml(sheets) },
    { name: '_rels/.rels', content: rootRels },
    { name: 'xl/workbook.xml', content: workbookXml(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', content: relsXml(sheets) },
    { name: 'xl/styles.xml', content: styles },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: worksheet(sheet) })),
  ]
  const blob = new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
