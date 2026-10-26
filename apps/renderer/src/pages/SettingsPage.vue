<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PhoneField from "../components/app/PhoneField.vue";
import FormSection from "../components/shared/FormSection.vue";
import SettingsSection from "../components/settings/SettingsSection.vue";
import { getErrorMessage } from "../services/api.service";
import * as remoteService from "../services/remote.service";
import type { RemoteStatus } from "../services/remote.service";

import { useAuth } from "../composables/useAuth";
import { usePermissions } from "../composables/usePermissions";
import { useSetup } from "../composables/useSetup";
import { useSnackbar } from "../composables/useSnackbar";
import { useConfirm } from "../composables/useConfirm";
import { useRefresh } from "../composables/useRefresh";
import { useIdleLock } from "../composables/useIdleLock";
import ChangePinDialog from "../components/auth/ChangePinDialog.vue";
import BackupSettings from "../components/setup/BackupSettings.vue";
import ScheduledBackupSettings from "../components/setup/ScheduledBackupSettings.vue";
import * as companyService from "../services/company-settings.service";
import { readFileAsDataUrl } from "../utils/files";
import AppearanceSettings from "../components/settings/AppearanceSettings.vue";

/**
 * الإعدادات: لوح واحد بتبويبات، وكل تبويب أقسام مفصولة بخطوط رفيعة. حقول
 * المكتب للقراءة فقط بلا settings.update، والاتصال الخارجي يُؤكَّد قبل
 * تشغيله ويحتاج remote_access.manage.
 */
const router = useRouter();

const { currentUser, logout } = useAuth();
const { can } = usePermissions();
const { status } = useSetup();
const { notifySuccess, notifyError } = useSnackbar();
const { openConfirm } = useConfirm();
const { setRefreshHandler } = useRefresh();
const { idleMinutes, setIdleMinutes } = useIdleLock();

const settingsTab = ref("appearance");
const changePinOpen = ref(false);
const idleOptions = [
  { title: "بدون قفل", value: 0 },
  { title: "5 دقائق", value: 5 },
  { title: "15 دقيقة", value: 15 },
  { title: "30 دقيقة", value: 30 },
  { title: "60 دقيقة", value: 60 },
];
const company = ref({
  company_name: "",
  owner_name: "",
  phone_primary: "",
  phone_secondary: "",
  email: "",
  address: "",
  additional_contact: "",
  license_number: "",
});
const companySaving = ref(false);
const logoUploading = ref(false);
const companyLogo = ref<File | null>(null);
const companyError = ref<string | null>(null);
const canEditCompany = computed(() => can("settings.update"));

async function lockNow() {
  await logout();
  await router.push("/login");
}

const remoteStatus = ref<RemoteStatus>({
  running: false,
  url: null,
  message: null,
});
const remoteBusy = ref(false);

async function loadRemote() {
  try {
    remoteStatus.value = await remoteService.fetchRemoteStatus();
  } catch (error) {
    remoteStatus.value.message = getErrorMessage(error);
  }
}

