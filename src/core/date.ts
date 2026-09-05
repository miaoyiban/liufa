/**
 * 法規異動日期一律以 yyyymmdd 儲存,顯示時轉為可讀的 yyyy-mm-dd。
 * 格式不符時原樣回傳,不拋錯——呼叫端(閱讀區標頭、修法警示)各自決定
 * 「看不懂就照樣顯示」是否合理,這裡只負責格式轉換本身。
 */
export function formatLawDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
