import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractXml, SOURCE_URL } from './download';

describe('extractXml', () => {
  it('從壓縮檔取出 XML 內容', () => {
    const zip = zipSync({ 'FalV.xml': strToU8('<LAWS></LAWS>') });
    expect(extractXml(zip)).toBe('<LAWS></LAWS>');
  });

  it('去除 UTF-8 BOM(來源檔帶 BOM)', () => {
    const zip = zipSync({ 'FalV.xml': strToU8('﻿<LAWS></LAWS>') });
    expect(extractXml(zip)).toBe('<LAWS></LAWS>');
  });

  it('忽略同壓縮檔內的其他檔案', () => {
    const zip = zipSync({
      'manifest.csv': strToU8('name,schema'),
      'schema.csv': strToU8('name,title'),
      'FalV.xml': strToU8('<LAWS/>'),
    });
    expect(extractXml(zip)).toBe('<LAWS/>');
  });

  it('找不到 xml 時拋出可讀的錯誤', () => {
    const zip = zipSync({ 'readme.txt': strToU8('hi') });
    expect(() => extractXml(zip)).toThrow(/找不到 \.xml/);
  });
});

describe('SOURCE_URL', () => {
  it('指向法務部開放資料的中文法律檔', () => {
    expect(SOURCE_URL).toBe(
      'https://sendlaw.moj.gov.tw/PublicData/GetFile.ashx?DType=XML&AuData=CF'
    );
  });
});
