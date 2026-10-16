/**
 * 機能のオン・オフ。止めた機能は、コードを消さずに、ここで false にしておく（true に戻せば、再開できる）。
 */
export const FEATURES = {
  /** 防災モード（避難所・緊急避難場所・給水ステーション）。データを整備するあいだ、メンテナンス中として止めている */
  disasterMode: false,
} as const
