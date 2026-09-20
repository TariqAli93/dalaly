/**
 * عقد واحد لكل ما يحتاج نظام تشغيل حقيقي (حوارات الملفات، الطباعة إلى PDF،
 * جدولة النسخ). يُنفَّذ مرتين: عبر جسر Electron، وعبر المتصفح في وضع العرض.
 */
export type SaveResult = {
  ok: boolean;
  /** المسار على القرص — متاح في Electron فقط. */
  path?: string;
  canceled?: boolean;
  message?: string;
  /** true عندما نُفّذت العملية ببديل ويب (تنزيل/طباعة) لا بحوار نظام. */
  fallback?: boolean;
};

export type PickedFile = {
  /** مسار الملف على القرص (Electron)، أو "" في المتصفح. */
  path?: string;
  /** محتوى الملف كـ data URL (المتصفح فقط). */
  data?: string;
  /** اسم يُعرض للمستخدم. */
  name?: string;
  canceled?: boolean;
};

export type PickedFolder = {
  path?: string;
  canceled?: boolean;
};

export type ScheduledBackupConfig = Record<string, unknown>;
export type SaveFileFilter = { name: string; extensions: string[] };
export type FolderExportFile = { name: string; data: Uint8Array };

export interface PlatformAdapter {
  /** اسم المنصّة — للعرض والتشخيص فقط. */
  readonly name: "electron" | "web-demo" | "browser";

  /** هل نحن داخل تطبيق سطح المكتب؟ */
  readonly isDesktop: boolean;

  /** حفظ مستند HTML كـ PDF. في المتصفح: تنزيل ملف قابل للطباعة. */
  exportPdf(input: {
    html: string;
    suggestedName: string;
    title: string;
    text: string;
  }): Promise<SaveResult>;

  saveFile(input: {
    data: Uint8Array;
    suggestedName: string;
    title: string;
    filters: SaveFileFilter[];
  }): Promise<SaveResult>;

  exportFolder(input: {
    files: FolderExportFile[];
    suggestedFolderName: string;
    title: string;
  }): Promise<SaveResult>;

  /** اختيار مسار حفظ نسخة احتياطية. غير مدعوم في المتصفح. */
  chooseBackupExportPath(): Promise<{ canceled?: boolean; filePath?: string }>;

  /** اختيار ملف نسخة احتياطية (.zip). */
  pickBackupFile(): Promise<PickedFile>;

  /** اختيار مجلد على القرص. غير مدعوم في المتصفح. */
  pickFolder(): Promise<PickedFolder>;

  /** جدولة النسخ الاحتياطي بالبريد — Electron فقط. */
  readonly supportsScheduledBackup: boolean;
  getScheduledBackup(): Promise<ScheduledBackupConfig | null>;
  saveScheduledBackup(config: ScheduledBackupConfig): Promise<{ ok: boolean }>;

  /** حفظ DATABASE_URL محلياً بعد First Run Wizard — Electron فقط. */
  saveDatabaseUrl(databaseUrl: string): Promise<{ ok: boolean; message?: string }>;

  /**
   * رسالة تُعرض للمستخدم عندما تكون الوظيفة غير متاحة على هذه المنصّة.
   * ترجع null إن كانت الوظيفة مدعومة.
   */
  unavailableReason(feature: string): string | null;
}
