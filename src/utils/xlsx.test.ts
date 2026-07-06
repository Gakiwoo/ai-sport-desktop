import { describe, expect, it } from 'vitest';
import { createXlsxWorkbook, escapeCsv, SpreadsheetRow } from './xlsx';

// ZIP 结构魔数
const LOCAL_FILE_HEADER = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const CENTRAL_DIR_HEADER = [0x50, 0x4b, 0x01, 0x02]; // PK\x01\x02
const EOCD = [0x50, 0x4b, 0x05, 0x06]; // PK\x05\x06

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function countSignature(bytes: Uint8Array, sig: number[]): number {
  let count = 0;
  for (let i = 0; i + sig.length <= bytes.length; i++) {
    let match = true;
    for (let j = 0; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) {
        match = false;
        break;
      }
    }
    if (match) count++;
  }
  return count;
}

describe('xlsx.ts — createXlsxWorkbook', () => {
  it('生成合法 ZIP 包（local/central/EOCD 三段签名齐全）', () => {
    const wb = createXlsxWorkbook([
      ['姓名', '次数'],
      ['张三', 100],
    ]);
    expect(wb).toBeInstanceOf(Uint8Array);
    expect(wb.length).toBeGreaterThan(0);
    // 文件起始为 local file header 魔数
    expect(Array.from(wb.slice(0, 4))).toEqual(LOCAL_FILE_HEADER);
    // 6 个内部文件 → 6 个 local header + 6 个 central directory header
    expect(countSignature(wb, LOCAL_FILE_HEADER)).toBe(6);
    expect(countSignature(wb, CENTRAL_DIR_HEADER)).toBe(6);
    expect(countSignature(wb, EOCD)).toBe(1);
  });

  it('内嵌预期部件名与 sheet 内容（Store 模式，未压缩）', () => {
    const wb = createXlsxWorkbook([
      ['姓名', '次数'],
      ['张三', 100],
    ]);
    const text = bytesToString(wb);
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('xl/workbook.xml');
    expect(text).toContain('xl/worksheets/sheet1.xml');
    // 数值单元以内联 <v> 写入
    expect(text).toContain('<c r="B2"><v>100</v></c>');
    // 字符串单元以 inlineStr 写入
    expect(text).toContain('<c r="A2" t="inlineStr"><is><t>张三</t></is></c>');
  });

  it('对字符串单元转义 XML 特殊字符', () => {
    const wb = createXlsxWorkbook([['a&b <c> "d"']]);
    const text = bytesToString(wb);
    expect(text).toContain('a&amp;b &lt;c&gt; &quot;d&quot;');
  });

  it('支持超过 26 列（AA 命名）与多行', () => {
    const row: SpreadsheetRow = [];
    for (let i = 0; i < 27; i++) row.push(i);
    const wb = createXlsxWorkbook([row, row]);
    const text = bytesToString(wb);
    // 第 27 列应为 AA
    expect(text).toContain('r="AA1"');
    // 第二行同样渲染
    expect(text).toContain('r="AA2"');
  });

  it('数值单元兼容 NaN/Infinity 时退化为字符串单元（避免非法 XML）', () => {
    const wb = createXlsxWorkbook([[NaN, Infinity, -5]]);
    const text = bytesToString(wb);
    // NaN/Infinity 非有限数 → 以 inlineStr 输出，不生成 <v>NaN</v>
    expect(text).not.toContain('<v>NaN</v>');
    expect(text).not.toContain('<v>Infinity</v>');
    expect(text).toContain('<v>-5</v>');
  });
});

describe('xlsx.ts — escapeCsv', () => {
  it('纯量值不加引号', () => {
    expect(escapeCsv('hello')).toBe('hello');
    expect(escapeCsv(42)).toBe('42');
  });

  it('含逗号/引号/换行的值加引号并转义内部引号', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('he said "hi"')).toBe('"he said ""hi"""');
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
  });
});
