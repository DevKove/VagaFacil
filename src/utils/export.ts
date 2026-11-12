type ExportValue = string | number | boolean | null | undefined;
const escapeExportText = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] || char));
export function exportDataset(title: string, headers: string[], rows: ExportValue[][], format: 'pdf' | 'excel') {
  const safeTitle = escapeExportText(title);
  const stamp = new Date().toLocaleString('pt-BR');
  if (format === 'pdf') {
    const win = window.open('', '_blank');
    if (!win) { window.alert('Permita pop-ups para gerar o PDF.'); return; }
    const head = headers.map(value => '<th>' + escapeExportText(value) + '</th>').join('');
    const body = rows.map(row => '<tr>' + headers.map((_, index) => '<td>' + escapeExportText(row[index]) + '</td>').join('') + '</tr>').join('');
    win.document.write('<html><head><meta charset="utf-8"><title>' + safeTitle + '</title><style>@page{size:landscape;margin:12mm}body{font:11px Arial;color:#172033}h1{font-size:20px}p{color:#667085}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#344054;color:white}th,td{border:1px solid #d0d5dd;padding:6px;text-align:left}tr{break-inside:avoid}</style></head><body><h1>' + safeTitle + '</h1><p>VagaFácil · Gerado em ' + escapeExportText(stamp) + ' · ' + rows.length + ' registros</p><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table><script>window.onload=function(){window.print()}</script></body></html>');
    win.document.close();
    return;
  }
  const cell = (value: ExportValue) => '<Cell><Data ss:Type="' + (typeof value === 'number' ? 'Number' : 'String') + '">' + escapeExportText(value) + '</Data></Cell>';
  const xmlRows = [headers, ...rows].map(row => '<Row>' + headers.map((_, index) => cell(row[index])).join('') + '</Row>').join('');
  const xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Registros"><Table>' + xmlRows + '</Table></Worksheet></Workbook>';
  const blob = new Blob(['\ufeff', xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.xls';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
