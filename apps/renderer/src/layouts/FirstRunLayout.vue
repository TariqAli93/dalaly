<script setup lang="ts"></script>

<template>
  <v-main>
    <section class="auth-screen">
      <v-card class="wizard-panel" variant="flat" border>
        <v-card-text class="pa-7">
          <div class="d-flex align-center ga-3 mb-6">
            <v-avatar color="primary" rounded="0">
              <v-icon icon="mdi-rocket-launch-outline" />
            </v-avatar>
            <div>
              <div class="first-run-title">إعداد دلالي لأول مرة</div>
              <div class="text-body-2 text-medium-emphasis">
                سنقوم بتهيئة قاعدة البيانات وإنشاء أول مستخدم.
              </div>
            </div>
          </div>
          <slot />
        </v-card-text>
      </v-card>
    </section>
  </v-main>
</template>

<style scoped>
/* عنوان الشاشة بخط العناوين وبلونها، كعناوين الأقسام في دليل الهوية. */
.first-run-title {
  font-family: var(--dal-display-font);
  font-size: calc(24px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.4;
  color: var(--dal-heading);
}
</style>