async function enableRemote() {
  remoteBusy.value = true;
  try {
    remoteStatus.value = await remoteService.enableRemote();
    notifySuccess(
      remoteStatus.value.message ?? "تم طلب تشغيل الاتصال الخارجي.",
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    remoteBusy.value = false;
  }
}
// تشغيل الاتصال يفتح البرنامج على الإنترنت: يُسأل المستخدم أولاً.
function askEnableRemote() {
  openConfirm({
    title: "تشغيل الاتصال الخارجي",
    body: "سيصبح دلالي متاحاً عبر رابط على الإنترنت ما دام الاتصال يعمل، ويحتاج من يفتحه إلى اسم مستخدم ورمز سري. شغّله حين تحتاجه فقط، وأوقفه بعد الانتهاء.",
    confirmText: "تشغيل",
    color: "warning",
    onConfirm: enableRemote,
  });
}

async function disableRemote() {
  remoteBusy.value = true;
  try {
    remoteStatus.value = await remoteService.disableRemote();
    notifySuccess("تم إيقاف الاتصال الخارجي.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    remoteBusy.value = false;
  }
}
async function copyRemoteUrl() {
  if (!remoteStatus.value.url) return;
  try {
    await navigator.clipboard.writeText(remoteStatus.value.url);
    notifySuccess("نُسخ رابط الاتصال الخارجي.");
  } catch {
    notifyError("تعذر النسخ. حدّد الرابط وانسخه يدوياً.");
  }
}

async function loadCompany() {
  companyError.value = null;
  try {
    const value = await companyService.getCompanySettings();
    company.value = {
      company_name: value.company_name,
      owner_name: value.owner_name ?? "",
      phone_primary: value.phone_primary ?? "",
      phone_secondary: value.phone_secondary ?? "",
      email: value.email ?? "",
      address: value.address ?? "",
      additional_contact: value.additional_contact ?? "",
      license_number: value.license_number ?? "",
    };
  } catch (error) {
    companyError.value = getErrorMessage(error);
  }
}
async function saveCompany() {
  if (companySaving.value || companyError.value) return;
  companySaving.value = true;
  try {
    await companyService.updateCompanySettings(company.value);
    notifySuccess("تم حفظ معلومات المكتب.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    companySaving.value = false;
  }
}
async function uploadCompanyLogo() {
  if (!companyLogo.value) return;
  logoUploading.value = true;
  try {
    await companyService.uploadLogo({
      data: await readFileAsDataUrl(companyLogo.value),
      original_name: companyLogo.value.name,
      file_type: companyLogo.value.type || "image/png",
    });
    companyLogo.value = null;
    notifySuccess("تم تحديث شعار المكتب.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    logoUploading.value = false;
  }
}

const systemItems = computed(() => [
  { label: "الإصدار", value: status.value?.app_version ?? "0.1.0", ltr: true },
  { label: "قاعدة البيانات", value: "محلية على هذا الجهاز" },
  {
    label: "المستخدم الحالي",
    value: currentUser.value?.display_name || currentUser.value?.username,
  },
  { label: "اسم الدخول", value: currentUser.value?.username, ltr: true },
]);

onMounted(() => {
  setRefreshHandler(() => {
    void loadCompany();
    return loadRemote();
  });
  if (can("settings.read")) void loadRemote();
  if (can("settings.read")) void loadCompany();
});
</script>

<template>
  <AppPage title="الإعدادات">
    <section class="dal-panel" aria-label="الإعدادات">
      <v-tabs v-model="settingsTab" color="primary" show-arrows>
        <v-tab value="appearance" prepend-icon="mdi-palette-outline"
          >المظهر</v-tab
        >
        <v-tab value="company" prepend-icon="mdi-office-building-outline"
          >معلومات المكتب</v-tab
        >
        <v-tab value="security" prepend-icon="mdi-shield-lock-outline"
          >الأمان</v-tab
        >
        <v-tab value="backups" prepend-icon="mdi-database-outline"
          >النسخ الاحتياطي</v-tab
        >
        <v-tab value="system" prepend-icon="mdi-information-outline"
          >النظام والاتصال</v-tab
        >
      </v-tabs>
      <v-divider />
      <v-window v-model="settingsTab">
        <v-window-item value="appearance">
          <AppearanceSettings />
        </v-window-item>

        <v-window-item value="company">
          <SettingsSection
            title="معلومات المكتب"
            description="تظهر في المستندات المطبوعة والملفات المصدّرة."
          >
            <v-alert
              v-if="companyError"
              type="error"
              variant="tonal"
              density="compact"
              class="mb-3"
            >
              تعذر تحميل معلومات المكتب، والحفظ متوقف كي لا تُستبدل بالحقول
              الفارغة: {{ companyError }}
              <template #append>
                <v-btn variant="text" size="small" @click="loadCompany"
                  >إعادة المحاولة</v-btn
                >
              </template>
            </v-alert>
            <v-alert
              v-else-if="!canEditCompany"
              type="info"
              variant="tonal"
              density="compact"
              class="mb-3"
              text="للعرض فقط: تعديل معلومات المكتب يحتاج صلاحية تعديل الإعدادات."
            />
            <v-form @submit.prevent="saveCompany">
              <FormSection title="المكتب" :columns="2">
                <v-text-field
                  v-model="company.company_name"
                  label="اسم المكتب"
                  :readonly="!canEditCompany"
                  hide-details="auto"
                />
                <v-text-field
                  v-model="company.owner_name"
                  label="اسم صاحب المكتب"
                  :readonly="!canEditCompany"
                  hide-details="auto"
                />
                <v-text-field
                  v-model="company.license_number"
                  label="رقم الإجازة أو الترخيص"
                  :readonly="!canEditCompany"
                  hide-details="auto"
                />
              </FormSection>
              <FormSection title="الاتصال" :columns="2">
                <PhoneField
                  v-model="company.phone_primary"
                  label="الهاتف الأساسي"
                  :readonly="!canEditCompany"
                  hide-details="auto"
                />
                <PhoneField
                  v-model="company.phone_secondary"
                  label="هاتف إضافي"
                  :readonly="!canEditCompany"
                  hide-details="auto"
                />
                <v-text-field
                  v-model="company.email"
                  type="email"
                  label="البريد الإلكتروني"
                  :readonly="!canEditCompany"
                  hide-details="auto"
                />
                <v-text-field
                  v-model="company.additional_contact"
                  label="معلومات اتصال إضافية"
                  :readonly="!canEditCompany"
                  hide-details="auto"
                />
                <v-text-field
                  v-model="company.address"
                  class="form-section__wide"
                  label="العنوان"
                  :readonly="!canEditCompany"
                  hide-details="auto"
                />
              </FormSection>
              <div v-if="canEditCompany" class="settings-actions">
                <v-btn
                  color="primary"
                  variant="flat"
                  type="submit"
                  :loading="companySaving"
                  :disabled="!!companyError"
                  prepend-icon="mdi-content-save-outline"
                  >حفظ المعلومات</v-btn
                >
              </div>
            </v-form>
          </SettingsSection>
          <SettingsSection
            title="شعار المكتب"
            description="صورة PNG أو JPG تظهر في رأس المستندات المطبوعة."
          >
            <div class="settings-logo">
              <v-file-input
                v-model="companyLogo"
                label="ملف الشعار"
                accept="image/*"
                :disabled="!canEditCompany"
                hide-details
                class="settings-logo__input"
              />
              <v-btn
                v-if="canEditCompany"
                variant="tonal"
                prepend-icon="mdi-upload"
                :loading="logoUploading"
                :disabled="!companyLogo"
                @click="uploadCompanyLogo"
                >رفع الشعار</v-btn
              >
            </div>
          </SettingsSection>
        </v-window-item>

        <v-window-item value="security">
          <SettingsSection
            title="الرمز السري للدخول"
            description="غيّر رمز الدخول الخاص بك. يطلب البرنامج الرمز الحالي أولاً."
          >
            <template v-if="can('security.change_pin')" #actions>
              <v-btn
                variant="tonal"
                prepend-icon="mdi-form-textbox-password"
                @click="changePinOpen = true"
                >تغيير الرمز السري</v-btn
              >
            </template>
            <p v-if="!can('security.change_pin')" class="settings-muted">
              تغيير الرمز السري غير متاح لحسابك.
            </p>
          </SettingsSection>
          <SettingsSection
            title="القفل التلقائي"
            description="يسجّل البرنامج خروجك بعد مدة بلا استخدام على هذا الجهاز، وتُحفظ تعديلات النموذج المفتوح لتستعيدها بعد الدخول."
          >
            <v-select
              :model-value="idleMinutes"
              :items="idleOptions"
              label="تسجيل الخروج بعد خمول"
              hide-details
              class="settings-narrow"
              @update:model-value="setIdleMinutes"
            />
          </SettingsSection>
          <SettingsSection
            title="قفل الشاشة الآن"
            description="يسجّل خروجك فوراً، مثلاً قبل أن تترك الجهاز."
          >
            <template #actions>
              <v-btn
                variant="tonal"
                prepend-icon="mdi-lock-outline"
                @click="lockNow"
                >قفل الشاشة</v-btn
              >
            </template>
          </SettingsSection>
        </v-window-item>

        <v-window-item value="backups">
          <BackupSettings />
          <ScheduledBackupSettings v-if="can('backups.schedule')" />
        </v-window-item>

        <v-window-item value="system">
          <SettingsSection title="البرنامج">
            <dl class="settings-facts">
              <div v-for="item in systemItems" :key="item.label">
                <dt>{{ item.label }}</dt>
                <dd>
                  <bdi v-if="item.ltr">{{ item.value || "—" }}</bdi
                  ><template v-else>{{ item.value || "—" }}</template>
                </dd>
              </div>
            </dl>
          </SettingsSection>
          <SettingsSection
            title="الاتصال الخارجي"
            description="رابط مؤقت على الإنترنت يفتح دلالي من خارج المكتب. اختياري، ويعمل البرنامج كاملاً بدونه."
          >
            <template v-if="can('remote_access.manage')" #actions>
              <v-btn
                v-if="!remoteStatus.running"
                color="primary"
                variant="flat"
                prepend-icon="mdi-cloud-upload-outline"
                :loading="remoteBusy"
                @click="askEnableRemote"
                >تشغيل</v-btn
              >
              <v-btn
                v-else
                variant="tonal"
                prepend-icon="mdi-cloud-off-outline"
                :loading="remoteBusy"
                @click="disableRemote"
                >إيقاف</v-btn
              >
            </template>
            <div class="settings-remote">
              <span class="settings-muted">الحالة</span>
              <v-chip
                size="small"
                label
                :color="remoteStatus.running ? 'primary' : undefined"
                variant="tonal"
                >{{ remoteStatus.running ? "يعمل" : "متوقف" }}</v-chip
              >
            </div>
            <div v-if="remoteStatus.url" class="settings-remote">
              <span class="settings-muted">الرابط</span>
              <a
                :href="remoteStatus.url"
                target="_blank"
                rel="noreferrer"
                class="record-link"
                ><bdi>{{ remoteStatus.url }}</bdi></a
              >
              <v-btn
                icon="mdi-content-copy"
                size="small"
                variant="text"
                aria-label="نسخ رابط الاتصال الخارجي"
                title="نسخ الرابط"
                @click="copyRemoteUrl"
              />
            </div>
            <v-alert
              v-if="remoteStatus.message"
              variant="tonal"
              density="compact"
              class="mt-2"
              >{{ remoteStatus.message }}</v-alert
            >
            <p v-if="!can('remote_access.manage')" class="settings-muted mt-2">
              تشغيل الاتصال الخارجي وإيقافه لمدير النظام فقط.
            </p>
          </SettingsSection>
        </v-window-item>
      </v-window>
    </section>
    <ChangePinDialog v-model="changePinOpen" />
  </AppPage>
</template>

<style scoped>
.settings-facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0 24px;
  margin: 0;
}
.settings-facts > div {
  min-width: 0;
  padding: 6px 0;
  border-bottom: 1px solid var(--dal-stroke);
}
.settings-facts dt {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.settings-facts dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.settings-actions {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  padding-top: 12px;
}
.settings-logo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.settings-logo__input {
  flex: 0 1 360px;
}
.settings-narrow {
  max-width: 320px;
}
.settings-muted {
  margin: 0;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
.settings-remote {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.settings-remote .settings-muted {
  min-width: 56px;
}
</style>
