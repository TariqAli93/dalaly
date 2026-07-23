<script setup lang="ts">
import { ref } from "vue";
import { useSnackbar } from "../../composables/useSnackbar";
import {
  downloadTextFile,
  exportPdf,
  printDocument,
} from "../../utils/exportProperty";

const open = defineModel<boolean>({ required: true });

const props = defineProps<{
  username: string;
  pin: string | null;
}>();

const emit = defineEmits<{ "go-login": [] }>();

const { notifySuccess, notifyError } = useSnackbar();
const copied = ref(false);

const TITLE = "بيانات الدخول - دلالي";
function credentialsText() {
  return `اسم المستخدم: ${props.username}\nرمز PIN: ${props.pin ?? ""}\n\nاحفظ هذه البيانات في مكان آمن. لن يظهر الرمز مرة أخرى.`;
}

async function copyCredentials() {
  try {
    await navigator.clipboard.writeText(credentialsText());
    copied.value = true;
    notifySuccess("تم نسخ بيانات الدخول.");
  } catch {
    notifyError("تعذر النسخ. انسخ البيانات يدوياً.");
  }
}

function saveTxt() {
  downloadTextFile("dalaly-login.txt", credentialsText());
  notifySuccess("تم تنزيل ملف TXT.");
}

async function savePdf() {
  try {
    await exportPdf("dalaly-login.pdf", TITLE, credentialsText());
    notifySuccess("تم تجهيز ملف PDF.");
  } catch {
    notifyError("تعذر تصدير PDF.");
  }
}

function printCredentials() {
  printDocument(TITLE, credentialsText());
}
</script>

<template>
  <v-dialog v-model="open" width="460" persistent>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-check-circle" color="success" />
        <span>تم إنشاء المستخدم الأول</span>
      </v-card-title>
      <v-card-text>
        <v-alert
          type="warning"
          variant="tonal"
          class="mb-4"
          text="احفظ هذه البيانات الآن. لن يظهر الـ PIN مرة أخرى."
        />
        <div class="detail-grid">
          <div class="detail-item">
            <div class="detail-label">Username</div>
            <div class="detail-value">{{ username }}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">PIN</div>
            <div class="detail-value money">{{ pin ?? "—" }}</div>
          </div>
        </div>
      </v-card-text>
      <v-card-actions class="flex-wrap ga-2">
        <v-btn
          variant="tonal"
          :prepend-icon="copied ? 'mdi-check' : 'mdi-content-copy'"
          @click="copyCredentials"
        >
          نسخ
        </v-btn>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-file-document-outline"
          @click="saveTxt"
        >
          TXT
        </v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-file-pdf-box" @click="savePdf">
          PDF
        </v-btn>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-printer"
          @click="printCredentials"
        >
          طباعة
        </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-login"
          @click="emit('go-login')"
        >
          تسجيل الدخول
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
