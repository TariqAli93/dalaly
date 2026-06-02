<script setup lang="ts">
import { useSnackbar } from "../../composables/useSnackbar";
import {
  buildAdText,
  buildPropertyText,
  buildWhatsappText,
  copyText,
  downloadTextFile,
  exportPdf,
  printDocument,
} from "../../utils/exportProperty";
import type { PropertyRecord } from "../../types";

const props = defineProps<{ property: PropertyRecord }>();

const { notifySuccess, notifyError } = useSnackbar();

function title() {
  return `تفاصيل العرض ${props.property.code}`;
}

function doPrint() {
  printDocument(title(), buildPropertyText(props.property));
}

async function doPdf() {
  try {
    await exportPdf(`${props.property.code}.pdf`, title(), buildPropertyText(props.property));
    notifySuccess("تم تجهيز ملف PDF.");
  } catch {
    notifyError("تعذر تصدير PDF.");
  }
}

function doTxt() {
  downloadTextFile(`${props.property.code}.txt`, buildPropertyText(props.property));
  notifySuccess("تم تنزيل ملف TXT.");
}

async function doWhatsapp() {
  try {
    await copyText(buildWhatsappText(props.property));
    notifySuccess("تم نسخ نص الواتساب.");
  } catch {
    notifyError("تعذر النسخ.");
  }
}

async function doAd() {
  try {
    await copyText(buildAdText(props.property));
    notifySuccess("تم نسخ وصف الإعلان.");
  } catch {
    notifyError("تعذر النسخ.");
  }
}
</script>

<template>
  <v-menu>
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        variant="tonal"
        prepend-icon="mdi-export-variant"
        append-icon="mdi-chevron-down"
      >
        تصدير
      </v-btn>
    </template>
    <v-list min-width="240">
      <v-list-item prepend-icon="mdi-printer" title="طباعة" @click="doPrint" />
      <v-list-item prepend-icon="mdi-file-pdf-box" title="تصدير PDF" @click="doPdf" />
      <v-list-item prepend-icon="mdi-file-document-outline" title="تصدير TXT" @click="doTxt" />
      <v-divider />
      <v-list-item prepend-icon="mdi-whatsapp" title="نسخ للواتساب" @click="doWhatsapp" />
      <v-list-item prepend-icon="mdi-bullhorn-outline" title="نسخ وصف الإعلان" @click="doAd" />
    </v-list>
  </v-menu>
</template>
