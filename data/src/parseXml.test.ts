import { describe, it, expect } from 'vitest';
import { parseLaws } from './parseXml';
import type { Article, Division } from '../../src/core/types';

// 這份 fixture 刻意涵蓋 spec §3.3 的全部六個陷阱
const FIXTURE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<LAWS UpdateDate="2026/8/21 上午 12:00:00">',
  '  <法規>',
  '    <法規名稱>中華民國刑法</法規名稱>',
  '    <法規網址>https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=C0000001</法規網址>',
  '    <法規類別>刑事</法規類別>',
  '    <最新異動日期>20260513</最新異動日期>',
  '    <廢止註記></廢止註記>',
  '    <沿革內容><![CDATA[1.中華民國二十四年一月一日制定]]></沿革內容>',
  '    <前言><![CDATA[]]></前言>',
  '    <法規內容>',
  '      <編章節>第 一 編 總則</編章節>',
  '      <編章節>   第 一 章 法例</編章節>',
  '      <編章節>      第 一 節 適用範圍</編章節>',
  '      <編章節>         第 一 款 通則</編章節>',
  '      <編章節>            第 一 目 細目</編章節>',
  '      <條文>',
  '        <條號>第 1 條</條號>',
  '        <條文內容><![CDATA[行為之處罰，以行為時之法律有明文規定者為限。\r',
  '拘束人身自由之保安處分，亦同。]]></條文內容>',
  '      </條文>',
  '      <條文>',
  '        <條號>第 185-3 條</條號>',
  '        <條文內容><![CDATA[駕駛動力交通工具而有下列情形之一者。]]></條文內容>',
  '      </條文>',
  '    </法規內容>',
  '  </法規>',
  '  <法規>',
  '    <法規名稱>總統副總統選舉罷免法（舊 36.03.31 制定）</法規名稱>',
  '    <法規網址>https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0020001</法規網址>',
  '    <法規類別>選舉</法規類別>',
  '    <最新異動日期>19470331</最新異動日期>',
  '    <廢止註記>廢</廢止註記>',
  '    <沿革內容><![CDATA[]]></沿革內容>',
  '    <法規內容>',
  '      <條文><條號>1</條號><條文內容><![CDATA[裸數字條號]]></條文內容></條文>',
  '    </法規內容>',
  '  </法規>',
  '</LAWS>',
].join('\n');

describe('parseLaws', () => {
  const parsed = parseLaws(FIXTURE);

  it('取出來源版本', () => {
    expect(parsed.sourceUpdatedAt).toBe('2026/8/21 上午 12:00:00');
  });

  it('解析出兩部法規', () => {
    expect(parsed.laws).toHaveLength(2);
  });

  it('陷阱 6:PCode 從法規網址取出', () => {
    expect(parsed.laws[0]!.pcode).toBe('C0000001');
  });

  it('陷阱 3:保留來源的正式名稱', () => {
    expect(parsed.laws[0]!.name).toBe('中華民國刑法');
  });

  it('陷阱 5:標記廢止', () => {
    expect(parsed.laws[0]!.discarded).toBe(false);
    expect(parsed.laws[1]!.discarded).toBe(true);
  });

  it('陷阱 1:編章節與條文保持文件順序', () => {
    const kinds = parsed.laws[0]!.blocks.map((b) => b.t);
    expect(kinds).toEqual(['d', 'd', 'd', 'd', 'd', 'a', 'a']);
  });

  it('陷阱 1:層級由前導空白推算,每階 3 格,支援到 level 4', () => {
    const levels = parsed.laws[0]!.blocks
      .filter((b): b is Division => b.t === 'd')
      .map((b) => b.level);
    expect(levels).toEqual([0, 1, 2, 3, 4]);
  });

  it('編章節標籤本身已 trim', () => {
    const first = parsed.laws[0]!.blocks[1] as Division;
    expect(first.label).toBe('第 一 章 法例');
  });

  it('陷阱 2:條號正規化', () => {
    const arts = parsed.laws[0]!.blocks.filter((b): b is Article => b.t === 'a');
    expect(arts[0]).toMatchObject({ no: '1', main: 1, sub: 0, label: '第 1 條' });
    expect(arts[1]).toMatchObject({ no: '185-3', main: 185, sub: 3, label: '第 185-3 條' });
  });

  it('CDATA 內容取出,CR 已移除,項以 \\n 分隔', () => {
    const art = parsed.laws[0]!.blocks.find((b): b is Article => b.t === 'a')!;
    expect(art.text).toBe(
      '行為之處罰，以行為時之法律有明文規定者為限。\n拘束人身自由之保安處分，亦同。'
    );
  });

  it('沿革內容取出', () => {
    expect(parsed.laws[0]!.history).toBe('1.中華民國二十四年一月一日制定');
  });

  it('無法解析的條號被收集起來,不靜默丟棄', () => {
    expect(parsed.laws[1]!.badArticleLabels).toEqual(['1']);
    expect(parsed.laws[1]!.blocks.filter((b) => b.t === 'a')).toHaveLength(0);
  });
});
