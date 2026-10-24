/**
 * جسم أي رد خطأ من الخادم: رمز ثابت ورسالة عربية للعرض، ومع أخطاء التحقق
 * قائمة الحقول المرفوضة.
 */
export type ApiErrorBody = {
  code: string;
  message: string;
  issues?: Array<{ field: string; message: string }>;
};
