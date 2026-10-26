import type { RentalRecord } from "../types";
import * as service from "../services/rentals.service";
import { useConfirm } from "./useConfirm";
import { useSnackbar } from "./useSnackbar";
import { usePermissions } from "./usePermissions";

/** أرشفة عرض إيجاري وإرجاعه وحذفه بعد تأكيد، كما في usePropertyActions. */
export function useRentalActions(
  onChanged: (
    action: "archive" | "restore" | "delete",
    rental: RentalRecord,
  ) => void | Promise<void>,
) {
  const { openConfirm } = useConfirm();
  const { notifySuccess } = useSnackbar();
  const { can } = usePermissions();
  function askArchive(rental: RentalRecord) {
    if (!can("rentals.archive")) return;
    openConfirm({
      title: `أرشفة ${rental.code}`,
      body: "سيبقى العرض محفوظاً لكنه لن يظهر في القائمة الافتراضية. تجده بتصفية الحالة «مؤرشف».",
      confirmText: "أرشفة",
      color: "warning",
      onConfirm: async () => {
        await service.archiveRental(rental.id);
        await onChanged("archive", rental);
        notifySuccess("تمت أرشفة العرض الإيجاري.");
      },
    });
  }
  function askRestore(rental: RentalRecord) {
    if (!can("rentals.restore")) return;
    openConfirm({
      title: `إرجاع ${rental.code}`,
      body: "هل تريد إرجاع هذا العرض الإيجاري إلى حالة متاح؟",
      confirmText: "إرجاع",
      color: "success",
      onConfirm: async () => {
        await service.restoreRental(rental.id);
        await onChanged("restore", rental);
        notifySuccess("تم إرجاع العرض الإيجاري إلى المتاح.");
      },
    });
  }
  function askDelete(rental: RentalRecord) {
    if (!can("rentals.delete")) return;
    openConfirm({
      title: `حذف ${rental.code}`,
      body: "سيُحذف العرض الإيجاري وصوره ومتابعاته نهائياً. لا يمكن التراجع عن هذه العملية.",
      confirmText: "حذف",
      color: "error",
      onConfirm: async () => {
        await service.deleteRental(rental.id);
        await onChanged("delete", rental);
        notifySuccess("تم حذف العرض الإيجاري.");
      },
    });
  }
  return { askArchive, askRestore, askDelete };
}
