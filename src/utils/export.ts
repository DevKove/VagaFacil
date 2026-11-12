type ExportValue = string | number | boolean | null | undefined;

const escapeExportText = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[char] || char);

const formatStamp = () => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date());

const makeFileName = (title: string) => title
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'vagafacil-relatorio';

function exportPdf(title: string, headers: string[], rows: ExportValue[][], stamp: string) {
  const win = window.open('', '_blank');
  if (!win) {
    window.alert('Permita pop-ups para gerar o PDF.');
    return;
  }

  const compact = headers.length > 8;
  const tableHead = headers.map(header => '<th>' + escapeExportText(header) + '</th>').join('');
  const tableBody = rows.length
    ? rows.map((row, rowIndex) =>
        '<tr class="' + (rowIndex % 2 ? 'alternate' : '') + '">' +
        headers.map((_, index) => '<td>' + escapeExportText(row[index]) + '</td>').join('') +
        '</tr>',
      ).join('')
    : '<tr><td class="empty" colspan="' + Math.max(headers.length, 1) + '">Nenhum registro encontrado para os filtros selecionados.</td></tr>';

  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeExportText(title) + ' · VagaFácil</title><style>' +
    ':root{--navy:#102a43;--blue:#087fa8;--cyan:#35c2df;--ink:#203449;--muted:#718397;--line:#dce5ec;--soft:#f2f7fa}' +
    '*{box-sizing:border-box}body{margin:0;background:#edf2f6;color:var(--ink);font:12px/1.45 "Segoe UI",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.sheet{max-width:1500px;margin:28px auto;padding:0 28px 28px}.report-head{position:relative;overflow:hidden;padding:27px 30px 25px;border-radius:14px 14px 0 0;background:linear-gradient(115deg,#102a43,#174c6b 72%,#087fa8);color:#fff}' +
    '.report-head:after{content:"";position:absolute;width:260px;height:260px;right:-60px;top:-150px;border:1px solid #ffffff30;border-radius:50%;box-shadow:0 0 0 35px #ffffff0c,0 0 0 70px #ffffff08}' +
    '.brand{position:relative;z-index:1;display:flex;align-items:center;gap:9px;margin-bottom:22px;color:#b8dce8;font-size:9px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase}' +
    '.brand-mark{display:grid;place-items:center;width:25px;height:25px;border-radius:7px;background:#35c2df;color:#10324a;font-size:15px;font-weight:900}' +
    'h1{position:relative;z-index:1;margin:0;max-width:85%;font-size:25px;line-height:1.2;font-weight:750;letter-spacing:-.6px}.subtitle{position:relative;z-index:1;margin:8px 0 0;color:#c4d9e5;font-size:11px}' +
    '.report-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:19px;position:relative;z-index:1}.meta-chip{padding:6px 10px;border:1px solid #ffffff30;border-radius:20px;background:#ffffff12;color:#eaf5fa;font-size:9px}' +
    '.summary{display:flex;gap:12px;padding:15px 18px;background:#fff;border:1px solid var(--line);border-top:0}.summary-card{min-width:130px;padding:9px 13px;border-left:3px solid var(--cyan);background:var(--soft);border-radius:0 7px 7px 0}.summary-card strong{display:block;color:var(--navy);font-size:19px;line-height:1.1}.summary-card span{display:block;margin-top:4px;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.6px}' +
    '.table-wrap{overflow:hidden;background:#fff;border:1px solid var(--line);border-top:0;border-radius:0 0 12px 12px}table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}' +
    'th{padding:11px 10px;background:#eaf2f7;color:#294b63;text-align:left;font-size:' + (compact ? '7' : '8.5') + 'px;font-weight:800;letter-spacing:.55px;text-transform:uppercase;border-bottom:1px solid #d5e2ea}' +
    'td{padding:9px 10px;border-bottom:1px solid #e8eef2;color:#34495c;font-size:' + (compact ? '7' : '9') + 'px;vertical-align:top;overflow-wrap:anywhere;white-space:normal}tr.alternate td{background:#f7fafc}tbody tr:last-child td{border-bottom:0}.empty{text-align:center;padding:28px;color:var(--muted)}' +
    '.report-foot{display:flex;justify-content:space-between;gap:12px;margin-top:12px;color:#8392a0;font-size:8px}' +
    '@page{size:landscape;margin:13mm 11mm 16mm}@page{@bottom-left{content:"VagaFácil · Relatório administrativo";font:8px Arial;color:#8292a0}@bottom-right{content:"Página " counter(page) " de " counter(pages);font:8px Arial;color:#8292a0}}' +
    '@media print{body{background:#fff}.sheet{max-width:none;margin:0;padding:0}.report-head{border-radius:8px 8px 0 0}.table-wrap{border-radius:0 0 8px 8px}tr{break-inside:avoid}thead{display:table-header-group}.report-foot{display:none}}' +
    '@media screen and (max-width:700px){.sheet{padding:0 10px 18px;margin:12px auto}.report-head{padding:20px}.summary{flex-wrap:wrap}h1{font-size:21px}}' +
    '</style></head><body><main class="sheet">' +
    '<header class="report-head"><div class="brand"><span class="brand-mark">V</span> VagaFácil · Gestão do estacionamento rotativo</div>' +
    '<h1>' + escapeExportText(title) + '</h1><p class="subtitle">Relatório consolidado de registros do sistema</p>' +
    '<div class="report-meta"><span class="meta-chip">Gerado em ' + escapeExportText(stamp) + '</span><span class="meta-chip">' + rows.length.toLocaleString('pt-BR') + ' registros</span><span class="meta-chip">' + headers.length + ' campos</span></div></header>' +
    '<section class="summary"><div class="summary-card"><strong>' + rows.length.toLocaleString('pt-BR') + '</strong><span>Total de registros</span></div>' +
    '<div class="summary-card"><strong>' + headers.length + '</strong><span>Campos no relatório</span></div>' +
    '<div class="summary-card"><strong>VagaFácil</strong><span>Estacionamento rotativo</span></div></section>' +
    '<section class="table-wrap"><table><thead><tr>' + tableHead + '</tr></thead><tbody>' + tableBody + '</tbody></table></section>' +
    '<footer class="report-foot"><span>Documento gerado automaticamente pelo VagaFácil.</span><span>Uso administrativo · ' + escapeExportText(stamp) + '</span></footer>' +
    '</main><script>window.addEventListener("load",function(){setTimeout(function(){window.print()},250)});</script></body></html>';

  win.document.open();
  win.document.write(html);
  win.document.close();
}

