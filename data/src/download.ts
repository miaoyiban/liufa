import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

export const SOURCE_URL =
  'https://sendlaw.moj.gov.tw/PublicData/GetFile.ashx?DType=XML&AuData=CF';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function extractXml(zip: Uint8Array): string {
  const files = unzipSync(zip);
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith('.xml'));
  if (!name) {
    throw new Error(`壓縮檔中找不到 .xml,內含:${Object.keys(files).join('、')}`);
  }
  const text = new TextDecoder('utf-8').decode(files[name]!);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export async function downloadSource(cacheDir: string): Promise<string> {
  mkdirSync(cacheDir, { recursive: true });
  const xmlPath = join(cacheDir, 'FalV.xml');

  if (existsSync(xmlPath) && Date.now() - statSync(xmlPath).mtimeMs < CACHE_TTL_MS) {
    console.log(`使用快取:${xmlPath}`);
    return xmlPath;
  }

  console.log(`下載 ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`下載失敗:HTTP ${res.status} ${res.statusText}`);

  const zip = new Uint8Array(await res.arrayBuffer());
  console.log(`  壓縮檔 ${(zip.length / 1048576).toFixed(1)} MB`);
  const xml = extractXml(zip);
  writeFileSync(xmlPath, xml, 'utf8');
  console.log(`  解壓後 ${(xml.length / 1048576).toFixed(1)} MB → ${xmlPath}`);
  return xmlPath;
}
