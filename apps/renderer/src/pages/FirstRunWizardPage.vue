<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getErrorMessage } from "../services/api.service";
import { useSetup } from "../composables/useSetup";
import { useSnackbar } from "../composables/useSnackbar";
import FirstRunLayout from "../layouts/FirstRunLayout.vue";
import DatabaseSetupForm from "../components/setup/DatabaseSetupForm.vue";
import SetupAdminForm from "../components/setup/SetupAdminForm.vue";
import FirstAdminResultDialog from "../components/setup/FirstAdminResultDialog.vue";
import type { DatabaseSetupInput } from "../types";

const router = useRouter();
const { status, fetchStatus, testPostgres, initialize, createFirstAdmin } =
  useSetup();
const { notifySuccess, notifyError } = useSnackbar();

// adminOnly: قاعدة البيانات مهيأة والجداول موجودة لكن لا يوجد مستخدم بعد.
const adminOnly = computed(
  () =>
    Boolean(status.value?.db_connected) &&
    Boolean(status.value?.users_table_exists) &&
    !status.value?.admin_exists,
);

const step = ref(1);

const dbForm = ref<DatabaseSetupInput>({
  host: "127.0.0.1",
  port: "5432",
  adminUsername: "postgres",
  adminPassword: "",
  databaseName: "dalaly",
});

const adminForm = ref({ username: "admin", pin: "" });

const testing = ref(false);
const testMessage = ref<{ type: "success" | "error"; text: string } | null>(
  null,
);

const initializing = ref(false);
const stages = ref([
  { key: "test", label: "اختبار الاتصال", done: false },
  { key: "database", label: "إنشاء قاعدة البيانات", done: false },
  { key: "migrations", label: "تشغيل migrations", done: false },
  { key: "admin", label: "إنشاء المستخدم الأول", done: false },
  { key: "finish", label: "إنهاء الإعداد", done: false },
]);

const resultDialog = ref(false);
const resultData = ref<{ username: string; pin: string | null }>({
  username: "",
  pin: null,
});

onMounted(async () => {
  if (!status.value) {
    await fetchStatus().catch(() => undefined);
  }
  if (adminOnly.value) {
    step.value = 3;
  }
});

async function runTest() {
  testing.value = true;
  testMessage.value = null;
  try {
    const result = await testPostgres(dbForm.value);
    testMessage.value = {
      type: "success",
      text: result.database_exists
        ? "تم الاتصال. قاعدة البيانات موجودة وسيتم استخدامها."
        : "تم الاتصال. سيتم إنشاء قاعدة البيانات.",
    };
  } catch (error) {
    testMessage.value = { type: "error", text: getErrorMessage(error) };
  } finally {
    testing.value = false;
  }
}

function markStagesDone() {
  stages.value = stages.value.map((stage) => ({ ...stage, done: true }));
}

async function runInitialize() {
  initializing.value = true;
  stages.value = stages.value.map((stage) => ({ ...stage, done: false }));
  try {
    if (adminOnly.value) {
      await createFirstAdmin(adminForm.value.username, adminForm.value.pin);
      resultData.value = {
        username: adminForm.value.username,
        pin: adminForm.value.pin,
      };
    } else {
      const result = await initialize({
        ...dbForm.value,
        firstAdminUsername: adminForm.value.username,
        firstAdminPin: adminForm.value.pin,
      });
      resultData.value = { username: result.admin.username, pin: result.admin.pin };
    }
    markStagesDone();
    await fetchStatus().catch(() => undefined);
    resultDialog.value = true;
    notifySuccess("تم إعداد النظام بنجاح.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    initializing.value = false;
  }
}

async function goToLogin() {
  resultDialog.value = false;
  await fetchStatus().catch(() => undefined);
  await router.replace("/login");
}
</script>

<template>
  <FirstRunLayout>
    <v-stepper
      v-model="step"
      :items="
        adminOnly
          ? ['أول مستخدم', 'تهيئة']
          : ['ترحيب', 'قاعدة البيانات', 'أول مستخدم', 'تهيئة']
      "
      flat
      hide-actions
    >
      <!-- الخطوة 1: ترحيب (تظهر فقط في الوضع الكامل) -->
      <template v-if="!adminOnly" #item.1>
        <div class="pa-2">
          <div class="text-h6 mb-2">مرحباً بك في دلالي</div>
          <p class="text-body-2 text-medium-emphasis mb-4">
            سنقوم بتهيئة قاعدة البيانات وإنشاء أول مستخدم. تأكد من تشغيل خادم
            PostgreSQL على هذا الجهاز قبل المتابعة.
          </p>
          <v-alert
            v-if="status?.app_version"
            variant="tonal"
            class="mb-2"
            :text="`إصدار التطبيق: ${status.app_version}`"
          />
          <div class="d-flex justify-end">
            <v-btn color="primary" append-icon="mdi-arrow-left" @click="step = 2">
              التالي
            </v-btn>
          </div>
        </div>
      </template>

      <!-- الخطوة 2: إعداد قاعدة البيانات -->
      <template v-if="!adminOnly" #item.2>
        <div class="pa-2">
          <DatabaseSetupForm
            v-model="dbForm"
            :testing="testing"
            @test="runTest"
          />
          <v-alert
            v-if="testMessage"
            :type="testMessage.type"
            variant="tonal"
            class="mt-3"
            :text="testMessage.text"
          />
          <div class="d-flex justify-space-between mt-4">
            <v-btn variant="text" @click="step = 1">السابق</v-btn>
            <v-btn color="primary" append-icon="mdi-arrow-left" @click="step = 3">
              التالي
            </v-btn>
          </div>
        </div>
      </template>

      <!-- خطوة المستخدم الأول -->
      <template #item.3>
        <div class="pa-2">
          <SetupAdminForm v-model="adminForm" />
          <div class="d-flex justify-space-between mt-4">
            <v-btn v-if="!adminOnly" variant="text" @click="step = 2">
              السابق
            </v-btn>
            <v-spacer v-else />
            <v-btn color="primary" append-icon="mdi-arrow-left" @click="step = 4">
              التالي
            </v-btn>
          </div>
        </div>
      </template>

      <!-- خطوة التنفيذ -->
      <template #item.4>
        <div class="pa-2">
          <div class="text-h6 mb-3">إنشاء وتهيئة النظام</div>
          <v-list density="compact" class="mb-3">
            <v-list-item
              v-for="stage in stages"
              :key="stage.key"
              :title="stage.label"
            >
              <template #prepend>
                <v-icon
                  :icon="
                    stage.done
                      ? 'mdi-check-circle'
                      : 'mdi-circle-outline'
                  "
                  :color="stage.done ? 'success' : undefined"
                />
              </template>
            </v-list-item>
          </v-list>
          <v-progress-linear
            v-if="initializing"
            indeterminate
            color="primary"
            class="mb-3"
            rounded
          />
          <div class="d-flex justify-space-between">
            <v-btn variant="text" :disabled="initializing" @click="step = 3">
              السابق
            </v-btn>
            <v-btn
              color="primary"
              :loading="initializing"
              prepend-icon="mdi-cog-play-outline"
              @click="runInitialize"
            >
              إنشاء وتهيئة النظام
            </v-btn>
          </div>
        </div>
      </template>
    </v-stepper>

    <FirstAdminResultDialog
      v-model="resultDialog"
      :username="resultData.username"
      :pin="resultData.pin"
      @go-login="goToLogin"
    />
  </FirstRunLayout>
</template>