function exportExcel(title: string, headers: string[], rows: ExportValue[][], stamp: string) {
  const columnCount = Math.max(headers.length, 1);
  const lastColumn = headers.length || 1;
  const sheetName = Array.from(title, char => '/\\?*[]:'.includes(char) ? ' ' : char).join('').trim().slice(0, 31) || 'Relatorio';
  const widths = headers.map((header, index) => {
    const sampleLength = rows.slice(0, 100).reduce(
      (max, row) => Math.max(max, String(row[index] ?? '').length),
      String(header).length,
    );
    return Math.min(38, Math.max(13, sampleLength + 3)) * 7;
  });

  const cell = (value: ExportValue, style: string) => {
    const type = typeof value === 'number' && Number.isFinite(value)
      ? 'Number'
      : typeof value === 'boolean' ? 'Boolean' : 'String';
    const data = type === 'Boolean' ? (value ? '1' : '0') : escapeExportText(value);
    return '<Cell ss:StyleID="' + style + '"><Data ss:Type="' + type + '">' + data + '</Data></Cell>';
  };

  const merge = Math.max(0, columnCount - 1);
  const titleRow = '<Row ss:Height="30"><Cell ss:StyleID="ReportTitle" ss:MergeAcross="' + merge + '"><Data ss:Type="String">' + escapeExportText(title) + '</Data></Cell></Row>';
  const metaRow = '<Row ss:Height="22"><Cell ss:StyleID="ReportMeta" ss:MergeAcross="' + merge + '"><Data ss:Type="String">VagaFácil | Gerado em ' + escapeExportText(stamp) + ' | ' + rows.length + ' registros</Data></Cell></Row>';
  const spacerRow = '<Row ss:Height="8"/>';
  const headerRow = '<Row ss:Height="28">' + headers.map(value => cell(value, 'ColumnHeader')).join('') + '</Row>';
  const dataRows = rows.map((row, rowIndex) => '<Row ss:AutoFitHeight="1">' + headers.map((_, index) => {
    const numeric = typeof row[index] === 'number' && Number.isFinite(row[index]);
    return cell(row[index], numeric
      ? (rowIndex % 2 ? 'NumberAlternate' : 'NumberCell')
      : (rowIndex % 2 ? 'Alternate' : 'DataCell'));
  }).join('') + '</Row>').join('');
  const emptyRow = rows.length ? '' :
    '<Row><Cell ss:StyleID="Empty" ss:MergeAcross="' + merge + '"><Data ss:Type="String">Nenhum registro encontrado.</Data></Cell></Row>';
  const columns = widths.map(width => '<Column ss:Width="' + width + '" ss:AutoFitWidth="0"/>').join('');

  const xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    '<Styles>' +
    '<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos" ss:Size="10" ss:Color="#26394B"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>' +
    '<Style ss:ID="ReportTitle"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos Display" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#102A43" ss:Pattern="Solid"/></Style>' +
    '<Style ss:ID="ReportMeta"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos" ss:Size="9" ss:Color="#D9EAF2"/><Interior ss:Color="#174C6B" ss:Pattern="Solid"/></Style>' +
    '<Style ss:ID="ColumnHeader"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Aptos" ss:Size="9" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#087FA8" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#35C2DF"/></Borders></Style>' +
    '<Style ss:ID="DataCell"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Aptos" ss:Size="9" ss:Color="#26394B"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4EBF0"/></Borders></Style>' +
    '<Style ss:ID="Alternate"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Aptos" ss:Size="9" ss:Color="#26394B"/><Interior ss:Color="#F1F6F9" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4EBF0"/></Borders></Style>' +
    '<Style ss:ID="NumberCell" ss:Parent="DataCell"><NumberFormat ss:Format="#,##0.##"/></Style><Style ss:ID="NumberAlternate" ss:Parent="Alternate"><NumberFormat ss:Format="#,##0.##"/></Style>' +
    '<Style ss:ID="Empty"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Italic="1" ss:Color="#718397"/></Style></Styles>' +
    '<Worksheet ss:Name="' + escapeExportText(sheetName) + '"><Table>' + columns + titleRow + metaRow + spacerRow + headerRow + dataRows + emptyRow + '</Table>' +
    '<AutoFilter x:Range="R4C1:R' + Math.max(4 + rows.length, 4) + 'C' + lastColumn + '"/>' +
    '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><PageSetup><Layout x:Orientation="Landscape"/></PageSetup>' +
    '<Print><ValidPrinterInfo/><PaperSizeIndex>9</PaperSizeIndex><Scale>75</Scale></Print>' +
    '<FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane><Selected/></WorksheetOptions>' +
    '</Worksheet></Workbook>';

  const blob = new Blob(['\ufeff', xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = makeFileName(title) + '.xls';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportDataset(
  title: string,
  headers: string[],
  rows: ExportValue[][],
  format: 'pdf' | 'excel',
) {
  const stamp = formatStamp();
  if (format === 'pdf') {
    exportPdf(title, headers, rows, stamp);
    return;
  }
  exportExcel(title, headers, rows, stamp);
}
