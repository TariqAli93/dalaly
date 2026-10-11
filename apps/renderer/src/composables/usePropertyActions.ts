import type { PropertyRecord } from "../types";
import * as service from "../services/properties.service";
import { useConfirm } from "./useConfirm";
import { useSnackbar } from "./useSnackbar";
import { usePermissions } from "./usePermissions";

export function usePropertyActions(
  onChanged: (
    action: "archive" | "restore" | "delete",
    property: PropertyRecord,
  ) => void | Promise<void>,
) {
  const { openConfirm } = useConfirm();
  const { notifySuccess } = useSnackbar();
  const { can } = usePermissions();
  function askArchive(property: PropertyRecord) {
    if (!can("properties.archive")) return;
    openConfirm({
      title: `أرشفة ${property.code}`,
      body: "سيبقى العرض محفوظاً لكنه لن يظهر في القائمة الافتراضية.",
      confirmText: "أرشفة",
      color: "warning",
      onConfirm: async () => {
        await service.archiveProperty(property.id);
        await onChanged("archive", property);
        notifySuccess("تمت أرشفة العرض.");
      },
    });
  }
  function askRestore(property: PropertyRecord) {
    if (!can("properties.restore")) return;
    openConfirm({
      title: `إرجاع ${property.code}`,
      body: "هل تريد إرجاع هذا العرض إلى حالة متاح؟",
      confirmText: "إرجاع",
      color: "success",
      onConfirm: async () => {
        await service.restoreProperty(property.id);
        await onChanged("restore", property);
        notifySuccess("تم إرجاع العرض إلى المتاح.");
      },
    });
  }
  function askDelete(property: PropertyRecord) {
    if (!can("properties.delete")) return;
    openConfirm({
      title: `حذف ${property.code}`,
      body: "سيتم حذف العرض نهائياً من قاعدة البيانات. لا يمكن التراجع عن هذه العملية.",
      confirmText: "حذف",
      color: "error",
      onConfirm: async () => {
        await service.deleteProperty(property.id);
        await onChanged("delete", property);
        notifySuccess("تم حذف العرض.");
      },
    });
  }
  return { askArchive, askRestore, askDelete };
}
